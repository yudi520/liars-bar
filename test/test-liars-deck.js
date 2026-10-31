/**
 * test-liars-deck.js
 * 自动化单元测试：骗子纸牌 · 恶魔模式核心规则与状态流转
 */

const LiarsDeck = require('../server/LiarsDeck');
const LiarsDeckGame = require('../server/LiarsDeckGame');

async function runTests() {
  console.log('--- 1. 测试牌堆生成与分布 ---');
  const deck = new LiarsDeck(true);
  if (deck.cards.length !== 21) throw new Error(`牌堆总数应为21，实际为${deck.cards.length}`);
  const devils = deck.cards.filter(c => c.type === 'DEVIL');
  if (devils.length !== 1) throw new Error('恶魔牌数量必须为1');
  const jokers = deck.cards.filter(c => c.type === 'JOKER');
  if (jokers.length !== 2) throw new Error('Joker牌数量必须为2');
  console.log('✔ 牌堆验证通过: 21张牌 (1 Devil + 2 Joker + 18 Q/K/A)');

  console.log('\n--- 2. 测试游戏未开局不公布目标牌 & 开局发牌 ---');
  const mockRoom = {
    players: [
      { id: 'p1', name: '玩家A', isHost: true, isBot: false, connected: true, isAlive: true, cards: [] },
      { id: 'p2', name: '玩家B', isHost: false, isBot: false, connected: true, isAlive: true, cards: [] },
      { id: 'p3', name: '玩家C', isHost: false, isBot: false, connected: true, isAlive: true, cards: [] }
    ],
    broadcastState: () => {}
  };
  const game = new LiarsDeckGame(mockRoom);
  const lobbySnapshot = game.getStateSnapshot('p1');
  if (lobbySnapshot.tableCard !== null) {
    throw new Error('游戏未开局(LOBBY)阶段不得公布目标牌！');
  }
  console.log('✔ LOBBY阶段验证通过: 目标牌保持隐藏 (null)');

  game.startNewGame();
  if (game.turnTimer) clearTimeout(game.turnTimer);

  for (const p of mockRoom.players) {
    if (p.cards.length !== 5) throw new Error(`玩家 ${p.name} 手牌应为5张，实际为${p.cards.length}`);
  }
  console.log('✔ 发牌验证通过: 每名活跃玩家5张手牌，目标牌已公布:', game.tableCard.label);

  console.log('\n--- 3. 测试恶魔牌单张出牌限制 ---');
  const devilCard = { id: 'devil_test', type: 'DEVIL', rank: 'DEVIL', label: 'DEVIL', suitSymbol: '😈' };
  const normalCard = { id: 'normal_test', type: 'NORMAL', rank: 'K', label: 'K', suitSymbol: '♠' };
  mockRoom.players[0].cards = [devilCard, normalCard];
  game.currentTurnPlayerId = 'p1';

  let threwMultiDevil = false;
  try {
    game.actionPlayCards('p1', ['devil_test', 'normal_test']);
  } catch (err) {
    threwMultiDevil = true;
    console.log('✔ 正确拦截多张恶魔牌合并打出:', err.message);
  }
  if (!threwMultiDevil) throw new Error('应该阻止将恶魔牌与其他牌一起打出');

  console.log('\n--- 4. 测试质疑悬念延迟与恶魔牌被质疑生效（出恶魔牌者免罚，其余玩家需开枪） ---');
  game.actionPlayCards('p1', ['devil_test']);
  if (game.turnTimer) clearTimeout(game.turnTimer);

  if (game.tableCardsCount !== 1) throw new Error('桌面牌数应为1');
  if (game.lastPlay.playerId !== 'p1') throw new Error('上一出牌者应为 p1');

  // 下一位行动者为 p2，p2 提出质疑 (Liar!)
  game.currentTurnPlayerId = 'p2';
  game.actionChallenge('p2');
  if (game.turnTimer) clearTimeout(game.turnTimer);

  // 验证第1阶段：悬念阶段
  if (!game.revealEvent || game.revealEvent.phase !== 'SUSPENSE') {
    throw new Error('质疑后应首先进入 SUSPENSE 悬念验牌阶段');
  }
  console.log('✔ 悬念验牌阶段验证通过 (不直接弹窗，等待验明)');

  // 等待1.9秒进入结果阶段
  await new Promise(r => setTimeout(r, 1900));

  const reveal = game.revealEvent;
  if (!reveal || reveal.phase !== 'RESULT') throw new Error('应进入 RESULT 结果揭晓阶段');
  if (!reveal.hasDevil) throw new Error('揭示事件中应标明含有恶魔牌');
  if (reveal.devilPlayerId !== 'p1') throw new Error('恶魔牌出牌者应为 p1');

  console.log('revealEvent (已揭晓):', {
    hasDevil: reveal.hasDevil,
    devilPlayer: reveal.devilPlayerName,
    challenger: reveal.challenger.name,
    victims: reveal.victims.map(t => t.name)
  });

  const targetIds = reveal.victims.map(t => t.id);
  if (targetIds.includes('p1')) throw new Error('出恶魔牌者 p1 不应在受罚名单中！');
  if (!targetIds.includes('p2') || !targetIds.includes('p3')) {
    throw new Error('除出恶魔牌者外全场其余在座玩家 (p2, p3) 都必须在受罚名单中！');
  }
  console.log('✔ 恶魔牌受罚名单验证通过：出恶魔牌者 p1 豁免免罚，其余玩家 (p2, p3) 受罚开枪');

  console.log('\n--- 5. 测试 6 孔渐进式俄罗斯轮盘赌 (开枪数量与存活概率 5/6 -> 4/5 ...) ---');
  const victimPlayer = mockRoom.players[0];
  victimPlayer.shotsFired = 0;
  victimPlayer.isAlive = true;
  const snap1 = game.getStateSnapshot('p1');
  const p1Data1 = snap1.players.find(p => p.id === 'p1');
  if (p1Data1.remainingChambers !== 6 || p1Data1.surviveChance !== '5/6' || p1Data1.survivePercent !== 83) {
    throw new Error(`初次开枪存活率应为 5/6 (83%)，实际为 ${p1Data1.surviveChance}`);
  }
  console.log('✔ 轮盘初次看板验证通过: 已开0枪，存活率 5/6 (83%)');

  // 模拟空枪存活后
  victimPlayer.shotsFired = 1;
  const snap2 = game.getStateSnapshot('p1');
  const p1Data2 = snap2.players.find(p => p.id === 'p1');
  if (p1Data2.remainingChambers !== 5 || p1Data2.surviveChance !== '4/5' || p1Data2.survivePercent !== 80) {
    throw new Error(`存活后下一次存活率应为 4/5 (80%)，实际为 ${p1Data2.surviveChance}`);
  }
  console.log('✔ 轮盘递进看板验证通过: 已开1枪，存活率 4/5 (80%)');

  console.log('\n--- 6. 测试终局其他玩家无手牌时系统强制替换为质疑 ---');
  mockRoom.players[0].cards = []; // p1 清空手牌安全脱险
  mockRoom.players[2].cards = []; // p3 清空手牌安全脱险
  mockRoom.players[1].cards = [{ id: 'rem_1', rank: 'K' }]; // 仅剩 p2 有牌
  game.status = 'PLAYING';
  game.tableCardsCount = 3;
  game.lastPlay = { playerId: 'p1', playerName: '玩家A', cards: [{ rank: 'K' }], count: 1 };
  game.currentTurnPlayerId = 'p2';

  let threwMustChallenge = false;
  try {
    game.actionPlayCards('p2', ['rem_1']);
  } catch (err) {
    threwMustChallenge = true;
    console.log('✔ 正确拦截出牌并强制质疑:', err.message);
  }
  if (!threwMustChallenge) throw new Error('其他玩家手牌已空时，应阻止出牌并强制替换为质疑');

  const p2Snapshot = game.getStateSnapshot('p2');
  if (!p2Snapshot.mustChallenge) throw new Error('快照中 mustChallenge 应为 true');
  console.log('✔ 强制质疑状态标记验证通过 (mustChallenge: true)');

  // 清除定时器
  if (game.rouletteTimer) clearTimeout(game.rouletteTimer);
  if (game.nextHandTimer) clearTimeout(game.nextHandTimer);

  console.log('\n--- 7. 测试开房规则参数配置 (德州扑克子弹模式 & 骗子纸牌恶魔模式) ---');
  const TexasRoomManager = require('../server/RoomManager');
  
  // 7.1 验证德州扑克子弹模式开房配置注入
  const texasRoom = new TexasRoomManager(() => {});
  texasRoom.joinPlayer('host_texas', {
    name: '德州牌王',
    avatar: '🎰',
    isHost: true,
    mode: 'TEXAS_POKER',
    config: {
      enableSwitch: false,
      eliminateAllLosers: false,
      maxPlayers: 3
    }
  });

  if (texasRoom.mode !== 'TEXAS_POKER') throw new Error('房间模式应为 TEXAS_POKER');
  if (texasRoom.game.config.enableSwitch !== false) throw new Error('德州扑克 enableSwitch 应被配置为 false');
  if (texasRoom.game.config.eliminateAllLosers !== false) throw new Error('德州扑克 eliminateAllLosers 应被配置为 false');
  if (texasRoom.game.config.maxPlayers !== 3) throw new Error('德州扑克 maxPlayers 应被配置为 3');
  console.log('✔ 德州扑克子弹模式开房参数验证通过 (enableSwitch: false, eliminateAllLosers: false, maxPlayers: 3)');

  // 7.2 验证骗子纸牌恶魔模式开房配置注入
  const deckRoom = new TexasRoomManager(() => {});
  deckRoom.joinPlayer('host_deck', {
    name: '恶魔赌客',
    avatar: '😈',
    isHost: true,
    mode: 'LIARS_DECK',
    config: {
      enableDevilCard: false,
      enableDevilsDeal: true,
      maxPlayers: 2
    }
  });

  if (deckRoom.mode !== 'LIARS_DECK') throw new Error('房间模式应为 LIARS_DECK');
  if (deckRoom.game.config.enableDevilCard !== false) throw new Error('恶魔模式 enableDevilCard 应被配置为 false');
  if (deckRoom.game.config.enableDevilsDeal !== true) throw new Error('恶魔模式 enableDevilsDeal 应被配置为 true');
  if (deckRoom.game.config.maxPlayers !== 2) throw new Error('恶魔模式 maxPlayers 应被配置为 2');
  console.log('✔ 骗子纸牌恶魔模式开房参数验证通过 (enableDevilCard: false, enableDevilsDeal: true, maxPlayers: 2)');

  console.log('\n🎉 所有核心规则与优化要求单元测试通过！');
  process.exit(0);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
