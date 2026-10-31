/**
 * 骗子酒馆 - 算法与机制单元测试
 */

const { PokerDeck, HAND_RANKS } = require('../server/PokerDeck');
const Revolver = require('../server/Revolver');

console.log('====================================');
console.log('🧪 开始运行骗子酒馆德州扑克算法与机制验证');
console.log('====================================\n');

// 1. 测试牌型评估
function testEvaluation() {
  console.log('1. 测试牌型判定 (7 选 5 最佳组合):');

  // 皇家同花顺
  const royalCards = [
    { suit: 'spades', value: 14 },
    { suit: 'spades', value: 13 },
    { suit: 'spades', value: 12 },
    { suit: 'spades', value: 11 },
    { suit: 'spades', value: 10 },
    { suit: 'hearts', value: 2 },
    { suit: 'clubs', value: 3 }
  ];
  const royalEval = PokerDeck.evaluateHand(royalCards);
  console.log(`- 皇家同花顺测试: Rank=${royalEval.rank} (${royalEval.name}) => ${royalEval.rank === 10 ? '✅ 通过' : '❌ 失败'}`);

  // 同花顺 (9高)
  const sfCards = [
    { suit: 'hearts', value: 9 },
    { suit: 'hearts', value: 8 },
    { suit: 'hearts', value: 7 },
    { suit: 'hearts', value: 6 },
    { suit: 'hearts', value: 5 },
    { suit: 'spades', value: 14 },
    { suit: 'diamonds', value: 2 }
  ];
  const sfEval = PokerDeck.evaluateHand(sfCards);
  console.log(`- 同花顺测试: Rank=${sfEval.rank} (${sfEval.name}) => ${sfEval.rank === 9 ? '✅ 通过' : '❌ 失败'}`);

  // 四条 (炸弹)
  const fourCards = [
    { suit: 'hearts', value: 8 },
    { suit: 'spades', value: 8 },
    { suit: 'diamonds', value: 8 },
    { suit: 'clubs', value: 8 },
    { suit: 'hearts', value: 14 },
    { suit: 'spades', value: 2 },
    { suit: 'diamonds', value: 3 }
  ];
  const fourEval = PokerDeck.evaluateHand(fourCards);
  console.log(`- 四条测试: Rank=${fourEval.rank} (${fourEval.name}) => ${fourEval.rank === 8 ? '✅ 通过' : '❌ 失败'}`);

  // 葫芦 (Full House)
  const fhCards = [
    { suit: 'hearts', value: 10 },
    { suit: 'spades', value: 10 },
    { suit: 'diamonds', value: 10 },
    { suit: 'clubs', value: 4 },
    { suit: 'hearts', value: 4 },
    { suit: 'spades', value: 2 },
    { suit: 'diamonds', value: 9 }
  ];
  const fhEval = PokerDeck.evaluateHand(fhCards);
  console.log(`- 葫芦测试: Rank=${fhEval.rank} (${fhEval.name}) => ${fhEval.rank === 7 ? '✅ 通过' : '❌ 失败'}`);

  // 同花 (Flush)
  const flushCards = [
    { suit: 'diamonds', value: 14 },
    { suit: 'diamonds', value: 10 },
    { suit: 'diamonds', value: 7 },
    { suit: 'diamonds', value: 5 },
    { suit: 'diamonds', value: 3 },
    { suit: 'hearts', value: 2 },
    { suit: 'spades', value: 9 }
  ];
  const flushEval = PokerDeck.evaluateHand(flushCards);
  console.log(`- 同花测试: Rank=${flushEval.rank} (${flushEval.name}) => ${flushEval.rank === 6 ? '✅ 通过' : '❌ 失败'}`);

  // 顺子 (Straight) - A2345 特殊顺子
  const wheelCards = [
    { suit: 'spades', value: 14 },
    { suit: 'hearts', value: 5 },
    { suit: 'diamonds', value: 4 },
    { suit: 'clubs', value: 3 },
    { suit: 'hearts', value: 2 },
    { suit: 'diamonds', value: 10 },
    { suit: 'clubs', value: 12 }
  ];
  const wheelEval = PokerDeck.evaluateHand(wheelCards);
  console.log(`- A-2-3-4-5 顺子测试: Rank=${wheelEval.rank} (${wheelEval.name}) => ${wheelEval.rank === 5 ? '✅ 通过' : '❌ 失败'}`);

  // 两对比较
  const tp1 = PokerDeck.evaluateHand([
    { suit: 'spades', value: 14 }, { suit: 'hearts', value: 14 },
    { suit: 'diamonds', value: 8 }, { suit: 'clubs', value: 8 },
    { suit: 'hearts', value: 10 }, { suit: 'spades', value: 2 }, { suit: 'clubs', value: 3 }
  ]);
  const tp2 = PokerDeck.evaluateHand([
    { suit: 'spades', value: 13 }, { suit: 'hearts', value: 13 },
    { suit: 'diamonds', value: 8 }, { suit: 'clubs', value: 8 },
    { suit: 'hearts', value: 10 }, { suit: 'spades', value: 2 }, { suit: 'clubs', value: 3 }
  ]);
  const compareRes = PokerDeck.compareEvaluated(tp1, tp2);
  console.log(`- 两对大小比对 (AA88 vs KK88): A胜判定=${compareRes > 0 ? '✅ 通过' : '❌ 失败'}`);

  // 单牌最大是 A 测试
  const highA = PokerDeck.evaluateHand([
    { suit: 'spades', value: 14 }, { suit: 'hearts', value: 10 },
    { suit: 'diamonds', value: 8 }, { suit: 'clubs', value: 6 },
    { suit: 'hearts', value: 3 }, { suit: 'spades', value: 2 }, { suit: 'clubs', value: 4 }
  ]);
  const highK = PokerDeck.evaluateHand([
    { suit: 'spades', value: 13 }, { suit: 'hearts', value: 12 },
    { suit: 'diamonds', value: 9 }, { suit: 'clubs', value: 7 },
    { suit: 'hearts', value: 5 }, { suit: 'spades', value: 3 }, { suit: 'clubs', value: 2 }
  ]);
  const highCardCompare = PokerDeck.compareEvaluated(highA, highK);
  console.log(`- 单牌高牌测试: A大牌型名称=${highA.name}, A胜过K判定=${highCardCompare > 0 ? '✅ 通过' : '❌ 失败'}`);
}

// 2. 测试 ALL-IN 5% 概率神佑生还 (8 弹巢总容量)
function testAllInSurvival() {
  console.log('\n2. 测试 ALL-IN 5% 概率神明生还机制 (8 弹巢满装填，模拟 10,000 次):');
  let survivedCount = 0;
  const trials = 10000;
  for (let i = 0; i < trials; i++) {
    const res = Revolver.pullTrigger(8, true);
    if (res.survived) survivedCount++;
  }
  const survivalRate = (survivedCount / trials) * 100;
  console.log(`- 模拟 ${trials} 次 ALL-IN 轮盘赌: 生还次数 = ${survivedCount}, 生还率 = ${survivalRate.toFixed(2)}% (期望值: 5.0%) => ${survivalRate >= 4.0 && survivalRate <= 6.0 ? '✅ 统计达标' : '⚠️ 波动范围'}`);
}

testEvaluation();
testAllInSurvival();
console.log('\n====================================');
console.log('🎉 算法与规则验证完毕！');
console.log('====================================');
