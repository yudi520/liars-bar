/**
 * 骗子酒馆 - 房间注册层 (RoomRegistry.js)
 *
 * 多房间容器化（MULTI_ROOM_PLAN.md v1.6 第 3/5/7 章 + P1：4.5/7.2/7.3/7.4）：
 *  - RoomRegistry 持有 Map<roomId, Room> 与 socketId -> roomId 路由映射；
 *  - Room 薄封装：广播出口、hostId/hostToken、生命周期（TTL 回收）、成员资格；
 *  - 内部复用现有 RoomManager（单房间状态机），规则代码零改动（原则 1）；
 *  - 广播热路径只允许纯内存操作（原则 4），serverInfo 一律读 ServerInfoCache 快照。
 *
 * P1 身份模型（4.5）：player.id = 首次入座时的 socketId（稳定，永不改写），
 * player.socketId = 当前连接。遗留客户端视图按 12 类 ID 副本投影为当前 socketId；
 * 新客户端（已发 CLIENT_HELLO）拿稳定 ID 原样输出。
 *
 * P1 resumeToken（7.2.1）：一次性、可轮换、可撤销、带幂等窗口的短期凭证。
 * 原则：先幂等、后判重放；重放只拒本次、不主动踢人；撤销只能显式触发。
 */

const crypto = require('crypto');
const WebSocket = require('ws');
const RoomManager = require('./RoomManager');

const MAIN_ROOM_ID = 'MAIN';
const ROOM_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 剔除 0/O/1/I
const ROOM_CODE_LENGTH = 5;

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

function envBool(name, def) {
  if (process.env[name] == null) return def;
  return process.env[name] === 'true' || process.env[name] === '1';
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** 键名感知的 ID 投影（4.5）：把稳定 ID 副本替换为当前 socketId（旧客户端视角）。 */
function projectStateForViewer(state, players) {
  const idMap = new Map(players.map(p => [p.id, p.socketId || p.id]));
  function project(node, key) {
    if (Array.isArray(node)) return node.map(v => project(v, key));
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = project(v, k);
      return out;
    }
    // 只替换“键名是 id/xxxId”的字符串，避免误伤名字、战报文本、卡牌 id
    if (typeof node === 'string' && /^(id|[a-z][a-zA-Z0-9]*Id)$/.test(key) && idMap.has(node)) {
      return idMap.get(node);
    }
    return node;
  }
  return project(state, null);
}

/**
 * 带错误码的业务异常（4.3）。统一由 EmbeddedServer 捕获并回 ERROR 消息。
 */
class RoomError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/**
 * 连接级路由会话（原则 2：路由信息挂在连接上，不放在每条消息里）。
 */
function createSocketSession({ socketId, ip }) {
  return {
    socketId,
    ip: ip || null,
    roomId: null,
    playerId: null,          // P1：稳定玩家 ID；P0 语义下等于 socketId
    hostToken: null,
    resumeToken: null,
    legacy: true,            // 未发 CLIENT_HELLO 的客户端一律按旧协议投影（安全默认）
    joinedAt: Date.now(),
    rate: { tokens: 20, lastRefill: Date.now(), violations: 0 }, // 7.4 令牌桶
    passwordFails: 0,
    passwordLockUntil: 0
  };
}

/**
 * 房间：一个 RoomManager 实例 + 成员连接集合 + 广播出口 + 生命周期。
 */
class Room {
  constructor({ id, registry, info, passwordHash = null, passwordSalt = null }) {
    this.id = id;
    this.registry = registry;
    this.info = info;                       // ServerInfoCache 只读引用（3.3）
    this.isMain = id === MAIN_ROOM_ID;
    this.passwordHash = passwordHash;       // P1-2 房间密码（sha256(salt+password)）
    this.passwordSalt = passwordSalt;
    this.createdAt = Date.now();
    this.lastActiveAt = Date.now();
    this.sockets = new Set();               // 本房间全部连接
    this.sessions = new Map();              // ws -> SocketSession
    this.revision = 0;
    this.broadcastScheduled = false;
    this.emptySince = null;                 // 空房回收计时（5.1）
    this.abandonedSince = null;             // 对局中全员掉线计时
    this.hostId = null;                     // 权限判定唯一依据（5.6 硬规则 4），P1 起为稳定 ID
    this.hostEpoch = 1;                     // P1-2：房主纪元，hostId 变更时递增
    this.hostTokenHash = null;
    this.closed = false;

    this.manager = new RoomManager({
      roomId: id,
      broadcast: () => this.scheduleBroadcast(),
      onFatalError: (err) => {
        console.error(`[Room ${this.id}] 定时器回调异常，按 10.1 快速失败关闭房间:`, err);
        this.close('internal_error');
      }
    });
    this._syncHost();
  }

  getStatus() {
    if (this.closed) return 'CLOSED';
    if (this.sockets.size === 0) return 'EMPTY';
    const gs = this.manager.game.status;
    if (gs === 'GAME_OVER') return 'SETTLED';
    if (gs === 'LOBBY') return this.manager.players.length >= 2 ? 'READY' : 'LOBBY';
    return 'PLAYING';
  }

  touch() {
    this.lastActiveAt = Date.now();
    this.emptySince = null;
    this.abandonedSince = null;
  }

  attach(ws, session) {
    this.sockets.add(ws);
    this.sessions.set(ws, session);
    session.roomId = this.id;
    this.registry.socketToRoom.set(session.socketId, this.id);
    this.touch();
  }

  detach(ws, session) {
    this.sockets.delete(ws);
    this.sessions.delete(ws);
    if (this.registry.socketToRoom.get(session.socketId) === this.id) {
      this.registry.socketToRoom.delete(session.socketId);
    }
    if (this.sockets.size === 0) {
      this.emptySince = Date.now();
    }
  }

  sendTo(ws, msg) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------- 广播

  /** 组装带 roomId/revision/self/hostId 的快照（4.4）。遗留客户端按 12 类副本投影。 */
  buildState(session, rev = this.revision) {
    const base = this.manager.getPlayerState(session.playerId);
    const isHost = this.hostId !== null && session.playerId !== null && this.hostId === session.playerId;
    const state = {
      roomId: this.id,
      revision: rev,
      hostId: this.hostId,
      self: {
        socketId: session.socketId,
        playerId: session.playerId,
        isHost
      },
      ...base
    };
    if (session.legacy !== false) {
      return projectStateForViewer(state, this.manager.players);
    }
    return state;
  }

  /** 按房间广播（原则 3）：只推给本房连接，只读 serverInfo 缓存，含背压检查（6.4）。 */
  broadcast() {
    if (this.closed || !this.manager) return;
    const started = Date.now();
    const rev = ++this.revision;
    const serverInfo = this.info.get();
    for (const ws of this.sockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const session = this.sessions.get(ws);
      if (!session || !session.playerId) continue;
      // 背压（6.4）：bufferedAmount 超过高水位的慢客户端直接断开，防止过期帧堆积；
      // 成员清理由 ws close 事件统一走 Room.leave
      if (ws.bufferedAmount !== undefined && ws.bufferedAmount > this.registry.highWaterBytes) {
        this.registry.counters.slow_client_dropped += 1;
        console.warn(`[Room ${this.id}] 慢客户端断开（bufferedAmount=${ws.bufferedAmount}）`);
        try { ws.terminate(); } catch (_) {}
        continue;
      }
      const state = this.buildState(session, rev);
      this.sendTo(ws, { type: 'STATE_UPDATE', serverInfo, state });
    }
    this.registry.recordBroadcast(Date.now() - started);
  }

  /** 合并广播（6.2）：同一 tick 内多次状态变更只产生一帧。 */
  scheduleBroadcast() {
    if (this.broadcastScheduled || this.closed) return;
    this.broadcastScheduled = true;
    setImmediate(() => {
      this.broadcastScheduled = false;
      this.broadcast();
    });
  }

  // ---------------------------------------------------------------- 房间密码（P1-2，7.3）

  setPassword(plainPassword) {
    if (!plainPassword) {
      this.passwordHash = null;
      this.passwordSalt = null;
      return;
    }
    this.passwordSalt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = sha256(this.passwordSalt + String(plainPassword));
  }

  verifyPassword(plainPassword) {
    if (!this.passwordHash) return true;
    if (plainPassword == null || plainPassword === '') return false;
    const attempt = sha256(this.passwordSalt + String(plainPassword));
    // 恒定时间比较
    const a = Buffer.from(attempt);
    const b = Buffer.from(this.passwordHash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** 房间密码失败锁定（7.3）：5 次错误后该连接 60 秒内禁止再试。 */
  checkPasswordLock(session) {
    if (session.passwordLockUntil && Date.now() < session.passwordLockUntil) {
      const secs = Math.ceil((session.passwordLockUntil - Date.now()) / 1000);
      throw new RoomError('RATE_LIMITED', `房间密码错误次数过多，请 ${secs} 秒后再试！`);
    }
  }

  recordPasswordFailure(session) {
    session.passwordFails += 1;
    if (session.passwordFails >= 5) {
      session.passwordFails = 0;
      session.passwordLockUntil = Date.now() + 60 * 1000;
    }
    throw new RoomError('WRONG_PASSWORD', '房间密码错误，请向房主确认后重试！');
  }

  // ---------------------------------------------------------------- 入座 / 离座

  /**
   * 入座。含：房间密码校验（P1-2）、重名三态判定（7.2）、新席位校验、
   * legacy isHost 兼容判定（7.1 四条件）。
   * @returns 入座玩家对象
   */
  join(ws, session, payload = {}, { trustedHost = false } = {}) {
    if (this.closed || !this.manager) {
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在或已解散（服务器重启后房间会消失）。');
    }
    this.checkPasswordLock(session);
    if (!this.verifyPassword(payload.password)) {
      this.recordPasswordFailure(session);
    }
    session.passwordFails = 0;

    const name = String(payload.name || '').trim().slice(0, 12) || `酒客_${Date.now() % 1000}`;
    const avatar = payload.avatar;
    const players = this.manager.players;

    // —— 0. 同一连接重复入座（同 socketId 已有席位）→ 幂等重入 ——
    const ownSeat = players.find(p => p.id === session.socketId);
    if (ownSeat) {
      ownSeat.connected = true;
      ownSeat.isOffline = false;
      ownSeat.isBot = false;
      if (avatar) ownSeat.avatar = avatar;
      session.playerId = ownSeat.id;
      this.attach(ws, session);
      this.registry.issueResumeToken(this, session);
      this._syncHost();
      this.scheduleBroadcast();
      return ownSeat;
    }

    // —— 1. 重名三态 ——
    const seat = players.find(p => p.name === name);
    if (seat) {
      if (!seat.isOffline || seat.connected) {
        throw new RoomError('NAME_TAKEN', `昵称【${name}】已被占用，请换一个名字！`);
      }
      // 席位离线：三条件重绑（旧客户端 + 席位离线 + 同 IP）。不同 IP 统一 NAME_TAKEN，防探测。
      if (!session.ip || !seat.ip || session.ip !== seat.ip) {
        throw new RoomError('NAME_TAKEN', `昵称【${name}】暂时无法使用，请换一个名字！`);
      }
      return this._rebindSeat(ws, session, seat, avatar);
    }

    // —— 2. 新席位前置校验（决策 #4：对局中禁止加入；重绑不受此限）——
    const status = this.manager.game.status;
    if (status !== 'LOBBY' && status !== 'GAME_OVER') {
      throw new RoomError('ROOM_IN_GAME', '对局已开始，禁止中途入座！');
    }
    const maxPlayers = (this.manager.game.config && this.manager.game.config.maxPlayers) || 4;
    if (players.length >= maxPlayers) {
      throw new RoomError('ROOM_FULL', `房间已满（${maxPlayers} 人），无法加入！`);
    }

    // —— 3. legacy isHost 兼容判定（7.1）：仅 MAIN 房 / 单间模式 + 无人类房主 + 开关放行 ——
    // trustedHost（CREATE_ROOM 建房者）在"房内无人类房主"时同样生效，但不计 legacy 指标；
    // 房内已有人类房主时，任何客户端自报 isHost 一律无效（服务端权威）。
    const hasHumanHost = players.some(p => p.isHost && !p.isBot);
    const legacyAllowed = this.registry.allowLegacyHostClaim && (this.isMain || !this.registry.multiRoomEnabled);
    const legacyGrant = !trustedHost && payload.isHost === true && !hasHumanHost && legacyAllowed;
    const claimHost = legacyGrant || (trustedHost === true && !hasHumanHost);
    if (legacyGrant && this.registry.multiRoomEnabled) {
      this.registry.counters.legacy_host_claim += 1;
      console.warn(`[Room ${this.id}] legacy_host_claim 命中: socket=${session.socketId} ip=${session.ip}`);
    }

    const player = this.manager.joinPlayer(session.socketId, {
      name,
      avatar,
      isHost: claimHost,
      mode: claimHost ? payload.mode : undefined,
      config: claimHost ? payload.config : undefined
    });
    player.ip = session.ip;
    player.socketId = session.socketId;   // P1：当前连接指针（id 保持稳定）
    session.playerId = player.id;
    this.attach(ws, session);
    if (player.isHost && !player.isBot) {
      this._issueHostToken(session);
    }
    this._syncHost();                     // 先同步 hostId/hostEpoch
    this.registry.issueResumeToken(this, session);  // 再签发凭证（绑定正确的 hostEpoch）
    this.scheduleBroadcast();
    return player;
  }

  /**
   * P1 name 三条件重绑（5.6 原子重绑 + 4.5 稳定 ID）：
   * player.id 不再改写（对局中的回合指针保持有效），只更新 socketId / 连接状态 / hostId。
   * 重绑成功后关闭旧连接（4001 replaced）并轮换 resumeToken。
   */
  _rebindSeat(ws, session, seat, avatar) {
    if (this.closed || !this.manager) {
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在或已解散。');
    }
    const wasHost = seat.isHost && !seat.isBot;
    seat.socketId = session.socketId;    // P1 稳定 ID：player.id 不变（4.5）
    seat.connected = true;
    seat.isOffline = false;
    seat.isBot = false;
    if (avatar) seat.avatar = avatar;
    seat.ip = session.ip;
    session.playerId = seat.id;
    this.attach(ws, session);

    if (wasHost) {
      this._issueHostToken(session);     // 重新签发，旧 hostToken 立即失效（hostId 不变）
    }
    this._closeStaleSessions(seat.id, session.socketId);
    this._syncHost();
    this.registry.issueResumeToken(this, session);
    this.manager.game.addLog(`👋 玩家【${seat.name}】重新连接上线，收回出战控制权！`);
    this.scheduleBroadcast();
    return seat;
  }

  /** 双活防护：关闭同一玩家的其余连接（按稳定 playerId 匹配）。 */
  _closeStaleSessions(playerId, keepSocketId) {
    for (const [ws, sess] of this.sessions) {
      if (sess.playerId === playerId && sess.socketId !== keepSocketId) {
        try {
          ws.close(4001, 'replaced');
        } catch (_) {
          try { ws.terminate(); } catch (_) {}
        }
        this.detach(ws, sess);
      }
    }
  }

  /**
   * 离座（LEAVE_ROOM / ws close 共用）。
   * - 房主在大厅 / 结算阶段离开：顺位移交给座位号最小的在线人类玩家（5.4）；
   * - 房主对局中断线：保留席位 + AI 托管，**不移交**，hostId 不变（5.4 / 5.6）；
   * - 对局中全员掉线由 2 小时 abandonTtl 回收。
   */
  leave(ws, session) {
    if (this.closed || !this.manager) return;
    const playerId = session.playerId;
    session.playerId = null;
    this.detach(ws, session);
    if (!playerId) return;

    const wasHost = this.hostId === playerId;
    this.manager.disconnectPlayer(playerId);

    const gs = this.manager.game.status;
    const lobbyLike = gs === 'LOBBY' || gs === 'GAME_OVER';
    if (wasHost && this.hostId === playerId && lobbyLike) {
      const next = this.manager.players.find(p => !p.isBot && p.connected);
      if (next) {
        for (const p of this.manager.players) p.isHost = false;
        next.isHost = true;
        console.log(`[Room ${this.id}] 房主离开，顺位移交【${next.name}】`);
      }
    }
    this._syncHost();
    this.scheduleBroadcast();
  }

  /**
   * KICK_PLAYER（会话层）/ REMOVE_PLAYER（座位层，v1.6 起真人统一走本实现）：
   * bot → 座位层移除；真人 → 移除席位 + KICKED 通知 + 断开（防自愈回流）。
   * targetId 接受稳定 playerId 或当前 socketId（旧客户端投影视角）。
   */
  kick(targetId) {
    if (!this.manager || this.closed) {
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在或已解散。');
    }
    if (this.manager.game.status !== 'LOBBY') {
      throw new RoomError('INVALID_ACTION', '仅在大厅阶段可以请离玩家！');
    }
    const target = this.manager.players.find(p => p.id === targetId)
      || this.manager.players.find(p => p.socketId === targetId);
    if (!target) {
      throw new RoomError('INVALID_ACTION', '该玩家不在房间内。');
    }
    if (target.id === this.hostId) {
      throw new RoomError('INVALID_ACTION', '房主不能请离自己，可选择移交或解散房间。');
    }
    this.manager.removePlayer(target.id);
    if (!target.isBot) {
      for (const [ws, sess] of this.sessions) {
        if (sess.playerId === target.id || sess.socketId === target.socketId) {
          this.sendTo(ws, { type: 'KICKED', payload: { roomId: this.id, reason: 'kicked_by_host' } });
          sess.playerId = null;
          this.detach(ws, sess);
          try { ws.close(4002, 'kicked'); } catch (_) {}
        }
      }
    }
    this._syncHost();
    this.scheduleBroadcast();
    return target;
  }

  // ---------------------------------------------------------------- 房主与令牌

  /**
   * TRANSFER_HOST（P1，5.4）：目标必须在线且非 bot。
   * hostEpoch 递增使旧房主凭证全部失效；新 host 重新签发双凭证。
   */
  transferHost(targetId) {
    if (!this.manager || this.closed) {
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在或已解散。');
    }
    const target = this.manager.players.find(p => p.id === targetId)
      || this.manager.players.find(p => p.socketId === targetId);
    if (!target) {
      throw new RoomError('INVALID_ACTION', '目标玩家不在房间内。');
    }
    if (target.isBot || !target.connected) {
      throw new RoomError('INVALID_ACTION', '房主只能移交给在线的真人玩家！');
    }
    if (target.id === this.hostId) {
      throw new RoomError('INVALID_ACTION', '目标已经是房主。');
    }
    for (const p of this.manager.players) p.isHost = false;
    target.isHost = true;
    this._syncHost();
    // 给新房主签发双凭证，并通知其本人
    for (const [ws, sess] of this.sessions) {
      if (sess.playerId === target.id) {
        this._issueHostToken(sess);
        this.registry.issueResumeToken(this, sess);
        this.sendTo(ws, {
          type: 'HOST_TRANSFERRED',
          payload: { roomId: this.id, playerId: target.id, hostToken: sess.hostToken, resumeToken: sess.resumeToken }
        });
      }
    }
    this.manager.game.addLog(`👑 房主已将酒馆移交【${target.name}】！`);
    this.scheduleBroadcast();
    return target;
  }

  _issueHostToken(session) {
    const token = 'ht_' + crypto.randomBytes(32).toString('hex');
    session.hostToken = token;
    this.hostTokenHash = sha256(token);
    return token;
  }

  /** hostId 不变量（5.6）。两种合法房主形态：在线人类房主；对局中断线托管中的房主。 */
  assertHostInvariant() {
    if (this.closed || !this.manager) return false;
    const players = this.manager.players;
    const host = players.find(p => p.isHost && !p.isBot) || players.find(p => p.isHost && p.isOffline);
    const ok = host ? this.hostId === host.id : this.hostId === null;
    if (!ok) {
      console.error(`[Room ${this.id}] hostId 不变量被破坏（hostId=${this.hostId}），关闭房间`);
      this.close('host_state_corrupt');
      return false;
    }
    return true;
  }

  _syncHost() {
    if (this.closed || !this.manager) return;
    const players = this.manager.players;
    const host = players.find(p => p.isHost && !p.isBot) || players.find(p => p.isHost && p.isOffline);
    const nextHostId = host ? host.id : null;
    if (nextHostId !== this.hostId) {
      this.hostEpoch += 1;               // P1-2：房主纪元随 hostId 变更递增
      this.hostId = nextHostId;
    }
    this.assertHostInvariant();
  }

  // ---------------------------------------------------------------- 关闭

  /**
   * 房间关闭（5.3 dispose）：
   * 1. 清空定时器注册表；2. 广播 ROOM_CLOSED（兼容双发 ROOM_DISBANDED）；
   * 3. 从注册表删除；4. 置空 manager 帮助 GC。
   */
  close(reason) {
    if (this.closed) return;
    this.closed = true;
    if (this.manager) {
      this.manager.disposeTimers();
    }
    for (const [ws, sess] of this.sessions) {
      this.sendTo(ws, { type: 'ROOM_CLOSED', payload: { roomId: this.id, reason } });
      this.sendTo(ws, { type: 'ROOM_DISBANDED', message: '房主已解散骗子酒馆房间，已退回大厅。' });
      sess.roomId = null;
      if (this.registry.socketToRoom.get(sess.socketId) === this.id) {
        this.registry.socketToRoom.delete(sess.socketId);
      }
    }
    this.registry.removeRoom(this);
    this.sockets.clear();
    this.sessions.clear();
    this.manager = null;
  }
}

/**
 * 房间注册表。
 */
class RoomRegistry {
  constructor({
    info,
    multiRoomEnabled = false,
    allowLegacyHostClaim = true,
    maxRooms,
    maxRoomsPerIp,
    emptyTtlMs,
    abandonTtlMs,
    resumeTokenTtlMs,
    resumeIdempotencyTtlMs,
    resumePrevTokenGraceMs,
    resumeRateLimitPerMin,
    hostResumeSameIpOnly
  } = {}) {
    this.info = info;                       // ServerInfoCache 只读引用
    this.multiRoomEnabled = Boolean(multiRoomEnabled);
    this.allowLegacyHostClaim = Boolean(allowLegacyHostClaim);
    this.maxRooms = maxRooms || envInt('MAX_ROOMS', 500);
    this.maxRoomsPerIp = maxRoomsPerIp || envInt('MAX_ROOMS_PER_IP', 20);
    this.emptyTtlMs = emptyTtlMs || envInt('ROOM_EMPTY_TTL_MS', 30 * 60 * 1000);
    this.abandonTtlMs = abandonTtlMs || envInt('ROOM_ABANDON_TTL_MS', 2 * 60 * 60 * 1000);
    this.highWaterBytes = envInt('WS_HIGH_WATER_BYTES', 1048576); // 6.4 背压高水位

    // P1-2 resumeToken（7.2.1）
    this.resumeTokenTtlMs = resumeTokenTtlMs || envInt('RESUME_TOKEN_TTL_MS', this.abandonTtlMs);
    this.resumeIdempotencyTtlMs = resumeIdempotencyTtlMs || envInt('RESUME_IDEMPOTENCY_TTL_MS', 120000);
    this.resumePrevTokenGraceMs = resumePrevTokenGraceMs || envInt('RESUME_PREV_TOKEN_GRACE_MS', 60000);
    this.resumeRateLimitPerMin = resumeRateLimitPerMin || envInt('RESUME_RATE_LIMIT_PER_MIN', 5);
    this.hostResumeSameIpOnly = hostResumeSameIpOnly != null
      ? Boolean(hostResumeSameIpOnly)
      : envBool('HOST_RESUME_SAME_IP_ONLY', process.env.IS_PUBLIC_CLOUD === 'true');

    this.rooms = new Map();                 // roomId -> Room
    this.socketToRoom = new Map();          // socketId -> roomId
    this.roomCountByIp = new Map();         // ip -> 建房数（MAX_ROOMS_PER_IP）
    this.stats = { created: 0, closed: 0, rejected: 0 };
    this.counters = {
      legacy_host_claim: 0,
      slow_client_dropped: 0,
      token_replay: 0,
      resume_grace_used: 0,
      resume_rate_limited: 0,
      rate_limit_hits: 0,
      password_wrong: 0,
      room_create_failed: {}
    };

    // P1-2 resumeToken 存储：只存哈希，不落明文
    this.resumeTokens = new Map();          // tokenHash -> record
    this.resumeByPlayer = new Map();        // playerId -> 最新 record
    this.resumeIdempotency = new Map();     // `${playerId}:${requestId}:${tokenHash}` -> { result, expiresAt }
    this.resumeRate = new Map();            // `${ip}:${playerId|_}` -> { count, windowStart }

    // P1-3 指标
    this.broadcastSamples = [];             // 最近 500 次广播耗时
    this.bytesOutSamples = [];              // { t, bytes } 最近 60s

    this._reapTimer = setInterval(() => {
      try {
        this.reap();
      } catch (e) {
        console.error('[RoomRegistry] 回收扫描异常:', e);
      }
    }, 60 * 1000);
    if (this._reapTimer.unref) this._reapTimer.unref();
  }

  // ---------------------------------------------------------------- P1-3 指标采集

  recordBroadcast(ms) {
    this.broadcastSamples.push(ms);
    if (this.broadcastSamples.length > 500) this.broadcastSamples.shift();
  }

  recordBytesOut(n) {
    const now = Date.now();
    this.bytesOutSamples.push({ t: now, n });
    while (this.bytesOutSamples.length && now - this.bytesOutSamples[0].t > 60000) {
      this.bytesOutSamples.shift();
    }
  }

  broadcastMsPercentiles() {
    const s = [...this.broadcastSamples].sort((a, b) => a - b);
    const pick = (p) => s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : 0;
    return { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) };
  }

  bytesOutPerSec() {
    if (!this.bytesOutSamples.length) return 0;
    const now = Date.now();
    const window = this.bytesOutSamples.filter(s => now - s.t <= 60000);
    if (!window.length) return 0;
    const total = window.reduce((a, s) => a + s.n, 0);
    const span = Math.max(1, (now - window[0].t) / 1000);
    return Math.round(total / Math.max(span, 1));
  }

  // ---------------------------------------------------------------- 房间号（5.2）

  /**
   * 生成 5 位房间号。先生成前检查 MAX_ROOMS；字符集剔除 0/O/1/I；
   * 冲突重试 5 次（32^5 空间下碰撞概率可忽略），仍失败报 ROOM_LIMIT_REACHED。
   */
  generateRoomId() {
    if (this.rooms.size >= this.maxRooms) {
      throw new RoomError('ROOM_LIMIT_REACHED', '酒馆房间数已达上限，请稍后再试！');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('ROOM_LIMIT_REACHED', '房间号分配失败，请稍后再试！');
  }

  _checkRoomsPerIp(ip) {
    if (!ip) return;
    const count = this.roomCountByIp.get(ip) || 0;
    if (count >= this.maxRoomsPerIp) {
      throw new RoomError('ROOM_LIMIT_REACHED', '该网络创建房间数已达上限！');
    }
  }

  _trackRoomPerIp(ip, delta) {
    if (!ip) return;
    const next = (this.roomCountByIp.get(ip) || 0) + delta;
    if (next <= 0) this.roomCountByIp.delete(ip);
    else this.roomCountByIp.set(ip, next);
  }

  // ---------------------------------------------------------------- 建房 / 入房

  ensureMainRoom() {
    let room = this.rooms.get(MAIN_ROOM_ID);
    if (!room || room.closed) {
      room = new Room({ id: MAIN_ROOM_ID, registry: this, info: this.info });
      this.rooms.set(MAIN_ROOM_ID, room);
      this.stats.created += 1;
    }
    return room;
  }

  /**
   * CREATE_ROOM：建房并自动入座为房主。
   * 单间模式（MULTI_ROOM_ENABLED=false）下等价现状：接管 MAIN 房。
   * P1-2：payload.password 非空时设置房间密码（7.3）。
   */
  createRoom(ws, session, payload = {}) {
    const ip = session.ip;
    let room;
    if (this.multiRoomEnabled) {
      this._checkRoomsPerIp(ip);
      const roomId = this.generateRoomId();
      room = new Room({ id: roomId, registry: this, info: this.info });
      this.rooms.set(roomId, room);
      this.stats.created += 1;
      this._trackRoomPerIp(ip, 1);
      room._creatorIp = ip;
      if (payload.password) room.setPassword(payload.password);
      room.join(ws, session, payload, { trustedHost: true });
    } else {
      room = this.ensureMainRoom();
      room.join(ws, session, payload, { trustedHost: true });
    }
    return room;
  }

  /**
   * JOIN_ROOM：按房间号入座；无 roomId / 单间模式 → MAIN。
   * 入参统一 toUpperCase().trim()（大小写不敏感）。P1-2：校验房间密码。
   */
  joinRoom(ws, session, payload = {}) {
    const raw = String(payload.roomId || '').toUpperCase().trim();
    let roomId;
    if (!this.multiRoomEnabled || !raw) {
      roomId = MAIN_ROOM_ID;
    } else if (raw === MAIN_ROOM_ID) {
      roomId = MAIN_ROOM_ID;
    } else if (!/^[A-Z0-9]{5}$/.test(raw)) {
      this.stats.rejected += 1;
      throw new RoomError('ROOM_NOT_FOUND', '房间号格式不正确，应为 5 位房间码！');
    } else {
      roomId = raw;
    }

    const room = this.rooms.get(roomId)
      || (roomId === MAIN_ROOM_ID ? this.ensureMainRoom() : null);
    if (!room || room.closed) {
      this.stats.rejected += 1;
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在或已解散（服务器重启后房间会消失）。');
    }

    // 已在其他房间 → 先离开原房间
    if (session.roomId && session.roomId !== room.id) {
      const prev = this.rooms.get(session.roomId);
      if (prev && !prev.closed) {
        const prevWs = [...prev.sessions.entries()].find(([, s]) => s === session)?.[0];
        if (prevWs) prev.leave(prevWs, session);
      }
    }
    room.join(ws, session, payload);
    return room;
  }

  /**
   * QUICK_JOIN（4.1 匹配算法）：同 mode、LOBBY 阶段、未满、**无房间密码**的房间中
   * 选在线人数最多者（尽快凑满开局），并列取先；无候选则自动建房（建房者即房主）。
   */
  quickJoin(ws, session, payload = {}) {
    if (!this.multiRoomEnabled) {
      return this.joinRoom(ws, session, payload);
    }
    const mode = payload.mode;
    let best = null;
    for (const room of this.rooms.values()) {
      if (room.closed || !room.manager) continue;
      if (room.passwordHash) continue;          // P1-2：私密房间不参与快速匹配
      if (room.manager.game.status !== 'LOBBY') continue;
      if (mode && room.manager.mode !== mode) continue;
      const players = room.manager.players;
      if (players.length === 0) continue; // 空房不参与匹配
      const maxPlayers = (room.manager.game.config && room.manager.game.config.maxPlayers) || 4;
      if (players.length >= maxPlayers) continue;
      if (!best || players.length > best.manager.players.length) best = room;
    }
    if (best) {
      best.join(ws, session, payload);
      return best;
    }
    const room = this.createRoom(ws, session, payload);
    room._createdByQuickJoin = true;
    return room;
  }

  // ---------------------------------------------------------------- P1-2 resumeToken（7.2.1）

  /**
   * 签发/轮换 resumeToken。每个玩家只保留最新一条记录；
   * 旧记录立刻置 revoked，但保留 prevTokenHash 供宽限期收纳丢失响应的重试。
   * 只存 sha256 哈希，不落明文。
   */
  issueResumeToken(room, session) {
    if (!session.playerId) return null;
    const token = 'rs_' + crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const prev = this.resumeByPlayer.get(session.playerId);
    const player = room.manager.players.find(p => p.id === session.playerId);
    const record = {
      roomId: room.id,
      playerId: session.playerId,
      tokenHash,                           // 仅存哈希，不落明文（7.2.1）
      tokenVersion: (prev ? prev.tokenVersion : 0) + 1,
      isHost: Boolean(player && player.isHost),
      hostEpoch: player && player.isHost ? room.hostEpoch : null,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.resumeTokenTtlMs,
      prevTokenHash: prev ? prev.tokenHash : null,
      prevExpiresAt: prev ? Date.now() + this.resumePrevTokenGraceMs : null,
      revokedAt: null
    };
    this.resumeTokens.set(tokenHash, record);
    this.resumeByPlayer.set(session.playerId, record);
    if (prev) {
      prev.revokedAt = Date.now();   // 旧 token 失效，但哈希保留至宽限期结束
    }
    session.resumeToken = token;
    return token;
  }

  _checkResumeRate(ip, playerId) {
    const key = `${ip || '_'}:${playerId || '_'}`;
    const now = Date.now();
    let entry = this.resumeRate.get(key);
    if (!entry || now - entry.windowStart >= 60000) {
      entry = { count: 0, windowStart: now };
      this.resumeRate.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.resumeRateLimitPerMin) {
      this.counters.resume_rate_limited += 1;
      throw new RoomError('RESUME_RATE_LIMITED', '恢复尝试过于频繁，请稍后再试！');
    }
  }

  _resumeIdempotencyKey(playerId, requestId, tokenHash) {
    return `${playerId}:${requestId}:${tokenHash}`;
  }

  /**
   * RESUME_SESSION 全流程（7.2.1）：先幂等、后判重放；重放只拒本次；
   * 轮换宽限收纳丢失响应的重试；房主席位异地/纪元不符拒绝。
   * @returns RESUME_OK 消息对象（含轮换后的新 token）
   */
  resumeSession(ws, session, payload = {}) {
    const resumeToken = String(payload.resumeToken || '');
    const requestId = String(payload.requestId || '');
    if (!resumeToken || !requestId) {
      throw new RoomError('INVALID_ACTION', 'RESUME_SESSION 需要 resumeToken 与 requestId！');
    }
    const tokenHash = sha256(resumeToken);
    let record = this.resumeTokens.get(tokenHash) || null;
    this._checkResumeRate(session.ip, record ? record.playerId : null);

    // —— 1. 幂等窗：同 token + 同 requestId → 原样返回缓存结果（不重复轮换、不告警）——
    if (record) {
      const idemKey = this._resumeIdempotencyKey(record.playerId, requestId, tokenHash);
      const cached = this.resumeIdempotency.get(idemKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.result;
      }
    }

    // —— 2. 宽限期：轮换后旧 token + 新 requestId → 收纳丢失响应的重试 ——
    let grace = false;
    if (!record || record.revokedAt != null) {
      const now = Date.now();
      for (const rec of this.resumeByPlayer.values()) {
        if (rec.prevTokenHash === tokenHash && rec.prevExpiresAt && now < rec.prevExpiresAt) {
          record = rec;
          grace = true;
          this.counters.resume_grace_used += 1;
          break;
        }
      }
    }

    // —— 3. 重放 / 过期：仅拒绝本次 + 告警，绝不撤销当前会话 ——
    if (!record) {
      this.counters.token_replay += 1;
      throw new RoomError('RESUME_REPLAYED', '重连凭证无效，请重新入座（不影响你当前的其他会话）。');
    }
    const now = Date.now();
    const withinGrace = record.revokedAt != null && record.prevExpiresAt && now < record.prevExpiresAt
      && record.prevTokenHash === tokenHash;
    if (record.revokedAt != null && !withinGrace) {
      this.counters.token_replay += 1;
      throw new RoomError('RESUME_REPLAYED', '重连凭证已失效，请重新入座。');
    }
    if (now > record.expiresAt) {
      throw new RoomError('RESUME_EXPIRED', '重连凭证已过期，请重新入座。');
    }

    const room = this.rooms.get(record.roomId);
    if (!room || room.closed || !room.manager) {
      throw new RoomError('ROOM_NOT_FOUND', '房间不存在或已解散（服务器重启后房间会消失）。');
    }
    const seat = room.manager.players.find(p => p.id === record.playerId);
    if (!seat) {
      throw new RoomError('RESUME_EXPIRED', '席位已不存在，请重新入座。');
    }
    // 席位已被其他活连接占用（已通过其他途径恢复）→ 拒绝本次，不影响该连接
    const liveElsewhere = [...room.sessions.values()].some(
      s => s.playerId === seat.id && s.socketId !== session.socketId
    );
    if (liveElsewhere) {
      this.counters.token_replay += 1;
      throw new RoomError('RESUME_REPLAYED', '该席位已在其他连接上恢复。');
    }
    // 房主席位：异地恢复拒绝（HOST_RESUME_SAME_IP_ONLY）+ 纪元校验。
    // 注意：对局中断线托管会把 isBot 置 true，房主身份须按"在线或离线托管"判定。
    const isHostSeat = seat.isHost && (seat.isOffline || !seat.isBot);
    if (isHostSeat) {
      if (this.hostResumeSameIpOnly && session.ip && seat.ip && session.ip !== seat.ip) {
        throw new RoomError('FORBIDDEN', '房主凭证不允许从异地网络恢复！');
      }
      if (record.hostEpoch != null && record.hostEpoch !== room.hostEpoch) {
        this.counters.token_replay += 1;
        throw new RoomError('RESUME_REPLAYED', '房主凭证已过期（房主已变更），请重新入座。');
      }
    }

    // —— 4. 成功：重绑席位（稳定 ID 不变）+ 轮换新 token + 幂等结果缓存 ——
    room._rebindSeat(ws, session, seat, payload.avatar);
    const result = {
      type: 'RESUME_OK',
      payload: {
        roomId: room.id,
        playerId: session.playerId,
        resumeToken: session.resumeToken,
        hostToken: session.hostToken || null,
        state: room.buildState(session)
      }
    };
    const idemKey = this._resumeIdempotencyKey(record.playerId, requestId, sha256(grace ? session.resumeToken : resumeToken));
    this.resumeIdempotency.set(idemKey, { result, expiresAt: Date.now() + this.resumeIdempotencyTtlMs });
    return result;
  }

  /** 显式撤销（REVOKE_SESSIONS，P1）：房主可撤销本房任意人；本人仅可撤销自己。 */
  revokeSessions(session, targetPlayerId) {
    const playerId = targetPlayerId || session.playerId;
    const room = this.getRoomBySession(session);
    if (!room) throw new RoomError('NOT_IN_ROOM', '当前未入座任何房间。');
    if (playerId !== session.playerId && room.hostId !== session.playerId) {
      throw new RoomError('FORBIDDEN', '只能撤销自己的会话，撤销他人需要房主权限！');
    }
    const record = this.resumeByPlayer.get(playerId);
    if (record) {
      record.revokedAt = Date.now();
      record.prevExpiresAt = 0;  // 撤销时旧 token 宽限立即终止
    }
    // 被撤销连接收到 SESSIONS_REVOKED 后断开
    let kicked = 0;
    for (const [ws, sess] of room.sessions) {
      if (sess.playerId === playerId && sess.socketId !== session.socketId) {
        room.sendTo(ws, { type: 'SESSIONS_REVOKED', payload: { playerId, reason: 'revoked' } });
        sess.playerId = null;
        room.detach(ws, sess);
        try { ws.close(4003, 'revoked'); } catch (_) {}
        kicked += 1;
      }
    }
    return { kicked };
  }

  // ---------------------------------------------------------------- 路由 / 回收

  getRoomBySession(session) {
    if (!session || !session.roomId) return null;
    const room = this.rooms.get(session.roomId);
    return room && !room.closed ? room : null;
  }

  removeRoom(room) {
    this.rooms.delete(room.id);
    if (!room.isMain && room._creatorIp) {
      this._trackRoomPerIp(room._creatorIp, -1);
    }
    this.stats.closed += 1;
  }

  /**
   * 回收扫描（5.1/5.3）：空房 30 分钟 TTL；对局中全员掉线 2 小时 TTL。
   */
  reap() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.closed || !room.manager) continue;
      if (room.sockets.size === 0) {
        if (room.emptySince == null) room.emptySince = now;
        if (now - room.emptySince >= this.emptyTtlMs) {
          console.log(`[RoomRegistry] 空房回收: ${room.id}`);
          room.close('empty_ttl');
        }
        continue;
      }
      room.emptySince = null;
      const gs = room.manager.game.status;
      const inGame = gs !== 'LOBBY' && gs !== 'GAME_OVER';
      const humansConnected = room.manager.players.some(p => !p.isBot && p.connected);
      if (inGame && !humansConnected) {
        if (room.abandonedSince == null) room.abandonedSince = now;
        if (now - room.abandonedSince >= this.abandonTtlMs) {
          console.log(`[RoomRegistry] 全员掉线回收: ${room.id}`);
          room.close('abandoned_ttl');
        }
      } else {
        room.abandonedSince = null;
      }
    }
    // 顺手清理过期的幂等缓存与失效 resume 记录
    for (const [k, v] of this.resumeIdempotency) {
      if (Date.now() > v.expiresAt) this.resumeIdempotency.delete(k);
    }
    for (const [h, rec] of this.resumeTokens) {
      if (Date.now() > rec.expiresAt && (!rec.prevExpiresAt || Date.now() > rec.prevExpiresAt)) {
        this.resumeTokens.delete(h);
        if (this.resumeByPlayer.get(rec.playerId) === rec) {
          this.resumeByPlayer.delete(rec.playerId);
        }
      }
    }
  }

  stop() {
    if (this._reapTimer) {
      clearInterval(this._reapTimer);
      this._reapTimer = null;
    }
    for (const room of [...this.rooms.values()]) {
      room.close('server_shutdown');
    }
  }
}

module.exports = {
  RoomRegistry,
  Room,
  RoomError,
  createSocketSession,
  projectStateForViewer,
  MAIN_ROOM_ID,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH
};
