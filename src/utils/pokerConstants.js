/**
 * 骗子酒馆 - 德州扑克牌型规则字典与辅助库 (pokerConstants.js)
 * 完全还原规则截图中的 10 大牌型标准与中文字典
 */

export const HAND_RANK_LIST = [
  {
    rank: 10,
    order: '👑 1st',
    name: '皇家同花顺',
    en: 'ROYAL FLUSH',
    desc: '同一花色的 A, K, Q, J 和 10',
    sample: [
      { label: 'A', suit: '♠', color: '#1e293b' },
      { label: 'K', suit: '♠', color: '#1e293b' },
      { label: 'Q', suit: '♠', color: '#1e293b' },
      { label: 'J', suit: '♠', color: '#1e293b' },
      { label: '10', suit: '♠', color: '#1e293b' }
    ]
  },
  {
    rank: 9,
    order: '🥈 2nd',
    name: '同花顺',
    en: 'STRAIGHT FLUSH',
    desc: '同一花色的五张连续牌',
    sample: [
      { label: 'J', suit: '♥', color: '#e11d48' },
      { label: '10', suit: '♥', color: '#e11d48' },
      { label: '9', suit: '♥', color: '#e11d48' },
      { label: '8', suit: '♥', color: '#e11d48' },
      { label: '7', suit: '♥', color: '#e11d48' }
    ]
  },
  {
    rank: 8,
    order: '🥉 3rd',
    name: '四条 / 炸弹',
    en: 'FOUR OF A KIND',
    desc: '四张相同点数的牌',
    sample: [
      { label: '9', suit: '♣', color: '#047857' },
      { label: '9', suit: '♦', color: '#ea580c' },
      { label: '9', suit: '♠', color: '#1e293b' },
      { label: '9', suit: '♥', color: '#e11d48' },
      { label: 'Q', suit: '♣', color: '#047857' }
    ]
  },
  {
    rank: 7,
    order: '4th',
    name: '葫芦 / 满堂红',
    en: 'FULL HOUSE',
    desc: '三张相同点数的牌加一对其他点数的牌',
    sample: [
      { label: 'K', suit: '♦', color: '#ea580c' },
      { label: 'K', suit: '♠', color: '#1e293b' },
      { label: 'K', suit: '♥', color: '#e11d48' },
      { label: '3', suit: '♠', color: '#1e293b' },
      { label: '3', suit: '♥', color: '#e11d48' }
    ]
  },
  {
    rank: 6,
    order: '5th',
    name: '同花',
    en: 'FLUSH',
    desc: '同一花色的任意五张牌',
    sample: [
      { label: 'A', suit: '♠', color: '#1e293b' },
      { label: '10', suit: '♠', color: '#1e293b' },
      { label: '7', suit: '♠', color: '#1e293b' },
      { label: '5', suit: '♠', color: '#1e293b' },
      { label: '3', suit: '♠', color: '#1e293b' }
    ]
  },
  {
    rank: 5,
    order: '6th',
    name: '顺子',
    en: 'STRAIGHT',
    desc: '五张顺连但不同花色的牌',
    sample: [
      { label: '10', suit: '♦', color: '#ea580c' },
      { label: '9', suit: '♣', color: '#047857' },
      { label: '8', suit: '♥', color: '#e11d48' },
      { label: '7', suit: '♠', color: '#1e293b' },
      { label: '6', suit: '♦', color: '#ea580c' }
    ]
  },
  {
    rank: 4,
    order: '7th',
    name: '三条',
    en: 'THREE OF A KIND',
    desc: '三张相同点数的牌',
    sample: [
      { label: '7', suit: '♣', color: '#047857' },
      { label: '7', suit: '♦', color: '#ea580c' },
      { label: '7', suit: '♠', color: '#1e293b' },
      { label: 'Q', suit: '♥', color: '#e11d48' },
      { label: '3', suit: '♠', color: '#1e293b' }
    ]
  },
  {
    rank: 3,
    order: '8th',
    name: '两对',
    en: 'TWO PAIR',
    desc: '两对不同点数的牌',
    sample: [
      { label: 'J', suit: '♥', color: '#e11d48' },
      { label: 'J', suit: '♠', color: '#1e293b' },
      { label: '5', suit: '♦', color: '#ea580c' },
      { label: '5', suit: '♠', color: '#1e293b' },
      { label: '9', suit: '♥', color: '#e11d48' }
    ]
  },
  {
    rank: 2,
    order: '9th',
    name: '一对',
    en: 'ONE PAIR',
    desc: '一对相同点数的牌',
    sample: [
      { label: 'A', suit: '♠', color: '#1e293b' },
      { label: 'A', suit: '♦', color: '#ea580c' },
      { label: 'K', suit: '♣', color: '#047857' },
      { label: '10', suit: '♥', color: '#e11d48' },
      { label: '3', suit: '♠', color: '#1e293b' }
    ]
  },
  {
    rank: 1,
    order: '10th',
    name: '高牌 / 散牌',
    en: 'HIGH CARD',
    desc: '当没有任何组合时，最大的那张牌',
    sample: [
      { label: 'K', suit: '♦', color: '#ea580c' },
      { label: '6', suit: '♠', color: '#1e293b' },
      { label: 'Q', suit: '♥', color: '#e11d48' },
      { label: '9', suit: '♣', color: '#047857' },
      { label: '3', suit: '♥', color: '#e11d48' }
    ]
  }
];

export const AVATAR_OPTIONS = [
  { id: 'bear', emoji: '🐻', name: '棕熊' },
  { id: 'wolf', emoji: '🐺', name: '恶狼' },
  { id: 'fox', emoji: '🦊', name: '红狐' },
  { id: 'monkey', emoji: '🐵', name: '金丝猴' },
  { id: 'dog', emoji: '🐶', name: '猎犬' },
  { id: 'lion', emoji: '🦁', name: '雄狮' },
  { id: 'cowboy', emoji: '🤠', name: '牛仔' },
  { id: 'cool', emoji: '🕶️', name: '盲侠' }
];

function getCardValue(c) {
  if (typeof c.value === 'number') return c.value;
  const map = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
  return map[c.label] || 2;
}

function getValLabel(val) {
  if (val === 14) return 'A';
  if (val === 13) return 'K';
  if (val === 12) return 'Q';
  if (val === 11) return 'J';
  return String(val);
}

function evaluate5Cards(cards5) {
  const sorted = [...cards5].sort((a, b) => getCardValue(b) - getCardValue(a));
  const values = sorted.map(c => getCardValue(c));
  const suits = sorted.map(c => c.suit || c.suitSymbol);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;
  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
    straightHigh = values[0];
  } else if (
    values[0] === 14 &&
    values[1] === 5 &&
    values[2] === 4 &&
    values[3] === 3 &&
    values[4] === 2
  ) {
    isStraight = true;
    straightHigh = 5;
  }

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const countPairs = Object.entries(counts).map(([v, count]) => ({
    val: parseInt(v),
    count
  }));
  countPairs.sort((a, b) => b.count - a.count || b.val - a.val);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 10, name: '皇家同花顺', tie: [14] };
    return { rank: 9, name: `${getValLabel(straightHigh)}高 同花顺`, tie: [straightHigh] };
  }
  if (countPairs[0].count === 4) {
    return { rank: 8, name: `四条 (${getValLabel(countPairs[0].val)})`, tie: [countPairs[0].val, countPairs[1].val] };
  }
  if (countPairs[0].count === 3 && countPairs[1].count === 2) {
    return { rank: 7, name: `葫芦 (${getValLabel(countPairs[0].val)}带${getValLabel(countPairs[1].val)})`, tie: [countPairs[0].val, countPairs[1].val] };
  }
  if (isFlush) {
    return { rank: 6, name: `同花 (${getValLabel(values[0])}大)`, tie: values };
  }
  if (isStraight) {
    return { rank: 5, name: `${getValLabel(straightHigh)}高 顺子`, tie: [straightHigh] };
  }
  if (countPairs[0].count === 3) {
    return { rank: 4, name: `三条 (${getValLabel(countPairs[0].val)})`, tie: [countPairs[0].val] };
  }
  if (countPairs[0].count === 2 && countPairs[1].count === 2) {
    return { rank: 3, name: `两对 (${getValLabel(countPairs[0].val)}与${getValLabel(countPairs[1].val)})`, tie: [countPairs[0].val, countPairs[1].val] };
  }
  if (countPairs[0].count === 2) {
    return { rank: 2, name: `一对 (${getValLabel(countPairs[0].val)})`, tie: [countPairs[0].val] };
  }
  return { rank: 1, name: `高牌 (${getValLabel(values[0])}大)`, tie: values };
}

function getCombos(arr, k) {
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

export function evaluatePlayerHand(playerCards, communityCards) {
  if (!playerCards || playerCards.length < 2 || !communityCards || communityCards.length < 3) {
    return null;
  }
  const allCards = [...playerCards, ...communityCards].filter(c => c && !c.hidden);
  if (allCards.length < 5) return null;

  const combos = getCombos(allCards, 5);
  let best = null;
  for (const combo of combos) {
    const res = evaluate5Cards(combo);
    if (!best || res.rank > best.rank) {
      best = res;
    } else if (res.rank === best.rank) {
      for (let i = 0; i < (res.tie || []).length; i++) {
        if (res.tie[i] > (best.tie[i] || 0)) {
          best = res;
          break;
        } else if (res.tie[i] < (best.tie[i] || 0)) {
          break;
        }
      }
    }
  }
  if (!best) return null;
  const rankOrder = 11 - best.rank;
  return {
    rank: best.rank,
    rankOrder,
    rankName: best.name,
    rankOrderText: `第 ${rankOrder} 大牌型`
  };
}
