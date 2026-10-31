/**
 * 骗子酒馆 - 拟真电脑选手库 (AIBot.js)
 * 支持全随机名号、随机头像与随机心理博弈参数 (激进、谨慎、偷鸡、换牌倾向均不相同)
 */

const PREFIXES = [
  '老猎手', '狂徒', '红狐', '快手', '赌棍', '疯狗', '黑鸦', '铁拳',
  '独眼', '影客', '醉鬼', '夜枭', '毒蛇', '巨熊', '赏金客', '枪客',
  '幽灵', '恶霸', '冷面', '老鬼', '疤面', '暴徒', '游侠', '笑面虎'
];

const NAMES = [
  '布里斯托', '加里', '托珀', '洛基', '斯卡', '比利', '范德兰', '摩根',
  '亚瑟', '达奇', '迈卡', '查尔斯', '肖恩', '哈维尔', '约翰', '克林特',
  '韦恩', '杰克', '鲍勃', '麦克雷', '雷克斯', '沃克', '霍桑', '格林'
];

const AVATARS = [
  '🐻', '🐺', '🦊', '🐒', '🐗', '🐯', '🦁', '🦅',
  '🦉', '🐍', '🐊', '🦬', '🦏', '🦝', '🦇', '🦈',
  '🤠', '🦹', '🥷', '🕵️'
];

class AIBot {
  /**
   * 随机创建一名独一无二的 AI 选手
   * @param {Array} existingPlayers 当前房间内已有的玩家列表（防止重名重头像）
   */
  static createBot(existingPlayers = []) {
    const playersList = Array.isArray(existingPlayers) ? existingPlayers : [];
    const usedNames = new Set(playersList.map(p => p.name));
    const usedAvatars = new Set(playersList.map(p => p.avatar));

    // 1. 随机组合不重复的名字
    let name = '';
    let attempts = 0;
    while (!name || usedNames.has(name)) {
      const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
      const baseName = NAMES[Math.floor(Math.random() * NAMES.length)];
      name = `${prefix}·${baseName}`;
      attempts++;
      if (attempts > 30) {
        if (usedNames.has(name)) {
          name = `${name}${Math.floor(Math.random() * 90 + 10)}`;
        }
        break;
      }
    }

    // 2. 随机抽取不重复的头像
    let availableAvatars = AVATARS.filter(a => !usedAvatars.has(a));
    if (availableAvatars.length === 0) availableAvatars = AVATARS;
    const avatar = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];

    // 3. 随机博弈偏好与策略参数 (完全随机不固定)
    // 偷鸡诈唬倾向 (0.10 ~ 0.55)
    const bluffChance = Math.round((0.10 + Math.random() * 0.45) * 100) / 100;
    // 掀桌 ALL-IN 倾向 (0.15 ~ 0.65)
    const allInChance = Math.round((0.15 + Math.random() * 0.50) * 100) / 100;
    // 换牌偏好倾向 (0.20 ~ 0.75)
    const switchPreference = Math.round((0.20 + Math.random() * 0.55) * 100) / 100;

    // 结合策略参数提炼拟真性格标签
    let personality = '老辣沉稳';
    if (allInChance >= 0.50 && bluffChance >= 0.35) {
      personality = '凶悍亡命';
    } else if (allInChance <= 0.25 && bluffChance <= 0.20) {
      personality = '谨慎保命';
    } else if (switchPreference >= 0.60) {
      personality = '精明善变';
    } else if (bluffChance >= 0.40) {
      personality = '狡诈虚张';
    }

    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    return {
      id: botId,
      name,
      avatar,
      isHost: false,
      isBot: true,
      connected: true,
      personality,
      bluffChance,
      allInChance,
      switchPreference,
      isAlive: true,
      inHand: false,
      cards: [],
      dice: [],
      poisonDrunk: 0,
      bulletsFired: 0,
      bulletsBet: 0,
      hasUsedCowardFold: false,
      hasUsedSwitch: false,
      switchedThisTurn: false,
      isAllIn: false,
      hasActedInRound: false,
      revealedCards: false
    };
  }
}

module.exports = {
  AIBot
};
