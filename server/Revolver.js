/**
 * 骗子酒馆 - 左轮轮盘赌裁决系统 (Revolver.js)
 * 8 弹巢左轮手枪（总容量 8 颗子弹）。
 * 正常根据已下注子弹数量判定中弹几率 (K / 8)；
 * ALL-IN 玩家装填满弹 (8 颗)，但享有特殊机制：输了有 5% 的奇迹概率神明保佑生还！
 */

class Revolver {
  /**
   * 扣动扳机
   * @param {number} bullets 下注/装填的子弹数量 (1 ~ 8)
   * @param {boolean} isAllIn 是否属于 ALL-IN 孤注一掷状态
   * @returns {Object} 裁决结果
   */
  static pullTrigger(bullets = 1, isAllIn = false) {
    const chamberCount = 8;
    const bulletsLoaded = Math.max(1, Math.min(bullets, chamberCount));
    const roll = Math.random(); // 0.0 ~ 1.0 随机数

    // 针对 ALL-IN 玩家的特殊规则：输了有 5% 概率神明回应奇迹生还
    if (isAllIn || bulletsLoaded >= chamberCount) {
      const survivalProbability = 0.05; // 5% 生还率
      const survived = roll < survivalProbability;

      return {
        isBang: !survived,
        survived,
        bulletsLoaded: 8,
        isAllIn: true,
        roll: Number(roll.toFixed(4)),
        miracleSaved: survived,
        message: survived
          ? '🌟【神迹降临】虽然 8 颗子弹装填满弹，但底火奇迹哑火！神明罕见回应了你的祈祷，你奇迹生还！'
          : '💥【砰！】孤注一掷失败，枪火轰鸣，直面死神！'
      };
    }

    // 正常下注子弹判定：几率为 bulletsLoaded / 8
    const bangProbability = bulletsLoaded / chamberCount;
    const isBang = roll < bangProbability;
    const survived = !isBang;

    return {
      isBang,
      survived,
      bulletsLoaded,
      isAllIn: false,
      roll: Number(roll.toFixed(4)),
      miracleSaved: false,
      message: survived
        ? `💨【咔嗒】空枪弹巢！(${bulletsLoaded}/8 风险) 侥幸生还！`
        : `💥【砰！】枪声震耳欲聋！(${bulletsLoaded}/8 几率) 致命命中！`
    };
  }
}

module.exports = Revolver;
