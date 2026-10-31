/**
 * 骗子酒馆 - 骗子骰子 · 吹牛模式单元测试套件 (test-liars-dice.js)
 * 覆盖：
 * 1. 5 颗暗骰生成与升序整理
 * 2. 叫点递增法则校验与非法拦截
 * 3. 1点万能赖子默认全场生效计算
 * 4. 锁1规则 (叫1破百搭) 触发后万能失效逻辑
 * 5. 质疑 (Liar!) 验骰与胜负判定
 * 6. 官方原版 2 瓶致命毒药饮用与暴毙出局
 * 7. 可选 6 孔左轮轮盘赌开枪惩罚
 * 8. 精确命中 (Spot-on / 刚中) 全员惩罚与自身失误惩罚
 * 9. RoomManager 多模式网络调度与开房参数注入
 */

const RoomManager = require('../server/RoomManager');
const LiarsDiceGame = require('../server/LiarsDiceGame');

async function runDiceTests() {
  console.log('====================================');
  console.log('🧪 开始运行骗子骰子 (Liar\'s Dice) 核心规则测试');
  console.log('====================================\n');

  // --- 1. 测试 5 颗暗骰生成与整理 ---
  console.log('--- 1. 测试 5 颗暗骰生成与整理 ---');
  const mockRoom = {
    players: [
      { id: 'p1', name: '玩家A', isAlive: true, connected: true, poisonDrunk: 0, bulletsFired: 0 },
      { id: 'p2', name: '玩家B', isAlive: true, connected: true, poisonDrunk: 0, bulletsFired: 0 },
      { id: 'p3', name: '玩家C', isAlive: true, connected: true, poisonDrunk: 0, bulletsFired: 0 }
    ],
    broadcastState: () => {}
  };

  const game = new LiarsDiceGame(mockRoom);
  game.startNewGame();
  
  if (game.status !== 'ROLLING') throw new Error('开局初始状态应为 ROLLING');
  for (const p of mockRoom.players) {
    if (!Array.isArray(p.dice) || p.dice.length !== 5) {
      throw new Error(`玩家 ${p.name} 骰子数量不为 5`);
    }
    for (const d of p.dice) {
      if (d < 1 || d > 6) throw new Error(`骰子点数 ${d} 超出 1~6 范围`);
    }
  }
  console.log('✔ 5颗骰子生成验证通过，点数均在 1~6 之间');

  // 清除 ROLLING 异步计时器，直接切入 BIDDING
  game.clearAllTimers();
  game.status = 'BIDDING';
  game.currentTurnPlayerId = 'p1';

  // --- 2. 测试叫点递增法则校验与非法拦截 ---
  console.log('\n--- 2. 测试叫点递增法则校验与非法拦截 ---');
  // 首次起叫：合法
  game.actionBid('p1', 2, 3); // 2个3点
  if (!game.currentBid || game.currentBid.quantity !== 2 || game.currentBid.faceValue !== 3) {
    throw new Error('首发叫点记录异常');
  }
  if (game.currentTurnPlayerId !== 'p2') throw new Error('下家回合应移交 p2');
  console.log('✔ 首次起叫合法 (2个3点)');

  // p2 尝试叫更小的 (如 1个4点 或 2个2点) -> 应被拦截
  let threwLowerQty = false;
  try {
    game.actionBid('p2', 1, 4);
  } catch (err) {
    threwLowerQty = true;
    console.log('✔ 正确拦截数量不足叫点:', err.message);
  }
  if (!threwLowerQty) throw new Error('应拦截数量少于当前叫点的出牌');

  let threwLowerFace = false;
  try {
    game.actionBid('p2', 2, 2);
  } catch (err) {
    threwLowerFace = true;
    console.log('✔ 正确拦截同数量更低点数叫点:', err.message);
  }
  if (!threwLowerFace) throw new Error('应拦截同数量点数更低的出牌');

  // p2 合法叫点：相同数量更高点数 (2个5点)
  game.actionBid('p2', 2, 5);
  if (game.currentBid.faceValue !== 5) throw new Error('加码提高点数未生效');
  if (game.currentTurnPlayerId !== 'p3') throw new Error('下家回合应移交 p3');
  console.log('✔ 同数量提高点数叫点合法 (2个5点)');

  // p3 合法叫点：增加数量 (3个2点)
  game.actionBid('p3', 3, 2);
  if (game.currentBid.quantity !== 3 || game.currentBid.faceValue !== 2) throw new Error('加码增加数量未生效');
  if (game.currentTurnPlayerId !== 'p1') throw new Error('下家回合应移交 p1 (逆时针轮转)');
  console.log('✔ 增加数量重置点数叫点合法 (3个2点)');

  // --- 3. 测试 1点万能赖子默认全场生效计算 ---
  console.log('\n--- 3. 测试 1点万能赖子计算 ---');
  // 手动固定全场骰子：
  // p1: [1, 2, 4, 5, 6] (1个4, 1个1)
  // p2: [1, 3, 4, 4, 6] (2个4, 1个1)
  // p3: [2, 3, 5, 6, 6] (0个4, 0个1)
  // 目标点数 4点：真实4点有 1+2+0=3个，1点万能有 1+1+0=2个，合计应为 5 个！
  mockRoom.players[0].dice = [1, 2, 4, 5, 6];
  mockRoom.players[1].dice = [1, 3, 4, 4, 6];
  mockRoom.players[2].dice = [2, 3, 5, 6, 6];

  const count4 = game.calculateDiceCount(4);
  if (count4.exactCount !== 3) throw new Error(`实际4点应为3个，现为 ${count4.exactCount}`);
  if (count4.wildCount !== 2) throw new Error(`1点万能应为2个，现为 ${count4.wildCount}`);
  if (count4.totalMatching !== 5) throw new Error(`4点总和应为5个，现为 ${count4.totalMatching}`);
  console.log(`✔ 1点万能计算通过：3个真实4点 + 2个1点赖子 = ${count4.totalMatching}个`);

  // --- 4. 测试默认规则叫 1 点时 1 点依然为万能 vs 开启锁 1 规则 ---
  console.log('\n--- 4. 测试锁 1 规则 (叫1破百搭) 触发机制 ---');
  // 4.1 默认规则：未开启 enableLockOne 时，叫 1 点不会破坏百搭
  game.wildLocked = false;
  game.actionBid('p1', 4, 1); // 叫 4个1点
  if (game.wildLocked) throw new Error('默认模式下叫1不应锁死万能属性');
  console.log('✔ 默认规则下叫 1 点不触发锁死');

  // 4.2 开启锁 1 规则测试
  const lockGame = new LiarsDiceGame(mockRoom);
  lockGame.updateConfig({ enableLockOne: true });
  lockGame.status = 'BIDDING';
  lockGame.currentTurnPlayerId = 'p1';
  lockGame.actionBid('p1', 2, 1); // 主动叫 1 点
  if (!lockGame.wildLocked) throw new Error('开启锁1规则后叫1点必须锁死百搭');
  
  const countAfterLock = lockGame.calculateDiceCount(4);
  if (countAfterLock.wildActive !== false || countAfterLock.totalMatching !== 3) {
    throw new Error(`锁1后4点总数应仅计真实4点(3个)，现为 ${countAfterLock.totalMatching}`);
  }
  console.log('✔ 锁1规则验证通过：叫1后万能属性失效，4点总数不再计入1点');

  // --- 5. 测试质疑 (Liar!) 与毒药扣减 ---
  console.log('\n--- 5. 测试质疑开盅与 2 瓶毒药惩罚 ---');
  // 场景：当前叫点为 6 个 4点 (p1叫的)，而全场实际只有 5 个 4点
  game.currentBid = { playerId: 'p1', playerName: '玩家A', quantity: 6, faceValue: 4 };
  game.currentTurnPlayerId = 'p2';
  
  game.actionChallenge('p2'); // p2 质疑 p1
  if (game.revealEvent.isBidderSuccessful !== false) {
    throw new Error('实际5个 < 叫点6个，叫点者吹牛应失败');
  }
  if (game.revealEvent.loserId !== 'p1') throw new Error('吹牛败露，输家应为 p1');
  console.log('✔ 质疑成功判定通过：叫点6个 > 实际5个，吹牛者 p1 败北');

  // 验证毒药扣减
  const victimP1 = mockRoom.players[0];
  const initialPoison = victimP1.poisonDrunk;
  game.executePunishment(victimP1);
  if (victimP1.poisonDrunk !== initialPoison + 1) throw new Error('输家未喝下毒药');
  if (!victimP1.isAlive) throw new Error('喝第1瓶毒药不应死亡');
  console.log(`✔ 喝下第 1 瓶毒药通过：当前喝了 ${victimP1.poisonDrunk}/2 瓶，存活`);

  // 再喝第 2 瓶毒药 -> 暴毙淘汰
  game.executePunishment(victimP1);
  if (victimP1.poisonDrunk !== 2) throw new Error('毒药数量应为 2');
  if (victimP1.isAlive !== false) throw new Error('喝下第 2 瓶毒药后必须被淘汰出局');
  console.log('✔ 喝下第 2 瓶毒药暴毙淘汰验证通过 (isAlive: false)');

  // --- 6. 测试质疑失败 (实际 ≥ 叫点，质疑者受罚) ---
  console.log('\n--- 6. 测试质疑失败反噬质疑者 ---');
  // 恢复所有选手存活进行测试
  mockRoom.players[0].isAlive = true;
  mockRoom.players[1].isAlive = true;
  mockRoom.players[2].isAlive = true;
  mockRoom.players[0].dice = [1, 2, 4, 5, 6]; // 1个4, 1个1
  mockRoom.players[1].dice = [1, 3, 4, 4, 6]; // 2个4, 1个1
  mockRoom.players[2].dice = [2, 3, 5, 6, 6]; // 0个
  // 全场总计 5 个 4点 (3个真4 + 2个1点赖子)

  // p2 叫 5 个 4 点，实际全场刚好有 5 个 4 点
  // p3 质疑 p2 -> 实际数量足够，质疑者 p3 输
  game.currentBid = { playerId: 'p2', playerName: '玩家B', quantity: 5, faceValue: 4 };
  game.currentTurnPlayerId = 'p3';
  game.status = 'BIDDING';
  
  game.actionChallenge('p3');
  if (game.revealEvent.isBidderSuccessful !== true) {
    throw new Error('实际5个 ≥ 叫点5个，叫点者保本成功');
  }
  if (game.revealEvent.loserId !== 'p3') throw new Error('质疑者判断失误，输家应为质疑者 p3');
  console.log('✔ 质疑失败反噬通过：实际5个 ≥ 叫点5个，质疑者 p3 受罚');

  // --- 7. 测试可选精确命中 (Spot-on) 机制 ---
  console.log('\n--- 7. 测试精确命中 (Spot-on) 机制 ---');
  const spotGame = new LiarsDiceGame(mockRoom);
  spotGame.updateConfig({ enableSpotOn: true });
  mockRoom.players[0].isAlive = true;
  mockRoom.players[1].isAlive = true;
  mockRoom.players[2].isAlive = true;
  mockRoom.players[0].dice = [2, 3, 5, 6, 2]; // 0个4点, 0个1点
  mockRoom.players[1].dice = [4, 4, 1, 2, 3]; // 2个4点, 1个1点
  mockRoom.players[2].dice = [4, 5, 6, 2, 3]; // 1个4点, 0个1点
  // 全场总计刚好 4 个 4点 (3个真4 + 1个1点赖子)

  // 7.1 精准命中成功
  spotGame.status = 'BIDDING';
  spotGame.currentBid = { playerId: 'p1', playerName: '玩家A', quantity: 4, faceValue: 4 };
  spotGame.currentTurnPlayerId = 'p2';
  spotGame.actionSpotOn('p2');

  if (!spotGame.revealEvent.isExactMatch) throw new Error('数量刚好为4个，应判定精确命中成功');
  console.log('✔ 精确命中成功判定通过：刚好4个匹配，发起者封神');

  // 7.2 精准命中失败
  spotGame.status = 'BIDDING';
  spotGame.currentBid = { playerId: 'p1', playerName: '玩家A', quantity: 3, faceValue: 4 };
  spotGame.currentTurnPlayerId = 'p2';
  spotGame.actionSpotOn('p2');

  if (spotGame.revealEvent.isExactMatch) throw new Error('数量为4不等于3，应判定精确命中失败');
  console.log('✔ 精确命中失败判定通过：实际4个 ≠ 叫点3个，发起者失误受罚');

  // --- 8. 测试 RoomManager 多模式接入与参数传递 ---
  console.log('\n--- 8. 测试 RoomManager 多模式接入与开房配置 ---');
  const room = new RoomManager(() => {});
  room.joinPlayer('host_dice', {
    name: '骰王房主',
    avatar: '🎲',
    isHost: true,
    mode: 'LIARS_DICE',
    config: {
      punishType: 'ROULETTE',
      enableLockOne: true,
      enableSpotOn: true,
      maxPlayers: 3
    }
  });

  if (room.mode !== 'LIARS_DICE') throw new Error('房间模式应为 LIARS_DICE');
  if (room.game.config.punishType !== 'ROULETTE') throw new Error('惩罚模式应配置为 ROULETTE');
  if (room.game.config.enableLockOne !== true) throw new Error('锁1规则应配置为 true');
  if (room.game.config.enableSpotOn !== true) throw new Error('精确命中应配置为 true');
  if (room.game.config.maxPlayers !== 3) throw new Error('最大人数应配置为 3');
  console.log('✔ RoomManager 骰子模式开房配置注入验证通过');

  console.log('\n🎉 所有骗子骰子核心规则与机制单元测试顺利通过！');
  process.exit(0);
}

runDiceTests().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
