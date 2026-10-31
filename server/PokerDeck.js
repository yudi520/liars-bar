/**
 * 骗子酒馆 - 德州扑克牌组与最佳 5 张牌算法 (PokerDeck.js)
 * 支持 52 张标准扑克牌、洗牌、发牌以及 7 选 5 最佳牌型评估与比较
 */

const SUITS = [
  { id: 'spades', symbol: '♠', name: '黑桃', color: '#1e293b' },
  { id: 'hearts', symbol: '♥', name: '红心', color: '#e11d48' },
  { id: 'diamonds', symbol: '♦', name: '方块', color: '#ea580c' },
  { id: 'clubs', symbol: '♣', name: '梅花', color: '#047857' }
];

const VALUES = [
  { val: 2, label: '2' },
  { val: 3, label: '3' },
  { val: 4, label: '4' },
  { val: 5, label: '5' },
  { val: 6, label: '6' },
  { val: 7, label: '7' },
  { val: 8, label: '8' },
  { val: 9, label: '9' },
  { val: 10, label: '10' },
  { val: 11, label: 'J' },
  { val: 12, label: 'Q' },
  { val: 13, label: 'K' },
  { val: 14, label: 'A' }
];

const HAND_RANKS = {
  ROYAL_FLUSH: { rank: 10, name: '皇家同花顺', en: 'Royal Flush', desc: '同一花色的 A, K, Q, J, 10' },
  STRAIGHT_FLUSH: { rank: 9, name: '同花顺', en: 'Straight Flush', desc: '同一花色的五张连续牌' },
  FOUR_OF_A_KIND: { rank: 8, name: '四条 / 炸弹', en: 'Four of a Kind', desc: '四张相同点数的牌' },
  FULL_HOUSE: { rank: 7, name: '葫芦 / 满堂红', en: 'Full House', desc: '三张相同点数 + 一对' },
  FLUSH: { rank: 6, name: '同花', en: 'Flush', desc: '同一花色的任意五张牌' },
  STRAIGHT: { rank: 5, name: '顺子', en: 'Straight', desc: '五张连续但不同花色的牌' },
  THREE_OF_A_KIND: { rank: 4, name: '三条', en: 'Three of a Kind', desc: '三张相同点数的牌' },
  TWO_PAIR: { rank: 3, name: '两对', en: 'Two Pair', desc: '两对不同点数的牌' },
  ONE_PAIR: { rank: 2, name: '一对', en: 'One Pair', desc: '一对相同点数的牌' },
  HIGH_CARD: { rank: 1, name: '高牌 / 散牌', en: 'High Card', desc: '无任何组合时的最大单牌' }
};

function getValLabel(val) {
  if (val === 14) return 'A';
  if (val === 13) return 'K';
  if (val === 12) return 'Q';
  if (val === 11) return 'J';
  return String(val);
}

class PokerDeck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const val of VALUES) {
        this.cards.push({
          id: `${suit.id}_${val.val}`,
          suit: suit.id,
          suitSymbol: suit.symbol,
          suitName: suit.name,
          color: suit.color,
          value: val.val,
          label: val.label
        });
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(count = 1) {
    if (this.cards.length < count) {
      this.reset();
    }
    return this.cards.splice(0, count);
  }

  /**
   * 从给定的 7 张牌（2 张手牌 + 5 张公共牌）中计算最佳 5 张牌组合及牌型
   * @param {Array} cards 长度为 5~7 的卡牌数组
   */
  static evaluateHand(cards) {
    if (!cards || cards.length < 5) {
      return { rank: 0, name: '牌数不足', score: 0, tieBreakers: [], best5Cards: cards || [] };
    }

    const combos = PokerDeck.getCombinations(cards, 5);
    let bestHand = null;

    for (const combo of combos) {
      const evaluated = PokerDeck.evaluate5Cards(combo);
      if (!bestHand || PokerDeck.compareEvaluated(evaluated, bestHand) > 0) {
        bestHand = evaluated;
      }
    }

    return bestHand;
  }

  /**
   * 获取数组中指定数量的所有组合 (C(n, k))
   */
  static getCombinations(arr, k) {
    const results = [];
    function helper(start, combo) {
      if (combo.length === k) {
        results.push([...combo]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    }
    helper(0, []);
    return results;
  }

  /**
   * 评估确切的 5 张牌
   */
  static evaluate5Cards(cards5) {
    // 按点数从大到小排序
    const sorted = [...cards5].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);

    // 检查是否同花
    const isFlush = suits.every(s => s === suits[0]);

    // 检查是否顺子 (包括 A-2-3-4-5 特殊顺子，A 作 1)
    let isStraight = false;
    let straightHigh = 0;

    const isNormalStraight = (
      values[0] - values[1] === 1 &&
      values[1] - values[2] === 1 &&
      values[2] - values[3] === 1 &&
      values[3] - values[4] === 1
    );

    const isAceLowStraight = (
      values[0] === 14 &&
      values[1] === 5 &&
      values[2] === 4 &&
      values[3] === 3 &&
      values[4] === 2
    );

    if (isNormalStraight) {
      isStraight = true;
      straightHigh = values[0];
    } else if (isAceLowStraight) {
      isStraight = true;
      straightHigh = 5; // A-2-3-4-5 高牌为 5
    }

    // 统计各点数出现频率
    const counts = {};
    for (const v of values) {
      counts[v] = (counts[v] || 0) + 1;
    }

    const countPairs = Object.entries(counts).map(([v, count]) => ({
      val: parseInt(v),
      count
    }));
    // 先按数量降序，再按点数降序
    countPairs.sort((a, b) => b.count - a.count || b.val - a.val);

    // 1. 皇家同花顺 / 同花顺
    if (isFlush && isStraight) {
      if (straightHigh === 14) {
        return {
          rank: HAND_RANKS.ROYAL_FLUSH.rank,
          name: HAND_RANKS.ROYAL_FLUSH.name,
          tieBreakers: [14],
          best5Cards: sorted
        };
      }
      return {
        rank: HAND_RANKS.STRAIGHT_FLUSH.rank,
        name: `${getValLabel(straightHigh)}高 ${HAND_RANKS.STRAIGHT_FLUSH.name}`,
        tieBreakers: [straightHigh],
        best5Cards: sorted
      };
    }

    // 2. 四条
    if (countPairs[0].count === 4) {
      return {
        rank: HAND_RANKS.FOUR_OF_A_KIND.rank,
        name: `${HAND_RANKS.FOUR_OF_A_KIND.name} (${getValLabel(countPairs[0].val)})`,
        tieBreakers: [countPairs[0].val, countPairs[1].val],
        best5Cards: sorted
      };
    }

    // 3. 葫芦 (三带二)
    if (countPairs[0].count === 3 && countPairs[1].count === 2) {
      return {
        rank: HAND_RANKS.FULL_HOUSE.rank,
        name: `${HAND_RANKS.FULL_HOUSE.name} (${getValLabel(countPairs[0].val)}带${getValLabel(countPairs[1].val)})`,
        tieBreakers: [countPairs[0].val, countPairs[1].val],
        best5Cards: sorted
      };
    }

    // 4. 同花
    if (isFlush) {
      return {
        rank: HAND_RANKS.FLUSH.rank,
        name: `${HAND_RANKS.FLUSH.name} (${getValLabel(values[0])}大)`,
        tieBreakers: values,
        best5Cards: sorted
      };
    }

    // 5. 顺子
    if (isStraight) {
      return {
        rank: HAND_RANKS.STRAIGHT.rank,
        name: `${getValLabel(straightHigh)}高 ${HAND_RANKS.STRAIGHT.name}`,
        tieBreakers: [straightHigh],
        best5Cards: sorted
      };
    }

    // 6. 三条
    if (countPairs[0].count === 3) {
      return {
        rank: HAND_RANKS.THREE_OF_A_KIND.rank,
        name: `${HAND_RANKS.THREE_OF_A_KIND.name} (${getValLabel(countPairs[0].val)})`,
        tieBreakers: [countPairs[0].val, countPairs[1].val, countPairs[2].val],
        best5Cards: sorted
      };
    }

    // 7. 两对
    if (countPairs[0].count === 2 && countPairs[1].count === 2) {
      return {
        rank: HAND_RANKS.TWO_PAIR.rank,
        name: `${HAND_RANKS.TWO_PAIR.name} (${getValLabel(countPairs[0].val)}与${getValLabel(countPairs[1].val)})`,
        tieBreakers: [countPairs[0].val, countPairs[1].val, countPairs[2].val],
        best5Cards: sorted
      };
    }

    // 8. 一对
    if (countPairs[0].count === 2) {
      return {
        rank: HAND_RANKS.ONE_PAIR.rank,
        name: `${HAND_RANKS.ONE_PAIR.name} (${getValLabel(countPairs[0].val)})`,
        tieBreakers: [countPairs[0].val, countPairs[1].val, countPairs[2].val, countPairs[3].val],
        best5Cards: sorted
      };
    }

    // 9. 高牌 (单牌最大是 A)
    return {
      rank: HAND_RANKS.HIGH_CARD.rank,
      name: `${HAND_RANKS.HIGH_CARD.name} (${getValLabel(values[0])}大)`,
      tieBreakers: values,
      best5Cards: sorted
    };
  }

  /**
   * 比较两手牌大小
   * @returns 1: A 胜, -1: B 胜, 0: 平手
   */
  static compareEvaluated(a, b) {
    if (a.rank !== b.rank) {
      return a.rank > b.rank ? 1 : -1;
    }
    const len = Math.min(a.tieBreakers.length, b.tieBreakers.length);
    for (let i = 0; i < len; i++) {
      if (a.tieBreakers[i] !== b.tieBreakers[i]) {
        return a.tieBreakers[i] > b.tieBreakers[i] ? 1 : -1;
      }
    }
    return 0;
  }

  /**
   * 严格决胜比对（绝不平手，必分胜负）：
   * 1. 首先比较 7 选 5 最佳牌型 (compareEvaluated)
   * 2. 若最佳牌型完全相同，启动单牌比对规则：比较各自手底 2 张私有牌大小（先比大单牌，再比小单牌）
   * 3. 若手底单牌点数依然完全一致，比较底牌最大单牌的花色 (黑桃 ♠ > 红心 ♥ > 梅花 ♣ > 方块 ♦)
   * @param {Object} itemA { player: { cards }, evaluation } 或 { cards, evaluation }
   * @param {Object} itemB { player: { cards }, evaluation } 或 { cards, evaluation }
   * @returns {number} 1: A 胜, -1: B 胜 (在单副标准 52 张扑克牌规则下绝不返回 0)
   */
  static comparePlayerShowdown(itemA, itemB) {
    if (!itemA && !itemB) return 0;
    if (!itemA) return -1;
    if (!itemB) return 1;

    // 1. 优先比较 7 选 5 最佳牌型
    const evalDiff = PokerDeck.compareEvaluated(itemA.evaluation, itemB.evaluation);
    if (evalDiff !== 0) {
      return evalDiff;
    }

    // 2. 牌型完全相同时，比单牌大小（比较两名玩家手底底牌）
    const cardsA = [...((itemA.player && itemA.player.cards) || itemA.cards || [])].sort((c1, c2) => (c2.value || 0) - (c1.value || 0));
    const cardsB = [...((itemB.player && itemB.player.cards) || itemB.cards || [])].sort((c1, c2) => (c2.value || 0) - (c1.value || 0));

    const maxLen = Math.max(cardsA.length, cardsB.length);
    for (let i = 0; i < maxLen; i++) {
      const valA = cardsA[i] ? (cardsA[i].value || 0) : 0;
      const valB = cardsB[i] ? (cardsB[i].value || 0) : 0;
      if (valA !== valB) {
        return valA > valB ? 1 : -1;
      }
    }

    // 3. 底牌点数仍相同，比单牌花色 (黑桃 ♠=4 > 红心 ♥=3 > 梅花 ♣=2 > 方块 ♦=1)
    const suitWeights = { spades: 4, hearts: 3, clubs: 2, diamonds: 1 };
    for (let i = 0; i < maxLen; i++) {
      const sA = cardsA[i] ? (suitWeights[cardsA[i].suit] || 0) : 0;
      const sB = cardsB[i] ? (suitWeights[cardsB[i].suit] || 0) : 0;
      if (sA !== sB) {
        return sA > sB ? 1 : -1;
      }
    }

    return 0;
  }
}

module.exports = {
  PokerDeck,
  SUITS,
  VALUES,
  HAND_RANKS
};
