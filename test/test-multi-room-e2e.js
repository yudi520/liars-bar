/**
 * test-multi-room-e2e.js
 * P0-6 集成验收（真实 WebSocket 全链路），双模式运行：
 *
 *   MULTI_ROOM_ENABLED=true  node test/test-multi-room-e2e.js   # 多房间模式
 *   MULTI_ROOM_ENABLED=false node test/test-multi-room-e2e.js   # 单间模式（APK 等价现状）
 *
 * 覆盖（11.2 / 11.4 P0 子集）：
 *  - INIT_CONNECTED：state === null，socketId 存在；
 *  - CREATE_ROOM / JOIN_ROOM 全链路；
 *  - 双房广播隔离（A 房动作 B 房零帧）；
 *  - 解散隔离 + 兼容双发 ROOM_DISBANDED；
 *  - 非房主房主动作 NOT_HOST（验收标准 #5）；
 *  - 房主大厅离开 → 顺位移交（5.4）；
 *  - 对局中断线重连 → name 三条件重绑，席位与房主身份恢复（5.6）。
 */

const WebSocket = require('ws');
const EmbeddedServer = require('../server/embedded-server.js');

const MULTI = process.env.MULTI_ROOM_ENABLED === 'true';
const PORT = MULTI ? 9537 : 9538;

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.frames = [];
    ws.on('message', (msg) => {
      try { ws.frames.push(JSON.parse(msg.toString())); } catch (_) {}
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitFrame(ws, type, predicate = () => true, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const found = ws.frames.find(f => f.type === type && predicate(f));
    if (found) return resolve(found);
    const timer = setTimeout(() => reject(new Error(`等待 ${type} 超时`)), timeoutMs);
    const onMsg = (msg) => {
      let data;
      try { data = JSON.parse(msg.toString()); } catch (_) { return; }
      if (data.type === type && predicate(data)) {
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        resolve(data);
      }
    };
    ws.on('message', onMsg);
  });
}

function lastState(ws) {
  for (let i = ws.frames.length - 1; i >= 0; i--) {
    if (ws.frames[i].type === 'STATE_UPDATE') return ws.frames[i].state;
  }
  return null;
}

async function main() {
  console.log(`\n🧪 多房间 e2e 验收（MULTI_ROOM_ENABLED=${MULTI}, 端口 ${PORT}）\n`);

  const server = new EmbeddedServer(PORT, '');
  server.infoCache.getLanIp = () => '127.0.0.1';
  server.infoCache.getApkPath = () => null;
  server.start();
  await sleep(400);

  const mainRoomId = MULTI ? null : 'MAIN';

  // ---- 1. INIT_CONNECTED 契约（11.1）----
  const wsA = await connect();
  const initA = await waitFrame(wsA, 'INIT_CONNECTED');
  ok(initA.socketId && initA.state === null, 'INIT_CONNECTED：socketId 存在且 state === null（3.5 冻结契约）');
  ok(initA.serverInfo && typeof initA.serverInfo.lanUrl === 'string', 'INIT_CONNECTED 携带 serverInfo 缓存快照');

  // ---- 2. 建房 / 输码入座 ----
  send(wsA, 'CREATE_ROOM', { name: '房主A', avatar: '👑', mode: 'LIARS_DECK' });
  const created = await waitFrame(wsA, 'ROOM_CREATED');
  const roomA = created.payload.roomId;
  if (MULTI) {
    ok(/^[A-Z0-9]{5}$/.test(roomA), `多房间模式：CREATE_ROOM 返回 5 位房间码 ${roomA}`);
  } else {
    ok(roomA === 'MAIN', '单间模式：CREATE_ROOM 落到 MAIN（等价现状）');
  }
  ok(typeof created.payload.hostToken === 'string', 'ROOM_CREATED 携带 hostToken');

  const st0 = await waitFrame(wsA, 'STATE_UPDATE', f => f.state.roomId === roomA);
  ok(st0.state.self && st0.state.self.isHost === true, '建房者快照 self.isHost = true');
  ok(st0.state.players.every(p => p.id.startsWith('user_')), 'P0 契约：players[].id === socketId');

  const wsB = await connect();
  await waitFrame(wsB, 'INIT_CONNECTED');
  send(wsB, 'JOIN_ROOM', { roomId: roomA, name: '玩家B', avatar: '🦊' });
  await waitFrame(wsB, 'STATE_UPDATE', f => f.state.roomId === roomA && f.state.players.length === 2);
  ok(true, '玩家按房间码入座成功');

  // ---- 3. 双房隔离（多房间模式）----
  let wsC = null;
  if (MULTI) {
    wsC = await connect();
    await waitFrame(wsC, 'INIT_CONNECTED');
    send(wsC, 'CREATE_ROOM', { name: '房主C', avatar: '🐺', mode: 'LIARS_DECK' });
    const roomC = (await waitFrame(wsC, 'ROOM_CREATED')).payload.roomId;
    ok(roomC !== roomA, '第二间房房间码不同');
    await sleep(80); // 排空两房各自的合并广播残帧

    wsA.frames.length = 0;
    wsB.frames.length = 0;
    wsC.frames.length = 0;
    send(wsA, 'ADD_BOT', {});
    await waitFrame(wsA, 'STATE_UPDATE', f => f.state.players.length === 3);
    await sleep(80);
    ok(wsB.frames.some(f => f.type === 'STATE_UPDATE'), 'A 房成员收到本房广播');
    ok(!wsC.frames.some(f => f.type === 'STATE_UPDATE' || f.type === 'ROOM_CLOSED'), 'C 房（独立房）连接零帧——广播隔离');

    send(wsA, 'SWITCH_MODE', { mode: 'LIARS_DICE' });
    await waitFrame(wsA, 'STATE_UPDATE', f => f.state.mode === 'LIARS_DICE');
    await sleep(80);
    const cState = lastState(wsC);
    ok(cState === null || cState.mode === 'LIARS_DECK', 'C 房 mode 不受 A 房切换影响');
  } else {
    // 单间模式：第二人无码加入 MAIN
    wsC = await connect();
    await waitFrame(wsC, 'INIT_CONNECTED');
    send(wsC, 'JOIN_ROOM', { name: '无码客人C' });
    await waitFrame(wsC, 'STATE_UPDATE', f => f.state.roomId === 'MAIN' && f.state.players.length === 3);
    ok(true, '单间模式：无 roomId 的 JOIN_ROOM 进 MAIN（兼容矩阵）');
    await sleep(80);
  }

  // ---- 4. 解散隔离 + 兼容双发（用独立的 D 房做解散，A/C 房保持存活）----
  if (MULTI) {
    const wsD = await connect();
    await waitFrame(wsD, 'INIT_CONNECTED');
    send(wsD, 'CREATE_ROOM', { name: '房主D', avatar: '🐵' });
    const roomD = (await waitFrame(wsD, 'ROOM_CREATED')).payload.roomId;
    const wsE = await connect();
    await waitFrame(wsE, 'INIT_CONNECTED');
    send(wsE, 'JOIN_ROOM', { roomId: roomD, name: '玩家E' });
    await waitFrame(wsE, 'STATE_UPDATE', f => f.state.roomId === roomD);
    await sleep(80);

    wsA.frames.length = 0;
    wsC.frames.length = 0;
    send(wsD, 'CANCEL_ROOM', {});
    await waitFrame(wsD, 'ROOM_CLOSED', f => f.payload.roomId === roomD);
    ok(true, 'D 房成员收到 ROOM_CLOSED');
    await waitFrame(wsD, 'ROOM_DISBANDED');
    ok(true, '兼容双发 ROOM_DISBANDED（旧前端可监听）');
    await sleep(100);
    ok(!wsA.frames.some(f => f.type === 'ROOM_CLOSED' || f.type === 'ROOM_DISBANDED'), 'A 房不受 D 房解散影响');
    ok(!wsC.frames.some(f => f.type === 'ROOM_CLOSED' || f.type === 'ROOM_DISBANDED'), 'C 房不受 D 房解散影响');
    wsD.close();
    wsE.close();
    await sleep(80);
  }

  // ---- 5. NOT_HOST（验收标准 #5：抓包改 isHost 无效）----
  const beforeErr = wsB.frames.length;
  send(wsB, 'START_GAME', {});
  const err = await waitFrame(wsB, 'ERROR', f => f.payload.code === 'NOT_HOST');
  ok(Boolean(err), `非房主 START_GAME → NOT_HOST`);
  ok(wsB.frames.slice(beforeErr).some(f => f.type === 'ERROR_NOTICE'), '兼容 ERROR_NOTICE 双发（旧前端可展示）');
  send(wsB, 'REMOVE_PLAYER', { playerId: initA.socketId });
  await waitFrame(wsB, 'ERROR', f => f.payload.code === 'NOT_HOST');
  ok(true, '非房主 REMOVE_PLAYER → NOT_HOST');
  send(wsB, 'CANCEL_ROOM', {});
  await waitFrame(wsB, 'ERROR', f => f.payload.code === 'NOT_HOST');
  ok(true, '非房主 CANCEL_ROOM → NOT_HOST');

  // ---- 6. 房主大厅离开 → 顺位移交（5.4）----
  wsA.close();
  await waitFrame(wsB, 'STATE_UPDATE', f => f.state.hostId !== null && f.state.hostId !== initA.socketId);
  ok(lastState(wsB).self.isHost === true, '房主大厅离开，顺位移交给剩余在线玩家（玩家B）');
  await sleep(100);

  const wsA2 = await connect();
  const initA2 = await waitFrame(wsA2, 'INIT_CONNECTED');
  send(wsA2, 'JOIN_ROOM', { roomId: roomA, name: '房主A', avatar: '👑' });
  await waitFrame(wsA2, 'STATE_UPDATE', f => f.state.roomId === roomA && f.state.players.some(p => p.name === '房主A'));
  const stA2 = lastState(wsA2);
  ok(stA2.self && stA2.self.isHost === false, '原房主重新入座后为普通玩家（房主归属不回抢）');

  // ---- 7. 对局中断线重连 → name 三条件重绑，席位与房主恢复（5.6 / 11.2）----
  send(wsB, 'START_GAME', {});
  await waitFrame(wsB, 'STATE_UPDATE', f => f.state.status !== 'LOBBY');
  ok(true, 'START_GAME 成功，进入对局');
  wsB.close(); // 房主对局中断线 → 席位保留 + AI 托管
  await sleep(150);

  const wsB2 = await connect();
  await waitFrame(wsB2, 'INIT_CONNECTED');
  send(wsB2, 'JOIN_ROOM', { roomId: roomA, name: '玩家B', avatar: '🦊' });
  const matchedRebind = await waitFrame(wsB2, 'STATE_UPDATE', f => f.state.roomId === roomA && f.state.players.some(p => p.name === '玩家B' && p.connected === true));
  if (failed >= 0 && process.env.E2E_DEBUG) {
    console.log('[DEBUG] 匹配帧 self:', JSON.stringify(matchedRebind.state.self), 'hostId:', matchedRebind.state.hostId,
      'players:', JSON.stringify(matchedRebind.state.players.map(p => ({ name: p.name, id: p.id, connected: p.connected, isHost: p.isHost, isBot: p.isBot }))));
    console.log('[DEBUG] wsB2 全部帧类型:', wsB2.frames.map(f => f.type).join(','));
  }
  const stRebind = lastState(wsB2);
  ok(stRebind.self.isHost === true, '对局中断线重连：房主身份经重绑恢复（5.6 原子重绑）');
  ok(stRebind.hostId === stRebind.self.socketId, 'hostId 与重绑后的 socketId 一致');
  ok(stRebind.status !== 'LOBBY', '对局中断线重连不重置对局状态');

  // 旧连接（原 socketId）已不存在：用新连接无法以旧身份越权——服务端以 hostId 判定
  const stPlayers = stRebind.players.map(p => ({ id: p.id, connected: p.connected }));
  ok(stPlayers.every(p => p.id !== initA.socketId || p.connected === false), '旧 socketId 不再持有活席位（双活防护）');

  server.stop();
  await sleep(200);

  console.log('\n====================================');
  console.log(`e2e 验收完成（${MULTI ? '多房间' : '单间'}模式）：通过 ${passed}，失败 ${failed}`);
  console.log('====================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('e2e 执行异常:', err.stack || err.message);
  process.exit(1);
});
