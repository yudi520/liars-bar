/**
 * 骗子酒馆 - 骗子纸牌专属牌库 (LiarsDeck.js)
 * 经典纸牌模式：
 * 6 张 Q、6 张 K、6 张 A (共 18 张)
 * 2 张 Joker (万能牌 / 赖子)
 * 可选添加 1 张 Devil 卡 (恶魔牌，默认开启)
 */

const SUITS = [
  { id: 'spades', symbol: '♠', name: '黑桃', color: '#1e293b' },
  { id: 'hearts', symbol: '♥', name: '红心', color: '#e11d48' },
  { id: 'diamonds', symbol: '♦', name: '方块', color: '#ea580c' },
  { id: 'clubs', symbol: '♣', name: '梅花', color: '#047857' }
];

class LiarsDeck {
  constructor(enableDevilCard = true) {
    this.enableDevilCard = enableDevilCard;
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    let uid = 1;

    // 1. 生成基础 18 张牌：Q x 6, K x 6, A x 6
    const ranks = [
      { rank: 'Q', value: 12, label: 'Q' },
      { rank: 'K', value: 13, label: 'K' },
      { rank: 'A', value: 14, label: 'A' }
    ];

    for (const r of ranks) {
      for (let i = 0; i < 6; i++) {
        const suit = SUITS[i % SUITS.length];
        this.cards.push({
          id: `card_${r.rank}_${uid++}`,
          type: 'NORMAL',
          rank: r.rank,
          value: r.value,
          label: r.label,
          suit: suit.id,
          suitSymbol: suit.symbol,
          suitName: suit.name,
          color: suit.color
        });
      }
    }

    // 2. 生成 2 张 Joker 万能百搭牌
    for (let j = 1; j <= 2; j++) {
      this.cards.push({
        id: `card_joker_${uid++}`,
        type: 'JOKER',
        rank: 'JOKER',
        value: 99,
        label: '🃏',
        suit: 'joker',
        suitSymbol: 'JOKER',
        suitName: '小丑',
        color: '#8b5cf6'
      });
    }

    // 3. 生成 1 张 Devil 恶魔卡 (若房主开启，默认开启)
    if (this.enableDevilCard) {
      this.cards.push({
        id: `card_devil_${uid++}`,
        type: 'DEVIL',
        rank: 'DEVIL',
        value: 666,
        label: '😈',
        suit: 'devil',
        suitSymbol: 'DEVIL',
        suitName: '恶魔',
        color: '#ef4444'
      });
    }

    this.shuffle();
  }

  /**
   * Fisher-Yates 充分洗牌算法
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * 发牌
   * @param {number} count 抽取张数
   */
  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this.cards.length === 0) break;
      drawn.push(this.cards.pop());
    }
    return drawn;
  }

  get remaining() {
    return this.cards.length;
  }
}

module.exports = LiarsDeck;
