/**
 * test-multi-room-unit.js
 * P0-6 单元测试（MULTI_ROOM_PLAN.md v1.6 第 11.1 节 P0 子集）
 *
 * 覆盖：房间号规则 / 满员 / NOT_HOST 矩阵（9 个动作逐一）/ INIT_CONNECTED 契约 /
 *       P0 契约（players[].id === socketId）/ 房间回收 / hostId 不变量（空房）/
 *       重名三态 / KICK_PLAYER 边界 / QUICK_JOIN 选择 / serverInfo 缓存 spy /
 *       定时器覆盖（29/29 静态检查）
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { RoomRegistry, RoomError, createSocketSession, ROOM_CODE_CHARS } = require('../server/RoomRegistry');
const ServerInfoCache = require('../server/ServerInfoCache');

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

/** 可录制的假 ws（Room 只依赖 readyState/send/close/terminate） */
function fakeWs(ipLabel = '') {
  const frames = [];
  const closes = [];
  return {
    readyState: WebSocket.OPEN,
    ipLabel,
    frames,
    closes,
    send(data) { frames.push(JSON.parse(data)); },
    close(code, reason) { closes.push({ code, reason: String(reason || '') }); this.readyState = WebSocket.CLOSED; },
    terminate() { this.readyState = WebSocket.CLOSED; }
  };
}

function makeCache() {
  const cache = new ServerInfoCache({ port: 9527, accessKey: '' });
  cache._exec = () => { throw new Error('test: execSync 不允许被调用'); };
  cache.getLanIp = () => '127.0.0.1';
  cache.getApkPath = () => null;
  return cache;
}

function makeRegistry(opts = {}) {
  const cache = opts.cache || makeCache();
  return new RoomRegistry({
    info: cache,
    multiRoomEnabled: opts.multi !== false,
    allowLegacyHostClaim: opts.legacy !== false,
    maxRooms: opts.maxRooms,
    maxRoomsPerIp: opts.maxRoomsPerIp,
    emptyTtlMs: opts.emptyTtlMs,
    abandonTtlMs: opts.abandonTtlMs
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // ================================================================
  section('1. 房间号规则（5.2）');
  const reg1 = makeRegistry();
  const code = reg1.generateRoomId();
  ok(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(code), `房间号为 5 位合法字符集: ${code}`);
  ok(!/[0O1I]/.test(code), '房间码不含 0/O/1/I');
  ok(ROOM_CODE_CHARS.length === 32, '字符集恰为 32 个字符（32^5 ≈ 3350 万）');

  const regMax = makeRegistry({ maxRooms: 2 });
  regMax.createRoom(fakeWs(), createSocketSession({ socketId: 'user_max1', ip: '10.0.9.1' }), { name: '满1' });
  regMax.createRoom(fakeWs(), createSocketSession({ socketId: 'user_max2', ip: '10.0.9.2' }), { name: '满2' });
  let limitErr = null;
  try {
    regMax.createRoom(fakeWs(), createSocketSession({ socketId: 'user_max3', ip: '10.0.9.3' }), { name: '满3' });
  } catch (e) {
    limitErr = e;
  }
  ok(limitErr instanceof RoomError && limitErr.code === 'ROOM_LIMIT_REACHED', '达到 MAX_ROOMS 后报 ROOM_LIMIT_REACHED');

  // ================================================================
  section('2. NOT_HOST 矩阵（11.1：9 个房主动作逐一，不抽样）');
  const reg2 = makeRegistry();
  const hostWs = fakeWs();
  const hostSession = createSocketSession({ socketId: 'user_host', ip: '10.0.0.9' });
  const EmbeddedServer = require('../server/embedded-server.js');
  const server2 = new EmbeddedServer(9527, '');
  server2.registry = reg2;
  server2.handleSocketMessage(hostWs, hostSession, { type: 'CREATE_ROOM', payload: { name: '房主', avatar: '👑', mode: 'LIARS_DECK' } });
  const created = hostWs.frames.find(f => f.type === 'ROOM_CREATED');
  ok(created && /^[A-Z0-9]{5}$/.test(created.payload.roomId), `CREATE_ROOM 返回 ROOM_CREATED 与 5 位房间码: ${created && created.payload.roomId}`);
  ok(created && typeof created.payload.hostToken === 'string' && created.payload.hostToken.startsWith('ht_'), 'ROOM_CREATED 携带 hostToken（仅建房连接持有）');
  const roomA = reg2.rooms.get(created.payload.roomId);
  ok(roomA && roomA.hostId === 'user_host', '建房者成为房主（hostId = socketId）');

  const guestWs = fakeWs();
  const guestSession = createSocketSession({ socketId: 'user_guest', ip: '10.0.0.10' });
  server2.handleSocketMessage(guestWs, guestSession, { type: 'JOIN_ROOM', payload: { roomId: roomA.id, name: '阿三', avatar: '🦊' } });
  ok(roomA.manager.players.length === 2, '第二人入座成功');

  const HOST_ACTIONS = ['START_GAME', 'START_NEXT_HAND', 'RESET_LOBBY', 'ADD_BOT', 'REMOVE_PLAYER', 'KICK_PLAYER', 'UPDATE_CONFIG', 'SWITCH_MODE', 'CANCEL_ROOM'];
  let matrixOk = true;
  for (const action of HOST_ACTIONS) {
    const before = guestWs.frames.length;
    server2.handleSocketMessage(guestWs, guestSession, { type: action, payload: action === 'REMOVE_PLAYER' || action === 'KICK_PLAYER' ? { playerId: 'user_host' } : {} });
    const errFrame = guestWs.frames.slice(before).find(f => f.type === 'ERROR' && f.payload.code === 'NOT_HOST');
    const notice = guestWs.frames.slice(before).find(f => f.type === 'ERROR_NOTICE');
    if (!errFrame || !notice) {
      matrixOk = false;
      console.error(`   ↳ 动作 ${action} 未返回 NOT_HOST`);
    }
  }
  ok(matrixOk, `9 个房主专属动作对普通玩家全部返回 NOT_HOST（含兼容 ERROR_NOTICE 双发）`);
  ok(roomA.manager.players.length === 2 && roomA.closed === false, '越权尝试未破坏房间状态');

  // ================================================================
  section('3. P0 契约（3.5：players[].id 恒等 socketId + 只增字段）');
  roomA.scheduleBroadcast();
  await sleep(10);
  const hostStateFrame = hostWs.frames.filter(f => f.type === 'STATE_UPDATE').pop();
  ok(hostStateFrame && hostStateFrame.state.roomId === roomA.id, '快照携带 roomId');
  ok(typeof hostStateFrame.state.revision === 'number', '快照携带 revision');
  ok(hostStateFrame.state.hostId === 'user_host', '快照携带 hostId');
  ok(hostStateFrame.state.self && hostStateFrame.state.self.isHost === true, '快照携带 self.isHost');
  ok(hostStateFrame.state.players.every(p => p.id.startsWith('user_')), 'P0 契约：players[].id 恒等于 socketId');
  ok(hostStateFrame.serverInfo && hostStateFrame.serverInfo.mode === null, 'serverInfo.mode 为 null（多房间下语义失效）');

  // ================================================================
  section('4. 合并广播（6.2）：UPDATE_CONFIG 只产生一帧');
  const beforeCfg = hostWs.frames.length;
  server2.handleSocketMessage(hostWs, hostSession, { type: 'UPDATE_CONFIG', payload: { maxPlayers: 3 } });
  await sleep(10);
  const cfgFrames = hostWs.frames.slice(beforeCfg).filter(f => f.type === 'STATE_UPDATE');
  ok(cfgFrames.length === 1, `UPDATE_CONFIG 广播去重后恰好 1 帧（现状为 2 帧），实际 ${cfgFrames.length}`);

  // ================================================================
  section('5. 重名三态（7.2 / v1.6 新增）');
  // 5.1 在线同名 → NAME_TAKEN
  const dupWs = fakeWs();
  const dupSession = createSocketSession({ socketId: 'user_dup', ip: '10.0.0.11' });
  server2.handleSocketMessage(dupWs, dupSession, { type: 'JOIN_ROOM', payload: { roomId: roomA.id, name: '房主' } });
  ok(dupWs.frames.some(f => f.type === 'ERROR' && f.payload.code === 'NAME_TAKEN'), '在线同名 → NAME_TAKEN');

  // 5.2 离线席位 + 不同 IP → NAME_TAKEN（不区分原因，防探测）
  const soloReg = makeRegistry();
  const soloServer = new EmbeddedServer(9527, '');
  soloServer.registry = soloReg;
  const p1Ws = fakeWs();
  const p1Session = createSocketSession({ socketId: 'user_p1', ip: '10.0.0.1' });
  soloServer.handleSocketMessage(p1Ws, p1Session, { type: 'JOIN_ROOM', payload: { name: '酒客A', avatar: '🦊' } });
  // 置为对局中并断线，保留离线席位
  soloServer.handleSocketMessage(p1Ws, p1Session, { type: 'ADD_BOT', payload: {} });
  soloServer.handleSocketMessage(p1Ws, p1Session, { type: 'START_GAME', payload: {} });
  const mainRoom = soloReg.rooms.get('MAIN');
  mainRoom.leave(p1Ws, p1Session);
  ok(mainRoom.manager.players.some(p => p.name === '酒客A' && p.isOffline), '对局中断线保留离线席位');
  const impostorWs = fakeWs();
  const impostorSession = createSocketSession({ socketId: 'user_imp', ip: '10.0.0.99' });
  soloServer.handleSocketMessage(impostorWs, impostorSession, { type: 'JOIN_ROOM', payload: { name: '酒客A' } });
  ok(impostorWs.frames.some(f => f.type === 'ERROR' && f.payload.code === 'NAME_TAKEN'), '离线席位 + 不同 IP → 统一 NAME_TAKEN');

  // 5.3 离线席位 + 同 IP → 重绑，房主归属保持（5.6）
  // P1 契约（4.5）：player.id 为稳定 ID 不改写，只更新 socketId；hostId 指向稳定 ID
  const rejoinWs = fakeWs();
  const rejoinSession = createSocketSession({ socketId: 'user_p1_new', ip: '10.0.0.1' });
  soloServer.handleSocketMessage(rejoinWs, rejoinSession, { type: 'JOIN_ROOM', payload: { name: '酒客A', avatar: '🦊' } });
  ok(mainRoom.manager.players[0].id === 'user_p1', 'P1 稳定 ID：重绑后 player.id 不改写');
  ok(mainRoom.manager.players[0].socketId === 'user_p1_new', '重绑后 socketId 更新为新连接');
  ok(mainRoom.hostId === 'user_p1', 'P1：hostId 指向稳定 ID（对局中回合指针保持有效）');
  const rejoinErr = rejoinWs.frames.filter(f => f.type === 'ERROR');
  soloServer.handleSocketMessage(rejoinWs, rejoinSession, { type: 'START_GAME', payload: {} });
  ok(rejoinWs.frames.filter(f => f.type === 'ERROR').length === rejoinErr.length, '房主重连后仍能 START_GAME（11.2 用例）');

  // ================================================================
  section('6. KICK_PLAYER 边界（4.1 / v1.6 切分）');
  const lobbyReg = makeRegistry();
  const lobbyServer = new EmbeddedServer(9527, '');
  lobbyServer.registry = lobbyReg;
  const hWs = fakeWs();
  const hSession = createSocketSession({ socketId: 'user_h', ip: '10.0.0.1' });
  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'JOIN_ROOM', payload: { name: '房主H', isHost: true } });
  const gWs = fakeWs();
  const gSession = createSocketSession({ socketId: 'user_g', ip: '10.0.0.2' });
  lobbyServer.handleSocketMessage(gWs, gSession, { type: 'JOIN_ROOM', payload: { name: '客人G' } });
  const lobbyRoom = lobbyReg.rooms.get('MAIN');

  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'KICK_PLAYER', payload: { playerId: 'user_h' } });
  ok(hWs.frames.some(f => f.type === 'ERROR' && f.payload.code === 'INVALID_ACTION'), '房主不能请离自己');

  const beforeKickG = gWs.frames.length;
  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'KICK_PLAYER', payload: { playerId: 'user_g' } });
  ok(gWs.frames.slice(beforeKickG).some(f => f.type === 'KICKED'), '被踢者收到 KICKED');
  ok(gWs.closes.some(c => c.code === 4002), '被踢连接被关闭（4002）');
  ok(!lobbyRoom.manager.players.some(p => p.id === 'user_g'), '座位已移除');
  ok(!lobbyRoom.sessions.has(gWs), '会话已从房间摘除');

  // bot 走座位层 REMOVE_PLAYER 语义（v1.6 切分）
  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'ADD_BOT', payload: {} });
  const bot = lobbyRoom.manager.players.find(p => p.isBot);
  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'KICK_PLAYER', payload: { playerId: bot.id } });
  ok(!lobbyRoom.manager.players.some(p => p.id === bot.id), 'KICK bot 走 REMOVE_PLAYER 路径移除');

  // 对局中禁止 KICK
  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'START_GAME', payload: {} });
  lobbyServer.handleSocketMessage(hWs, hSession, { type: 'KICK_PLAYER', payload: { playerId: 'x' } });
  ok(hWs.frames.some(f => f.type === 'ERROR' && f.payload.code === 'INVALID_ACTION'), '对局中 KICK → INVALID_ACTION');

  // ================================================================
  section('7. QUICK_JOIN 匹配算法（4.1 / v1.6 新增）');
  const qReg = makeRegistry();
  const a1 = createSocketSession({ socketId: 'user_q1', ip: '10.1.0.1' });
  const a1Ws = fakeWs();
  qReg.createRoom(a1Ws, a1, { name: 'Q房主', mode: 'LIARS_DICE' });
  const qRoomA = qReg.getRoomBySession(a1);
  const a2 = createSocketSession({ socketId: 'user_q2', ip: '10.1.0.2' });
  qReg.joinRoom(fakeWs(), a2, { roomId: qRoomA.id, name: 'Q客人' });
  const b1 = createSocketSession({ socketId: 'user_q3', ip: '10.1.0.3' });
  qReg.createRoom(fakeWs(), b1, { name: 'R房主', mode: 'LIARS_DECK' });

  const seeker = createSocketSession({ socketId: 'user_seek', ip: '10.1.0.4' });
  const target = qReg.quickJoin(fakeWs(), seeker, { name: '路人', mode: 'LIARS_DICE' });
  ok(target.id === qRoomA.id, `同模式候选中选人数最多者：加入 ${qRoomA.id}（2 人房）`);
  ok(target.manager.players.length === 3, 'QUICK_JOIN 入座成功');

  const seeker2 = createSocketSession({ socketId: 'user_seek2', ip: '10.1.0.5' });
  const created2 = qReg.quickJoin(fakeWs(), seeker2, { name: '路人2', mode: 'TEXAS_POKER' });
  ok(created2.id !== qRoomA.id && /^[A-Z0-9]{5}$/.test(created2.id), '无候选房间时自动建房');

  // ================================================================
  section('8. 双房隔离（11.2 最高优先级，fake ws 级）');
  const isoReg = makeRegistry();
  const isoServer = new EmbeddedServer(9527, '');
  isoServer.registry = isoReg;
  const wsA1 = fakeWs();
  const sA1 = createSocketSession({ socketId: 'user_A1', ip: '10.2.0.1' });
  isoServer.handleSocketMessage(wsA1, sA1, { type: 'CREATE_ROOM', payload: { name: 'A主', mode: 'LIARS_DECK' } });
  const roomAid = wsA1.frames.find(f => f.type === 'ROOM_CREATED').payload.roomId;
  const wsA2 = fakeWs();
  const sA2 = createSocketSession({ socketId: 'user_A2', ip: '10.2.0.2' });
  isoServer.handleSocketMessage(wsA2, sA2, { type: 'JOIN_ROOM', payload: { roomId: roomAid, name: 'A客' } });
  const wsB1 = fakeWs();
  const sB1 = createSocketSession({ socketId: 'user_B1', ip: '10.3.0.1' });
  isoServer.handleSocketMessage(wsB1, sB1, { type: 'CREATE_ROOM', payload: { name: 'B主', mode: 'LIARS_DECK' } });
  const roomBid = wsB1.frames.find(f => f.type === 'ROOM_CREATED').payload.roomId;
  ok(roomAid !== roomBid, '两房房间码不同');
  await sleep(10); // 等待建房时 scheduleBroadcast 的 setImmediate 残帧落地，避免污染后续断言

  for (const ws of [wsA1, wsA2, wsB1]) ws.frames.length = 0;
  isoServer.handleSocketMessage(wsA1, sA1, { type: 'ADD_BOT', payload: {} });
  await sleep(10);
  ok(wsA1.frames.some(f => f.type === 'STATE_UPDATE') && wsA2.frames.some(f => f.type === 'STATE_UPDATE'), 'A 房成员收到本房广播');
  ok(!wsB1.frames.some(f => f.type === 'STATE_UPDATE'), 'B 房连接零帧（广播隔离）');

  for (const ws of [wsA1, wsA2, wsB1]) ws.frames.length = 0;
  isoServer.handleSocketMessage(wsA1, sA1, { type: 'CANCEL_ROOM', payload: {} });
  await sleep(10);
  ok(wsB1.frames.length === 0, 'A 房解散，B 房连接零帧');
  ok(wsA1.frames.some(f => f.type === 'ROOM_CLOSED' && f.payload.roomId === roomAid), 'A 房成员收到 ROOM_CLOSED');
  ok(wsA1.frames.some(f => f.type === 'ROOM_DISBANDED'), '兼容双发 ROOM_DISBANDED');
  ok(!isoReg.rooms.has(roomAid) && isoReg.rooms.has(roomBid), '仅 A 房从注册表移除');
  ok(sA1.roomId === null && isoReg.socketToRoom.get('user_A1') === undefined, '成员路由映射清理');

  // 切模式隔离
  const iso2 = makeRegistry();
  const iso2Server = new EmbeddedServer(9527, '');
  iso2Server.registry = iso2;
  const w1 = fakeWs(); const s1 = createSocketSession({ socketId: 'user_m1', ip: '10.4.0.1' });
  iso2Server.handleSocketMessage(w1, s1, { type: 'CREATE_ROOM', payload: { name: 'M1', mode: 'LIARS_DECK' } });
  const mid1 = w1.frames.find(f => f.type === 'ROOM_CREATED').payload.roomId;
  const w2 = fakeWs(); const s2 = createSocketSession({ socketId: 'user_m2', ip: '10.4.0.2' });
  iso2Server.handleSocketMessage(w2, s2, { type: 'CREATE_ROOM', payload: { name: 'M2', mode: 'TEXAS_POKER' } });
  const mid2 = w2.frames.find(f => f.type === 'ROOM_CREATED').payload.roomId;
  iso2Server.handleSocketMessage(w1, s1, { type: 'SWITCH_MODE', payload: { mode: 'LIARS_DICE' } });
  await sleep(10);
  ok(iso2.rooms.get(mid1).manager.mode === 'LIARS_DICE', 'A 房切模式生效');
  ok(iso2.rooms.get(mid2).manager.mode === 'TEXAS_POKER', 'B 房模式不受影响');

  // ================================================================
  section('9. hostId 不变量与空房保护（5.6 / v1.3）');
  const invReg = makeRegistry();
  const invRoom = new (require('../server/RoomRegistry').Room)({ id: invReg.generateRoomId(), registry: invReg, info: invReg.info });
  invReg.rooms.set(invRoom.id, invRoom);
  ok(invRoom.hostId === null, '空房 hostId === null（不对 undefined 取 .id）');
  ok(invRoom.assertHostInvariant() === true, '空房不变量断言不抛错');
  const invWs = fakeWs();
  invRoom.join(invWs, createSocketSession({ socketId: 'user_i1', ip: '10.5.0.1' }), { name: 'I1' });
  ok(invRoom.hostId === 'user_i1', '首入座者成为房主');
  invRoom.close('test');
  ok(invRoom.manager === null && invRoom.closed, 'close 后 manager 置空帮助 GC（5.3）');

  // ================================================================
  section('10. 房间回收（5.3 dispose / TTL）');
  const reaReg = makeRegistry({ emptyTtlMs: 80 });
  const reaWs = fakeWs();
  const reaSession = createSocketSession({ socketId: 'user_r1', ip: '10.6.0.1' });
  const reaRoom = reaReg.createRoom(reaWs, reaSession, { name: '回收测试' });
  // 定时器注册：房间销毁后不得触发（定时器时长 > TTL，保证 dispose 先于触发）
  let timerFired = false;
  reaRoom.manager.setTimer(() => { timerFired = true; }, 600);
  reaRoom.leave(reaWs, reaSession);
  await sleep(20);
  reaReg.reap(); // TTL 80ms 未到，不回收
  ok(reaReg.rooms.has(reaRoom.id), 'TTL 未到不回收');
  await sleep(120);
  reaReg.reap();
  ok(!reaReg.rooms.has(reaRoom.id), '空房超过 TTL 后回收');
  ok(timerFired === false, 'dispose 后定时器不再触发（5.3 头号泄漏源守卫）');
  ok(reaRoom.manager === null, '回收后 manager 置空');

  // ================================================================
  section('11. serverInfo 缓存 spy（6.0：1000 次广播 0 次 execSync）');
  const spyCache = new ServerInfoCache({ port: 9527, accessKey: '' });
  let execCalls = 0;
  spyCache._exec = () => { execCalls += 1; throw new Error('pm 不存在'); };
  spyCache.getLanIp = () => '127.0.0.1';
  spyCache.getApkPath = () => null;
  spyCache.refresh(); // 启动时算一次
  const warmCalls = execCalls;
  const spyReg = makeRegistry({ cache: spyCache });
  const spyWs = fakeWs();
  const spySession = createSocketSession({ socketId: 'user_spy', ip: '10.7.0.1' });
  const spyRoom = spyReg.createRoom(spyWs, spySession, { name: 'SPY' });
  for (let i = 0; i < 1000; i++) {
    spyRoom.broadcast();
  }
  ok(execCalls === warmCalls, `1000 次广播后 execSync 调用次数不变（${warmCalls} → ${execCalls}），验收标准 #6 通过`);

  // ================================================================
  section('12. 定时器覆盖静态检查（5.3：29/29 经 room.setTimer）');
  const timerCounts = { 'LiarsDeckGame.js': 12, 'LiarsDiceGame.js': 8, 'TexasPokerGame.js': 9 };
  let staticOk = true;
  let totalTimers = 0;
  for (const [file, expected] of Object.entries(timerCounts)) {
    const src = fs.readFileSync(path.join(__dirname, '../server', file), 'utf8');
    const setTimerCalls = (src.match(/this\.room\.setTimer\(/g) || []).length;
    const bareSet = (src.match(/(?<!room\.)setTimeout\(/g) || []).length;
    const bareClear = (src.match(/(?<!room\.)clearTimeout\(/g) || []).length;
    totalTimers += setTimerCalls;
    if (setTimerCalls !== expected || bareSet !== 0 || bareClear !== 0) {
      staticOk = false;
      console.error(`   ↳ ${file}: setTimer=${setTimerCalls}/${expected}, 裸 setTimeout=${bareSet}, 裸 clearTimeout=${bareClear}`);
    }
  }
  ok(staticOk && totalTimers === 29, `三个 Game 文件 29 处定时器全部经 room.setTimer，0 处裸调用（12+8+9=${totalTimers}）`);

  // ================================================================
  section('13. 战报裁剪（6.3：快照只发最近 20 条）');
  const trimReg = makeRegistry();
  const trimWs = fakeWs();
  const trimSession = createSocketSession({ socketId: 'user_t', ip: '10.8.0.1' });
  const trimRoom = trimReg.createRoom(trimWs, trimSession, { name: '裁剪' });
  for (let i = 0; i < 60; i++) {
    trimRoom.manager.game.addLog(`日志 ${i}`);
  }
  const snap = trimRoom.manager.getPlayerState(trimSession.socketId);
  ok(snap.logs.length === 20, `战报快照裁剪至 20 条，实际 ${snap.logs.length}`);

  // ================================================================
  section('14. 多房间开关与 MAIN 兼容（9.2）');
  const singleReg = makeRegistry({ multi: false });
  const swWs = fakeWs();
  const swSession = createSocketSession({ socketId: 'user_sw', ip: '10.9.0.1' });
  const swRoom = singleReg.createRoom(swWs, swSession, { name: '单间房主', isHost: true, mode: 'LIARS_DECK' });
  ok(swRoom.id === 'MAIN', '单间模式下 CREATE_ROOM 落到 MAIN（等价现状）');
  ok(swRoom.hostId === 'user_sw', '单间模式下建房者即房主');
  const joiner = createSocketSession({ socketId: 'user_sw2', ip: '10.9.0.2' });
  const joined = singleReg.joinRoom(fakeWs(), joiner, { roomId: 'r7k2m9', name: '无码客人' });
  ok(joined.id === 'MAIN', '单间模式下任意/无 roomId 均进 MAIN');

  // 多房间模式：无 roomId → MAIN
  const multiReg = makeRegistry({ multi: true });
  const mSession = createSocketSession({ socketId: 'user_legacy', ip: '10.10.0.1' });
  const mRoom = multiReg.joinRoom(fakeWs(), mSession, { name: '旧APK用户', isHost: true });
  ok(mRoom.id === 'MAIN', '多房间模式下无 roomId 的 JOIN_ROOM 进 MAIN（兼容矩阵）');
  ok(mRoom.hostId === 'user_legacy', 'MAIN 房 legacy isHost 兼容判定生效（无人类房主时）');

  // 公网关闭 legacy 抢房：自报 isHost 不得越过"已有人类房主"的服务端权威判定
  const cloudReg = new RoomRegistry({ info: makeCache(), multiRoomEnabled: true, allowLegacyHostClaim: false });
  const cSession = createSocketSession({ socketId: 'user_cloud', ip: '10.11.0.1' });
  const cRoom = cloudReg.joinRoom(fakeWs(), cSession, { name: '真房主' });
  ok(cRoom.hostId === 'user_cloud', 'MAIN 首入座者自动成为房主（服务端权威，与 isHost 自报无关）');
  const spoofer = createSocketSession({ socketId: 'user_spoof', ip: '10.11.0.2' });
  cloudReg.joinRoom(fakeWs(), spoofer, { name: '抓包改isHost的攻击者', isHost: true });
  ok(cRoom.hostId === 'user_cloud', '已有房主时自报 isHost 无效（验收标准 #5）');
  ok(cRoom.manager.players.find(p => p.id === 'user_spoof').isHost === false, '攻击者席位 isHost=false');

  // ================================================================
  console.log('\n====================================');
  console.log(`单元测试完成：通过 ${passed}，失败 ${failed}`);
  console.log('====================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
