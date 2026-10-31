/**
 * test-e2e-liars-deck.js
 * 端到端网络集成测试：EmbeddedServer + WebSocket + LiarsDeckGame
 */

const WebSocket = require('ws');
const EmbeddedServer = require('../server/embedded-server');

async function runE2ETest() {
  console.log('--- 启动集成测试服务器 (端口: 9529) ---');
  const server = new EmbeddedServer(9529);
  server.start();

  await new Promise(r => setTimeout(r, 600));

  console.log('--- 客户端 Alice (房主) 连接 WebSocket ---');
  const wsAlice = new WebSocket('ws://127.0.0.1:9529');

  let aliceState = null;
  let aliceSocketId = null;

  await new Promise((resolve, reject) => {
    wsAlice.on('open', resolve);
    wsAlice.on('error', reject);
  });

  wsAlice.on('message', (msgStr) => {
    const data = JSON.parse(msgStr);
    if (data.type === 'INIT') {
      aliceSocketId = data.socketId;
    } else if (data.type === 'STATE_UPDATE') {
      aliceState = data.state;
    }
  });

  await new Promise(r => setTimeout(r, 400));

  console.log('--- Alice 发送 JOIN_ROOM (模式: LIARS_DECK) ---');
  wsAlice.send(JSON.stringify({
    type: 'JOIN_ROOM',
    payload: {
      name: '爱丽丝老板',
      avatar: '👑',
      isHost: true,
      mode: 'LIARS_DECK'
    }
  }));

  await new Promise(r => setTimeout(r, 400));

  if (!aliceState) throw new Error('未收到初始房间状态');
  if (aliceState.mode !== 'LIARS_DECK') throw new Error(`模式应为 LIARS_DECK，实际为 ${aliceState.mode}`);
  console.log('✔ Alice 成功创建并进入 LIARS_DECK 房间，当前状态:', aliceState.status);

  console.log('--- 房主更新规则 (开启恶魔牌，开启恶魔契约) ---');
  wsAlice.send(JSON.stringify({
    type: 'UPDATE_CONFIG',
    payload: {
      enableDevilCard: true,
      enableDevilsDeal: true
    }
  }));
  await new Promise(r => setTimeout(r, 300));
  if (!aliceState.config.enableDevilCard || !aliceState.config.enableDevilsDeal) {
    throw new Error('规则配置更新失败');
  }
  console.log('✔ 规则配置成功:', aliceState.config);

  console.log('--- 房主邀请 2 名电脑 AI ---');
  wsAlice.send(JSON.stringify({ type: 'ADD_BOT' }));
  await new Promise(r => setTimeout(r, 300));
  wsAlice.send(JSON.stringify({ type: 'ADD_BOT' }));
  await new Promise(r => setTimeout(r, 300));

  if (aliceState.players.length !== 3) {
    throw new Error(`当前在座人数应为 3，实际为 ${aliceState.players.length}`);
  }
  console.log('✔ AI 入座成功，当前选手:', aliceState.players.map(p => `${p.name} (${p.personality || '玩家'})`));

  console.log('--- 房主启动恶魔纸牌局 (START_GAME) ---');
  wsAlice.send(JSON.stringify({ type: 'START_GAME' }));
  await new Promise(r => setTimeout(r, 800));

  if (aliceState.status !== 'PLAYING') {
    throw new Error(`游戏状态应为 PLAYING，实际为 ${aliceState.status}`);
  }
  console.log('✔ 游戏成功开局！');
  console.log('👑 目标牌:', aliceState.tableCard.label);
  console.log('🎴 Alice 可视手牌数量:', aliceState.players.find(p => p.isHost).cards.length);
  console.log('🎯 当前行动者 ID:', aliceState.currentTurnPlayerId);

  // 清理关闭
  console.log('--- 测试通过，关闭 WebSocket 与服务 ---');
  wsAlice.close();
  if (server.httpServer) server.httpServer.close();
  if (server.wsServer) server.wsServer.close();

  console.log('🎉 端到端集成测试完美通过！');
  process.exit(0);
}

runE2ETest().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
