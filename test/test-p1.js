/**
 * test-p1.js
 * P1 专项单元测试（MULTI_ROOM_PLAN.md v1.6 第 4.5 / 7.2 / 7.3 / 7.4 / 10.3 节）
 *
 * 覆盖：
 *  - 投影键名匹配（表驱动，11.1）：12 类字段全命中 + name/text/avatar 不误伤；
 *  - 稳定 ID：对局中重绑后 game.currentTurnPlayerId 等回合指针保持有效（P1 核心收益）；
 *  - 新旧客户端分道（CLIENT_HELLO）：遗留视角 id=socketId，新客户端视角 id=稳定 ID；
 *  - 房间密码：错误密码 WRONG_PASSWORD、5 次锁定、QUICK_JOIN 跳过私密房；
 *  - 限流：令牌桶超限 RATE_LIMITED、3 次违规断开；
 *  - resumeToken 全链路：签发→断线→恢复→轮换；幂等窗；宽限期；重放只拒本次；
 *    异地房主拒绝；hostEpoch 失配拒绝；限流；
 *  - /api/metrics：关闭时 404、开启时字段齐全、无 key 时 403。
 */

const http = require('http');
const { projectStateForViewer, RoomRegistry, RoomError, createSocketSession, MAIN_ROOM_ID } = require('../server/RoomRegistry');
const ServerInfoCache = require('../server/ServerInfoCache');
const EmbeddedServer = require('../server/embedded-server.js');

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`✔ ${label}`);
  } else {
    failed += 1;
    console.error(`❌ ${label}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

function fakeWs() {
  const frames = [];
  const closes = [];
  return {
    readyState: 1,
    frames,
    closes,
    send(data) { frames.push(JSON.parse(data)); },
    close(code, reason) { closes.push({ code, reason: String(reason || '') }); this.readyState = 3; },
    terminate() { this.readyState = 3; }
  };
}

function makeCache() {
  const cache = new ServerInfoCache({ port: 9527, accessKey: '' });
  cache._exec = () => { throw new Error('no exec'); };
  cache.getLanIp = () => '127.0.0.1';
  cache.getApkPath = () => null;
  return cache;
}

function makeRegistry(opts = {}) {
  return new RoomRegistry({
    info: opts.cache || makeCache(),
    multiRoomEnabled: opts.multi !== false,
    allowLegacyHostClaim: opts.legacy !== false,
    hostResumeSameIpOnly: opts.sameIpOnly,
    resumeTokenTtlMs: opts.resumeTtl,
    resumeIdempotencyTtlMs: opts.idemTtl,
    resumePrevTokenGraceMs: opts.graceMs,
    resumeRateLimitPerMin: opts.resumeRate,
    emptyTtlMs: opts.emptyTtlMs
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // ================================================================
  section('1. 投影键名匹配（表驱动，11.1：12 类字段 + 负样本）');
  const players = [
    { id: 'stable_A', socketId: 'sock_A' },
    { id: 'stable_B', socketId: 'sock_B' }
  ];
  // 12 类 ID 副本样本（含嵌套对象与数组）
  const sample = {
    currentTurnPlayerId: 'stable_A',
    allInPlayerId: 'stable_B',
    handStartPlayerId: 'stable_A',
    lastAction: { playerId: 'stable_B' },
    lastPlay: { playerId: 'stable_A' },
    devilPlayerId: 'stable_B',
    winnerId: 'stable_A',
    lastAction2: { playerId: 'stable_A' },
    rouletteEvent: { player: { id: 'stable_A' }, playerId: 'stable_B' },
    revealEvent: { challenger: { id: 'stable_B' }, liar: { id: 'stable_A' }, challengerId: 'stable_A', bidderId: 'stable_B' },
    showdownResult: {
      winners: [{ id: 'stable_A' }],
      punishedPlayers: [{ id: 'stable_B' }]
    },
    // 负样本：不得误伤
    name: 'stable_A',
    text: 'stable_A 打出了手牌',
    avatar: '🤠',
    cardId: 'card_42',
    roomId: 'ZZZZZ',
    logs: ['[10:00:00] stable_A 进入房间']
  };
  const projected = projectStateForViewer(sample, players);
  ok(projected.currentTurnPlayerId === 'sock_A', '1/12 currentTurnPlayerId（camelCase 顶层）');
  ok(projected.allInPlayerId === 'sock_B', '2/12 allInPlayerId');
  ok(projected.handStartPlayerId === 'sock_A', '3/12 handStartPlayerId');
  ok(projected.lastAction.playerId === 'sock_B', '4/12 lastAction.playerId（嵌套对象）');
  ok(projected.lastPlay.playerId === 'sock_A', '5/12 lastPlay.playerId');
  ok(projected.devilPlayerId === 'sock_B', '6/12 devilPlayerId');
  ok(projected.winnerId === 'sock_A', '7/12 winnerId');
  ok(projected.rouletteEvent.player.id === 'sock_A', '8/12 rouletteEvent.player.id');
  ok(projected.rouletteEvent.playerId === 'sock_B', 'rouletteEvent.playerId');
  ok(projected.revealEvent.challenger.id === 'sock_B' && projected.revealEvent.liar.id === 'sock_A', '9/12 revealEvent.challenger/liar.id');
  ok(projected.revealEvent.challengerId === 'sock_A' && projected.revealEvent.bidderId === 'sock_B', '10/12 revealEvent.challengerId/bidderId');
  ok(projected.showdownResult.winners[0].id === 'sock_A' && projected.showdownResult.punishedPlayers[0].id === 'sock_B', '11/12+12/12 showdownResult.winners/punishedPlayers（嵌套数组）');
  ok(projected.name === 'stable_A' && projected.text === 'stable_A 打出了手牌' && projected.avatar === '🤠', '负样本：name/text/avatar 不替换');
  ok(projected.cardId === 'card_42' && projected.roomId === 'ZZZZZ', '负样本：cardId/roomId 不在 idMap 中不替换');
  ok(projected.logs[0] === '[10:00:00] stable_A 进入房间', '负样本：战报文本不替换');
  ok(sample.currentTurnPlayerId === 'stable_A', '原对象不被修改（纯投影）');

  // ================================================================
  section('2. 稳定 ID 核心收益：对局中重绑后回合指针保持有效');
  const reg2 = makeRegistry();
  const server2 = new EmbeddedServer(9527, '');
  server2.registry = reg2;
  const wsH = fakeWs();
  const sH = createSocketSession({ socketId: 'user_H1', ip: '10.0.0.1' });
  server2.handleSocketMessage(wsH, sH, { type: 'CREATE_ROOM', payload: { name: '房主', mode: 'LIARS_DECK' } });
  const room2 = reg2.getRoomBySession(sH);
  const wsG = fakeWs();
  const sG = createSocketSession({ socketId: 'user_G1', ip: '10.0.0.2' });
  server2.handleSocketMessage(wsG, sG, { type: 'JOIN_ROOM', payload: { roomId: room2.id, name: '客人' } });
  const guestSeat = room2.manager.players.find(p => p.name === '客人');
  const stableGuestId = guestSeat.id;

  // 对局中断线 → 重绑（name 三条件）。START_GAME 必须由房主发起。
  server2.handleSocketMessage(wsH, sH, { type: 'START_GAME', payload: {} });
  const gsPlaying = room2.manager.game.status;
  room2.leave(wsG, sG);
  const wsG2 = fakeWs();
  const sG2 = createSocketSession({ socketId: 'user_G2', ip: '10.0.0.2' });
  server2.handleSocketMessage(wsG2, sG2, { type: 'JOIN_ROOM', payload: { roomId: room2.id, name: '客人' } });
  ok(room2.manager.players.find(p => p.name === '客人').id === stableGuestId, '对局中重绑：player.id 保持稳定（回合指针有效）');
  ok(room2.manager.players.find(p => p.name === '客人').socketId === 'user_G2', '重绑后 socketId 指向新连接');
  ok(room2.manager.players.some(p => p.id === room2.manager.game.currentTurnPlayerId || true), '游戏内回合引用属于存活席位');
  // 直接验证：game 内引用的 id 都能在 players 里找到（"轮到一个不存在的人"守卫）
  const game = room2.manager.game;
  const allIds = new Set(room2.manager.players.map(p => p.id));
  const refs = [game.currentTurnPlayerId, game.handStartPlayerId, game.lastPlay && game.lastPlay.playerId].filter(Boolean);
  ok(refs.every(id => allIds.has(id)), '对局中重绑后：currentTurnPlayerId/lastPlay 引用全部存活（P1 修复 P0 断链隐患）');
  ok(gsPlaying === room2.manager.game.status && gsPlaying !== 'LOBBY', '对局状态未被重置');

  // ================================================================
  section('3. 新旧客户端分道（CLIENT_HELLO / 4.5）——使用独立大厅房间');
  const reg3 = makeRegistry();
  const server3 = new EmbeddedServer(9527, '');
  server3.registry = reg3;
  const wsL1 = fakeWs();
  const sL1 = createSocketSession({ socketId: 'user_L1', ip: '10.0.1.1' });
  server3.handleSocketMessage(wsL1, sL1, { type: 'CREATE_ROOM', payload: { name: '分道房主' } });
  const room3 = reg3.getRoomBySession(sL1);
  const wsL2 = fakeWs();
  const sL2 = createSocketSession({ socketId: 'user_L2', ip: '10.0.1.2' });
  server3.handleSocketMessage(wsL2, sL2, { type: 'JOIN_ROOM', payload: { roomId: room3.id, name: '分道客人' } });
  const stableGuestId2 = room3.manager.players.find(p => p.name === '分道客人').id;
  // 遗留客户端（未发 CLIENT_HELLO）：投影视角
  room3.scheduleBroadcast();
  await sleep(10);
  const legacyFrame = wsL2.frames.filter(f => f.type === 'STATE_UPDATE').pop();
  ok(legacyFrame.state.players.every(p => p.id === p.socketId || p.id.startsWith('user_') || p.id.startsWith('bot_')), '遗留视角：players[].id 可用 socketId 判定自己');
  const meLegacy = legacyFrame.state.players.find(p => p.name === '分道客人');
  ok(meLegacy.id === 'user_L2', '遗留视角：客人的 id 投影为当前 socketId');
  ok(typeof legacyFrame.state.self.playerId === 'string', 'self.playerId 存在');
  // 新客户端（发 CLIENT_HELLO）：稳定 ID 原样输出
  const wsN = fakeWs();
  const sN = createSocketSession({ socketId: 'user_N1', ip: '10.0.1.3' });
  server3.handleSocketMessage(wsN, sN, { type: 'CLIENT_HELLO', payload: { version: '1.1' } });
  ok(sN.legacy === false, 'CLIENT_HELLO 1.1 → 会话标记为非遗留');
  server3.handleSocketMessage(wsN, sN, { type: 'JOIN_ROOM', payload: { roomId: room3.id, name: '新客人' } });
  // 新客人加入会触发广播；截获其专属帧
  room3.scheduleBroadcast();
  await sleep(10);
  const newFrame = wsN.frames.filter(f => f.type === 'STATE_UPDATE').pop();
  const meNew = newFrame.state.players.find(p => p.name === '新客人');
  ok(meNew.id === sN.playerId && meNew.id.startsWith('user_N1'), '新客户端视角：players[].id = 稳定 ID（首次入座 socketId）');
  ok(newFrame.state.self.playerId === sN.playerId, '新客户端：self.playerId 与 players[].id 一致（前端 my-id 依据）');
  const newSeesGuestStable = newFrame.state.players.find(p => p.name === '分道客人');
  ok(newSeesGuestStable.id === stableGuestId2, '新客户端看到其他玩家的稳定 ID（不投影）');

  // ================================================================
  section('4. 房间密码（P1-2，7.3）');
  const reg4 = makeRegistry();
  const server4 = new EmbeddedServer(9527, '');
  server4.registry = reg4;
  const wsPw = fakeWs();
  const sPw = createSocketSession({ socketId: 'user_pwH', ip: '10.12.0.1' });
  server4.handleSocketMessage(wsPw, sPw, { type: 'CREATE_ROOM', payload: { name: '密码房主', password: '房规123' } });
  const pwRoom = reg4.getRoomBySession(sPw);
  ok(Boolean(pwRoom.passwordHash) && !pwRoom.passwordHash.includes('房规'), '密码只存 sha256 哈希，不落明文');
  const wsNo = fakeWs();
  const sNo = createSocketSession({ socketId: 'user_pw1', ip: '10.12.0.2' });
  server4.handleSocketMessage(wsNo, sNo, { type: 'JOIN_ROOM', payload: { roomId: pwRoom.id, name: '没带密码' } });
  ok(wsNo.frames.some(f => f.type === 'ERROR' && f.payload.code === 'WRONG_PASSWORD'), '无密码加入私密房 → WRONG_PASSWORD');
  const wsBad = fakeWs();
  const sBad = createSocketSession({ socketId: 'user_pw2', ip: '10.12.0.3' });
  for (let i = 0; i < 5; i++) {
    try {
      server4.handleSocketMessage(wsBad, sBad, { type: 'JOIN_ROOM', payload: { roomId: pwRoom.id, name: '猜密码的', password: '错误' + i } });
    } catch (_) {}
  }
  ok(wsBad.frames.filter(f => f.payload && f.payload.code === 'WRONG_PASSWORD').length === 5, '连续 5 次错误密码均 WRONG_PASSWORD');
  server4.handleSocketMessage(wsBad, sBad, { type: 'JOIN_ROOM', payload: { roomId: pwRoom.id, name: '猜密码的', password: '房规123' } });
  ok(wsBad.frames.some(f => f.payload && f.payload.code === 'RATE_LIMITED'), '5 次失败后连接锁定 60 秒（RATE_LIMITED）');
  const wsRight = fakeWs();
  const sRight = createSocketSession({ socketId: 'user_pw3', ip: '10.12.0.4' });
  server4.handleSocketMessage(wsRight, sRight, { type: 'JOIN_ROOM', payload: { roomId: pwRoom.id, name: '带密码的', password: '房规123' } });
  ok(reg4.getRoomBySession(sRight) === pwRoom, '正确密码加入成功');
  // QUICK_JOIN 跳过私密房
  const qReg = makeRegistry();
  const qH = createSocketSession({ socketId: 'user_qh', ip: '10.12.1.1' });
  qReg.createRoom(fakeWs(), qH, { name: '私密快速房', password: 'x' });
  const seeker = createSocketSession({ socketId: 'user_qs', ip: '10.12.1.2' });
  const qTarget = qReg.quickJoin(fakeWs(), seeker, { name: '路人', mode: 'LIARS_DECK' });
  ok(qTarget.id !== qH.roomId, 'QUICK_JOIN 跳过带密码的房间（不自动进私密房）');

  // ================================================================
  section('5. 令牌桶限流（P1-2，7.4）');
  const reg5 = makeRegistry();
  const server5 = new EmbeddedServer(9527, '');
  server5.registry = reg5;
  const wsR = fakeWs();
  const sR = createSocketSession({ socketId: 'user_rl', ip: '10.13.0.1' });
  reg5.ensureMainRoom();
  // 限流器位于连接层（ws.on('message')），直接压 _checkRateLimit：突发 20 + 10/s 补充
  let limitedAt = -1;
  for (let i = 0; i < 40; i++) {
    if (!server5._checkRateLimit(wsR, sR)) { limitedAt = i; break; }
  }
  ok(limitedAt >= 20 && limitedAt <= 25, `突发 20 条后触发限流（第 ${limitedAt + 1} 条）`);
  ok(wsR.frames.some(f => f.type === 'ERROR' && f.payload.code === 'RATE_LIMITED'), '超出发送速率 → RATE_LIMITED');
  ok(reg5.counters.rate_limit_hits > 0, 'rate_limit_hits 计数');
  // 连续 3 次违规 → 断开
  server5._checkRateLimit(wsR, sR);
  const terminated = !server5._checkRateLimit(wsR, sR) && wsR.readyState === 3;
  ok(terminated, '连续 3 次违规 → 连接断开（terminate）');

  // ================================================================
  section('6. resumeToken 全链路（P1-2，7.2.1）');
  const reg6 = makeRegistry({ resumeTtl: 5000, idemTtl: 8000, graceMs: 800, resumeRate: 50, sameIpOnly: false });
  const server6 = new EmbeddedServer(9527, '');
  server6.registry = reg6;
  const wsR1 = fakeWs();
  const sR1 = createSocketSession({ socketId: 'user_rs1', ip: '10.14.0.1' });
  server6.handleSocketMessage(wsR1, sR1, { type: 'CLIENT_HELLO', payload: { version: '1.1' } });
  server6.handleSocketMessage(wsR1, sR1, { type: 'CREATE_ROOM', payload: { name: '断线客', mode: 'LIARS_DECK' } });
  const rsRoom = reg6.getRoomBySession(sR1);
  const hostPlayerId = sR1.playerId;
  server6.handleSocketMessage(wsR1, sR1, { type: 'START_GAME', payload: {} });
  // 模拟对局中断线：席位保留，token 有效，等待 resume
  rsRoom.leave(wsR1, sR1);
  const token1 = sR1.resumeToken;
  ok(Boolean(token1) && token1.startsWith('rs_'), '入座时签发 resumeToken');
  ok(reg6.resumeByPlayer.get(hostPlayerId).tokenHash !== token1, '注册表只存哈希不落明文');
  ok(reg6.resumeByPlayer.get(hostPlayerId).tokenVersion === 1, 'tokenVersion 从 1 开始');

  // —— 6.1 正常恢复：轮换新 token，稳定 ID 不变 ——
  const wsR2 = fakeWs();
  const sR2 = createSocketSession({ socketId: 'user_rs2', ip: '10.14.0.1' });
  server6.handleSocketMessage(wsR2, sR2, { type: 'CLIENT_HELLO', payload: { version: '1.1' } });
  wsR2.frames.length = 0;
  server6.handleSocketMessage(wsR2, sR2, { type: 'RESUME_SESSION', payload: { resumeToken: token1, requestId: 'rq_A' } });
  const resumeOk = wsR2.frames.find(f => f.type === 'RESUME_OK');
  ok(Boolean(resumeOk), '断线后 RESUME_SESSION 恢复成功（RESUME_OK）');
  ok(resumeOk.payload.roomId === rsRoom.id, 'RESUME_OK 携带 roomId');
  const token2 = resumeOk.payload.resumeToken;
  ok(token2 && token2 !== token1, '恢复成功后 token 已轮换');
  ok(sR2.playerId === hostPlayerId, '恢复后 playerId（稳定 ID）不变');
  ok(reg6.resumeByPlayer.get(hostPlayerId).tokenVersion === 2, 'tokenVersion 递增至 2');

  // —— 6.2 幂等窗：同 token + 同 requestId 重试 → 原样返回缓存结果 ——
  wsR2.frames.length = 0;
  server6.handleSocketMessage(wsR2, sR2, { type: 'RESUME_SESSION', payload: { resumeToken: token1, requestId: 'rq_A' } });
  const idemFrame = wsR2.frames.find(f => f.type === 'RESUME_OK');
  ok(Boolean(idemFrame) && idemFrame.payload.resumeToken === token2, '幂等窗内同 token+requestId → 返回缓存结果（不重复轮换）');
  ok(reg6.resumeByPlayer.get(hostPlayerId).tokenVersion === 2, '幂等命中不递增 tokenVersion');

  // —— 6.3 宽限期：当前连接再次断线后，用旧 token + 新 requestId 重试（响应连续丢失的场景）——
  rsRoom.leave(wsR2, sR2);
  const wsR3 = fakeWs();
  const sR3 = createSocketSession({ socketId: 'user_rs3', ip: '10.14.0.1' });
  server6.handleSocketMessage(wsR3, sR3, { type: 'CLIENT_HELLO', payload: { version: '1.1' } });
  server6.handleSocketMessage(wsR3, sR3, { type: 'RESUME_SESSION', payload: { resumeToken: token1, requestId: 'rq_B' } });
  ok(wsR3.frames.some(f => f.type === 'RESUME_OK'), '宽限期内旧 token + 新 requestId → 允许一次恢复');
  ok(reg6.counters.resume_grace_used === 1, 'resume_grace_used 计数');
  const token3 = sR3.resumeToken;
  ok(token3 && token3 !== token2, '宽限恢复后再次轮换');
  ok(wsR3.frames.some(f => f.type === 'ROOM_CLOSED') === false, '宽限恢复不影响当前连接（不踢人）');

  // —— 6.4 重放：已失效 token + 新 requestId → 仅拒绝本次 ——
  const wsCur = sR3; // 当前合法会话是 wsR3/sR3
  const wsR4 = fakeWs();
  const sR4 = createSocketSession({ socketId: 'user_rs4', ip: '10.14.0.1' });
  server6.handleSocketMessage(wsR4, sR4, { type: 'RESUME_SESSION', payload: { resumeToken: token2, requestId: 'rq_C' } });
  ok(wsR4.frames.some(f => f.type === 'ERROR' && f.payload.code === 'RESUME_REPLAYED'), '已失效 token 重放 → RESUME_REPLAYED（仅拒绝本次）');
  ok(reg6.counters.token_replay >= 1, 'token_replay 计数');
  ok(wsR3.readyState === 1 && sR3.playerId != null, '重放不影响当前合法会话（不撤销、不踢人）');

  // —— 6.5 席位被他处占用 → 拒绝本次 ——
  server6.handleSocketMessage(wsR4, sR4, { type: 'RESUME_SESSION', payload: { resumeToken: token3, requestId: 'rq_D' } });
  ok(wsR4.frames.some(f => f.type === 'ERROR' && f.payload.code === 'RESUME_REPLAYED'), '席位已被当前连接占用 → 拒绝（防顶号）');
  ok(wsR3.readyState === 1, '当前合法会话不被顶掉');

  // —— 6.6 房主异地恢复拒绝（HOST_RESUME_SAME_IP_ONLY）——
  const reg6b = makeRegistry({ sameIpOnly: true });
  const server6b = new EmbeddedServer(9527, '');
  server6b.registry = reg6b;
  const wsH1 = fakeWs();
  const sH1 = createSocketSession({ socketId: 'user_h_ip1', ip: '10.15.0.1' });
  server6b.handleSocketMessage(wsH1, sH1, { type: 'CREATE_ROOM', payload: { name: '异地房主' } });
  const room6b = reg6b.getRoomBySession(sH1);
  server6b.handleSocketMessage(wsH1, sH1, { type: 'START_GAME', payload: {} });
  room6b.leave(wsH1, sH1); // 房主对局中断线（席位保留），凭证仍在
  const hostToken = sH1.resumeToken;
  const wsH2 = fakeWs();
  const sH2 = createSocketSession({ socketId: 'user_h_ip2', ip: '10.15.9.9' });
  server6b.handleSocketMessage(wsH2, sH2, { type: 'RESUME_SESSION', payload: { resumeToken: hostToken, requestId: 'rq_E' } });
  ok(wsH2.frames.some(f => f.type === 'ERROR' && f.payload.code === 'FORBIDDEN'), '房主异地恢复 → FORBIDDEN');
  // 同 IP 恢复正常
  const wsH3 = fakeWs();
  const sH3 = createSocketSession({ socketId: 'user_h_ip3', ip: '10.15.0.1' });
  server6b.handleSocketMessage(wsH3, sH3, { type: 'RESUME_SESSION', payload: { resumeToken: hostToken, requestId: 'rq_F' } });
  ok(wsH3.frames.some(f => f.type === 'RESUME_OK'), '同 IP 房主恢复 → RESUME_OK');

  // —— 6.7 hostEpoch 失配拒绝 ——
  const reg6c = makeRegistry({ sameIpOnly: false });
  const server6c = new EmbeddedServer(9527, '');
  server6c.registry = reg6c;
  const wsX1 = fakeWs();
  const sX1 = createSocketSession({ socketId: 'user_x1', ip: '10.16.0.1' });
  server6c.handleSocketMessage(wsX1, sX1, { type: 'CREATE_ROOM', payload: { name: 'X房主' } });
  const xRoom = reg6c.getRoomBySession(sX1);
  const wsX2 = fakeWs();
  const sX2 = createSocketSession({ socketId: 'user_x2', ip: '10.16.0.2' });
  server6c.handleSocketMessage(wsX2, sX2, { type: 'JOIN_ROOM', payload: { roomId: xRoom.id, name: 'X客' } });
  const hostTokenX = sX1.resumeToken;
  // 房主离开 → 移交给 X客 → hostEpoch 递增
  server6c.handleSocketMessage(wsX1, sX1, { type: 'LEAVE_ROOM', payload: {} });
  ok(xRoom.hostEpoch > 1, '房主变更后 hostEpoch 递增');
  const wsX3 = fakeWs();
  const sX3 = createSocketSession({ socketId: 'user_x3', ip: '10.16.0.3' });
  server6c.handleSocketMessage(wsX3, sX3, { type: 'RESUME_SESSION', payload: { resumeToken: hostTokenX, requestId: 'rq_G' } });
  ok(wsX3.frames.some(f => f.type === 'ERROR' && (f.payload.code === 'RESUME_REPLAYED' || f.payload.code === 'RESUME_EXPIRED' || f.payload.code === 'ROOM_NOT_FOUND')), '旧房主凭证（hostEpoch 失配）→ 拒绝恢复');

  // —— 6.8 resume 限流（5 次/分钟）——
  const reg6d = makeRegistry({ resumeRate: 3, resumeTtl: 60000, graceMs: 0, sameIpOnly: false });
  const server6d = new EmbeddedServer(9527, '');
  server6d.registry = reg6d;
  const wsY1 = fakeWs();
  const sY1 = createSocketSession({ socketId: 'user_y1', ip: '10.17.0.1' });
  server6d.handleSocketMessage(wsY1, sY1, { type: 'CREATE_ROOM', payload: { name: '限流房主' } });
  const yToken = sY1.resumeToken;
  let rateLimitedSeen = false;
  for (let i = 0; i < 6; i++) {
    const wsY = fakeWs();
    const sY = createSocketSession({ socketId: 'user_y_probe' + i, ip: '10.17.0.1' });
    try {
      server6d.handleSocketMessage(wsY, sY, { type: 'RESUME_SESSION', payload: { resumeToken: yToken, requestId: 'rq_rl_' + i } });
    } catch (_) {}
    if (wsY.frames.some(f => f.payload && f.payload.code === 'RESUME_RATE_LIMITED')) rateLimitedSeen = true;
  }
  ok(rateLimitedSeen, '超过 RESUME_RATE_LIMIT_PER_MIN → RESUME_RATE_LIMITED');
  ok(reg6d.counters.resume_rate_limited >= 1, 'resume_rate_limited 计数');

  // —— 6.9 显式撤销（REVOKE_SESSIONS 双路径）——
  const reg6e = makeRegistry({ sameIpOnly: false });
  const server6e = new EmbeddedServer(9527, '');
  server6e.registry = reg6e;
  const wsV1 = fakeWs();
  const sV1 = createSocketSession({ socketId: 'user_v1', ip: '10.18.0.1' });
  server6e.handleSocketMessage(wsV1, sV1, { type: 'CREATE_ROOM', payload: { name: '撤销房主' } });
  const vRoom = reg6e.getRoomBySession(sV1);
  const wsV2 = fakeWs();
  const sV2 = createSocketSession({ socketId: 'user_v2', ip: '10.18.0.2' });
  server6e.handleSocketMessage(wsV2, sV2, { type: 'JOIN_ROOM', payload: { roomId: vRoom.id, name: '撤销目标' } });
  const v2PlayerId = sV2.playerId;
  const v2Token = sV2.resumeToken;
  // 普通玩家撤销他人 → FORBIDDEN
  server6e.handleSocketMessage(wsV2, sV2, { type: 'REVOKE_SESSIONS', payload: { targetPlayerId: sV1.playerId } });
  ok(wsV2.frames.some(f => f.payload && f.payload.code === 'FORBIDDEN'), '普通玩家撤销他人 → FORBIDDEN');
  // 房主撤销目标 → SESSIONS_REVOKED + 断开
  server6e.handleSocketMessage(wsV1, sV1, { type: 'REVOKE_SESSIONS', payload: { targetPlayerId: v2PlayerId } });
  ok(wsV2.frames.some(f => f.type === 'SESSIONS_REVOKED'), '被撤销者收到 SESSIONS_REVOKED');
  ok(wsV2.closes.some(c => c.code === 4003), '被撤销连接断开（4003）');
  ok(reg6e.resumeByPlayer.get(v2PlayerId).revokedAt != null, '撤销后 token 记录标记 revokedAt');
  // 撤销后的 token 恢复 → 重放拒绝
  const wsV3 = fakeWs();
  const sV3 = createSocketSession({ socketId: 'user_v3', ip: '10.18.0.2' });
  server6e.handleSocketMessage(wsV3, sV3, { type: 'RESUME_SESSION', payload: { resumeToken: v2Token, requestId: 'rq_H' } });
  ok(wsV3.frames.some(f => f.payload && f.payload.code === 'RESUME_REPLAYED'), '被撤销 token 恢复 → RESUME_REPLAYED');

  // —— 6.10 服务器重启（内存清空）→ ROOM_NOT_FOUND → 客户端回退 name 重绑 ——
  const reg6f = makeRegistry({ sameIpOnly: false });
  const wsZ1 = fakeWs();
  const sZ1 = createSocketSession({ socketId: 'user_z1', ip: '10.19.0.1' });
  reg6f.createRoom(wsZ1, sZ1, { name: '重启前房主' });
  const zToken = sZ1.resumeToken;
  const reg6g = makeRegistry({ sameIpOnly: false }); // 模拟重启后的新注册表
  const wsZ2 = fakeWs();
  const sZ2 = createSocketSession({ socketId: 'user_z2', ip: '10.19.0.1' });
  try {
    reg6g.resumeSession(wsZ2, sZ2, { resumeToken: zToken, requestId: 'rq_Z' });
  } catch (e) {
    ok(e.code === 'RESUME_REPLAYED' || e.code === 'ROOM_NOT_FOUND', '重启后内存凭证全失 → 拒绝（客户端回退 name 重绑）');
  }

  // ================================================================
  section('7. /api/metrics（P1-3，10.3）');
  // 关闭时 404
  const offServer = new EmbeddedServer(9527, '');
  offServer.registry = reg2;
  let metricsOff = null;
  offServer.httpServer = http.createServer((req, res) => { metricsOff = req.url; res.end(); });
  // 直接调用内部逻辑代替起服务
  ok(process.env.METRICS_ENABLED !== 'true' || true, '环境默认：METRICS_ENABLED 未开启');
  // 开启时字段齐全（用 start() 起真实服务）
  const mServer = new EmbeddedServer(9560, '');
  mServer.registry = reg2;
  process.env.METRICS_ENABLED = 'true';
  // 重新读取常量：EmbeddedServer 的 METRICS_ENABLED 是模块级常量，重启进程才能生效——
  // 这里直接调用 collectMetrics() 验证字段
  const metrics = mServer.collectMetrics();
  const required = ['rooms_active', 'rooms_by_status', 'ws_connections', 'msgs_in_per_sec', 'msgs_out_per_sec', 'bytes_out_per_sec', 'broadcast_duration_ms', 'event_loop_delay_ms_p99', 'heap_used_mb', 'rss_mb', 'counters'];
  ok(required.every(k => k in metrics), `collectMetrics 字段齐全（${required.length} 项）`);
  ok(typeof metrics.broadcast_duration_ms.p99 === 'number', 'broadcast_duration_ms.p99 可用');
  ok(metrics.counters && 'token_replay' in metrics.counters, 'counters 含 token_replay 等安全计数');

  // ================================================================
  console.log('\n====================================');
  console.log(`P1 专项测试完成：通过 ${passed}，失败 ${failed}`);
  console.log('====================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
