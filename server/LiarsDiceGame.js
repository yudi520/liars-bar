/**
 * 骗子酒馆 - 骗子骰子 · 吹牛模式核心游戏引擎 (LiarsDiceGame.js)
 * 完整支持 5 颗暗骰摇盅、加码报数校验、1点万能赖子与可选锁1机制、
 * 官方原版 2 瓶毒药惩罚 / 6 孔左轮轮盘赌切换、精确命中 (Spot-on)、
 * 人机 AI 期望决策、淘汰全景透视观战与断线重连托管。
 */

const Revolver = require('./Revolver');

class LiarsDiceGame {
  constructor(room) {
    this.room = room;

    // 房主自定义规则配置
    this.config = {
      maxPlayers: 4,               // 房间人数上限 (2 ~ 4 人，默认 4)
      punishType: 'POISON',        // 惩罚方式：'POISON' (2瓶毒药，喝完淘汰，官方原版) | 'ROULETTE' (6孔左轮)
      enableLockOne: false,        // 锁1规则 (叫1破百搭)：额外机制，默认关闭 (默认1始终为万能)
      enableSpotOn: false,         // 精确命中 (Spot-on)：额外机制，默认关闭
      disableTurnTimer: false,     // ⏳ 不限时思考机制 (不读秒)：默认关闭
      disableSpectatorXray: false, // 🙈 观战无透视：默认关闭 (默认开启全景透视)
      dicePerPlayer: 5             // 玩家手骰数量 (可在 3 ~ 10 颗之间调整，默认 5 颗)
    };

    // 游戏全局状态机
    this.status = 'LOBBY';         // LOBBY, ROLLING, BIDDING, REVEAL, PUNISHMENT, ROUND_SUMMARY, GAME_OVER
    this.roundNumber = 0;

    // 叫点与轮盘/毒药记录
    this.currentBid = null;        // { playerId, playerName, quantity, faceValue }
    this.roundBids = [];           // 本手牌局完整喊点流水历史 [{ playerId, playerName, avatar, quantity, faceValue }]
    this.lastBidderId = null;      // 上一位叫点玩家 ID
    this.wildLocked = false;       // 1 点是否已被锁死失效 (仅当 enableLockOne 为 true 且有人叫过 1 点时触发)

    this.currentTurnPlayerId = null;
    this.turnDeadline = 0;
    this.turnTimer = null;
    this.rollingTimer = null;
    this.roundTimer = null;

    // 结算事件与流水日志
    this.revealEvent = null;       // 掀盅验骰事件快照
    this.punishEvent = null;       // 惩罚执行事件快照
    this.logs = [];
  }

  addLog(msg) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 50) this.logs.pop();
  }

  updateConfig(newConfig = {}) {
    if (this.status !== 'LOBBY') return false;
    if (typeof newConfig.maxPlayers === 'number' && newConfig.maxPlayers >= 2 && newConfig.maxPlayers <= 4) {
      this.config.maxPlayers = newConfig.maxPlayers;
    }
    if (newConfig.punishType === 'POISON' || newConfig.punishType === 'ROULETTE') {
      this.config.punishType = newConfig.punishType;
    }
    if (typeof newConfig.enableLockOne === 'boolean') {
      this.config.enableLockOne = newConfig.enableLockOne;
    }
    if (typeof newConfig.enableSpotOn === 'boolean') {
      this.config.enableSpotOn = newConfig.enableSpotOn;
    }
    if (typeof newConfig.disableTurnTimer === 'boolean') {
      this.config.disableTurnTimer = newConfig.disableTurnTimer;
    }
    if (typeof newConfig.disableSpectatorXray === 'boolean') {
      this.config.disableSpectatorXray = newConfig.disableSpectatorXray;
    }
    if (typeof newConfig.dicePerPlayer === 'number' && newConfig.dicePerPlayer >= 3 && newConfig.dicePerPlayer <= 10) {
      this.config.dicePerPlayer = Math.round(newConfig.dicePerPlayer);
    }

    const punishName = this.config.punishType === 'POISON' ? '🧪 2瓶致命毒药' : '🔫 6孔俄罗斯轮盘';
    const lockOneName = this.config.enableLockOne ? '🔒 开启叫1破百搭' : '✨ 1点全程万能';
    const spotOnName = this.config.enableSpotOn ? '🎯 开启精确命中' : '🚫 关闭精确命中';
    const timerName = this.config.disableTurnTimer ? '⏳ 不限时思考(不读秒)' : '⏱️ 20秒读秒';
    const specName = this.config.disableSpectatorXray ? '🙈 观战无透视' : '👁️ 观战透视';
    const diceCntName = `🎲 每人${this.config.dicePerPlayer || 5}颗手骰`;

    this.addLog(`房主更新了骰子规则：${punishName}，${lockOneName}，${spotOnName}，${timerName}，${specName}，${diceCntName}，上限 ${this.config.maxPlayers} 人。`);
    return true;
  }

  clearAllTimers() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.rollingTimer) {
      clearTimeout(this.rollingTimer);
      this.rollingTimer = null;
    }
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    this.turnDeadline = 0;
  }

  /**
   * 开始全新一局游戏
   */
  startNewGame() {
    this.clearAllTimers();
    const connectedPlayers = this.room.players.filter(p => p.connected || p.isBot);
    if (connectedPlayers.length < 2) {
      this.status = 'LOBBY';
      this.roundNumber = 0;
      this.revealEvent = null;
      this.punishEvent = null;
      this.currentBid = null;
      return;
    }

    // 重置所有玩家生命与状态
    for (const p of this.room.players) {
      p.isAlive = true;
      p.poisonDrunk = 0;    // 已喝毒药瓶数 (0/2, 1/2, 2/2阵亡)
      p.bulletsFired = 0;   // 已开枪数 (轮盘模式 0~5)
      p.dice = [];          // 5颗骰子
      p.isTurn = false;
      p.isWinner = false;
      p.hasClearedCards = false;
    }

    this.roundNumber = 0;
    this.revealEvent = null;
    this.punishEvent = null;
    this.currentBid = null;
    this.wildLocked = false;

    this.addLog('🎲 骗子酒馆 · 骗子骰子对决正式开启！全员摇盅准备！');
    this.startNextRound();
  }

  /**
   * 开始全新的一手骰局
   */
  startNextRound(starterPlayerId = null) {
    this.clearAllTimers();
    const alivePlayers = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline || p.isBot));
    if (alivePlayers.length <= 1) {
      this.endGame();
      return;
    }

    this.roundNumber++;
    this.status = 'ROLLING';
    this.currentBid = null;
    this.roundBids = [];
    this.lastBidderId = null;
    this.wildLocked = false;
    this.revealEvent = null;
    this.punishEvent = null;

    // 1. 每位活着的人摇出手骰 (3 ~ 10 颗，默认 5 颗) 并自动升序整理
    const diceCount = Math.max(3, Math.min(10, parseInt(this.config.dicePerPlayer, 10) || 5));
    for (const p of alivePlayers) {
      p.dice = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b);
    }

    // 2. 决定起叫玩家 (若指定了starter且存活则该玩家先，否则按轮次逆时针首发)
    let firstPlayer = null;
    if (starterPlayerId) {
      firstPlayer = alivePlayers.find(p => p.id === starterPlayerId);
    }
    if (!firstPlayer) {
      const idx = (this.roundNumber - 1) % alivePlayers.length;
      firstPlayer = alivePlayers[idx];
    }
    this.currentTurnPlayerId = firstPlayer.id;

    this.addLog(`🎲 第 ${this.roundNumber} 手骰局开始！全员摇下 ${diceCount} 颗暗骰，由【${firstPlayer.name}】首发报数！`);
    this.room.broadcastState();

    // 3. 摇盅动画 1200ms 后正式进入 BIDDING 阶段
    this.rollingTimer = setTimeout(() => {
      this.rollingTimer = null;
      this.status = 'BIDDING';
      this.resetTurnCountdown();
      this.room.broadcastState();
      this.checkAITurn();
    }, 1200);
  }

  resetTurnCountdown() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    const player = this.room.players.find(p => p.id === this.currentTurnPlayerId);
    if (this.config.disableTurnTimer && player && !player.isBot) {
      this.turnDeadline = 0;
      return;
    }
    this.turnDeadline = Date.now() + 20000;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.handleTurnTimeout();
    }, 20000);
  }

  actionUpdateSelection(playerId, quantity, faceValue) {
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) return;
    player.pendingSelection = {
      quantity: parseInt(quantity, 10),
      faceValue: parseInt(faceValue, 10)
    };
  }

  isBidHigher(qty, face) {
    if (!this.currentBid) return qty >= 1 && face >= 1 && face <= 6;
    if (qty > this.currentBid.quantity) return true;
    if (qty === this.currentBid.quantity) return face > this.currentBid.faceValue;
    return false;
  }

  handleTurnTimeout() {
    if (this.status !== 'BIDDING') return;
    const player = this.room.players.find(p => p.id === this.currentTurnPlayerId);
    if (!player || !player.isAlive) return;

    this.addLog(`⏱️ 玩家【${player.name}】决策超时 (20s)，自动按当前已选出招！`);

    // 若当前叫点已达全场极限且为6点，直接质疑开盅
    if (this.currentBid) {
      const alivePlayers = this.room.players.filter(p => p.isAlive);
      const totalDiceInPlay = alivePlayers.length * (this.config.dicePerPlayer || 5);
      if (this.currentBid.quantity >= totalDiceInPlay && this.currentBid.faceValue === 6) {
        try {
          this.actionChallenge(player.id);
          return;
        } catch (_) {}
      }
    }

    // 核心规则要求：如果倒计时结束，按照已选的出
    if (player.pendingSelection) {
      const { quantity, faceValue } = player.pendingSelection;
      if (this.isBidHigher(quantity, faceValue)) {
        try {
          this.actionBid(player.id, quantity, faceValue);
          return;
        } catch (_) {}
      }
    }

    // 若无法按照已选的出（如未选或不合法），且已有前置叫点，则自动质疑；否则自动起叫保底
    if (this.currentBid) {
      try {
        this.actionChallenge(player.id);
        return;
      } catch (_) {}
    }

    try {
      const aliveCount = this.room.players.filter(p => p.isAlive).length;
      const initialQty = Math.max(1, aliveCount);
      const face = (player.dice && player.dice[0]) || 2;
      this.actionBid(player.id, initialQty, face);
    } catch (_) {
      if (this.currentBid) {
        this.actionBid(player.id, this.currentBid.quantity + 1, this.currentBid.faceValue);
      }
    }
  }

  /**
   * 玩家加码叫点
   * 必须严格遵守：数量增加，或相同数量下点数更高
   */
  actionBid(playerId, quantity, faceValue) {
    if (this.status !== 'BIDDING') throw new Error('当前非叫点阶段！');
    if (this.currentTurnPlayerId !== playerId) throw new Error('尚未轮到你的报数回合！');

    const qty = parseInt(quantity, 10);
    const face = parseInt(faceValue, 10);
    if (isNaN(qty) || isNaN(face) || face < 1 || face > 6 || qty < 1) {
      throw new Error('叫点参数不合法！点数须在 1~6 之间，数量须 ≥ 1。');
    }

    // 校验叫点递增法则
    if (this.currentBid) {
      const isQtyHigher = qty > this.currentBid.quantity;
      const isSameQtyHigherFace = qty === this.currentBid.quantity && face > this.currentBid.faceValue;
      if (!isQtyHigher && !isSameQtyHigherFace) {
        throw new Error(`叫点必须递增！当前为 ${this.currentBid.quantity} 个 ${this.currentBid.faceValue} 点，你的叫点必须增加数量或在同数量下报更高点数！`);
      }
    }

    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) throw new Error('玩家信息无效！');

    // 处理「叫1锁1 / 破百搭」规则 (仅当房间开启 enableLockOne 时)
    if (this.config.enableLockOne && face === 1 && !this.wildLocked) {
      this.wildLocked = true;
      this.addLog(`🔒 玩家【${player.name}】主动叫了 1 点！全场 1 点万能赖子属性已锁定失效（转为纯 1 点）！`);
    }

    this.currentBid = {
      playerId,
      playerName: player.name,
      avatar: player.avatar,
      quantity: qty,
      faceValue: face
    };
    this.roundBids.push({
      playerId,
      playerName: player.name,
      avatar: player.avatar,
      quantity: qty,
      faceValue: face
    });
    this.lastBidderId = playerId;

    const diceEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][face - 1];
    this.addLog(`🎲 玩家【${player.name}】叫点：${qty}个【${face}点】！`);

    // 顺位移交下家 (逆时针)
    this.advanceTurn();
  }

  /**
   * 移交下一位逆时针活跃玩家
   */
  advanceTurn() {
    const alivePlayers = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline || p.isBot));
    const curIdx = alivePlayers.findIndex(p => p.id === this.currentTurnPlayerId);
    const nextPlayer = alivePlayers[(curIdx + 1) % alivePlayers.length];

    this.currentTurnPlayerId = nextPlayer.id;
    this.resetTurnCountdown();
    this.room.broadcastState();

    this.checkAITurn();
  }

  /**
   * 玩家质疑 (开盅 / Liar!)
   */
  actionChallenge(challengerId) {
    if (this.status !== 'BIDDING') throw new Error('当前非叫点阶段，无法质疑！');
    if (this.currentTurnPlayerId !== challengerId) throw new Error('尚未轮到你的行动回合！');
    if (!this.currentBid) throw new Error('尚未有玩家叫点，无法质疑！');

    this.clearAllTimers();
    const challenger = this.room.players.find(p => p.id === challengerId);
    const bidder = this.room.players.find(p => p.id === this.currentBid.playerId);
    if (!challenger || !bidder) throw new Error('玩家状态异常！');

    this.status = 'REVEAL';
    this.addLog(`🚨 玩家【${challenger.name}】发起质疑开盅！怀疑【${bidder.name}】吹牛！`);

    // 清点全场活着的玩家的实际符合骰子
    const countResult = this.calculateDiceCount(this.currentBid.faceValue);

    // 判定胜负：若 实际总数 ≥ 叫点数，说明叫点真实/成立，质疑者失败；反之叫点者吹牛失败
    const isBidderSuccessful = countResult.totalMatching >= this.currentBid.quantity;
    const loser = isBidderSuccessful ? challenger : bidder;
    const winner = isBidderSuccessful ? bidder : challenger;

    this.revealEvent = {
      action: 'CHALLENGE',
      challengerId,
      challengerName: challenger.name,
      bidderId: bidder.id,
      bidderName: bidder.name,
      bid: { ...this.currentBid },
      targetFace: this.currentBid.faceValue,
      wildActive: countResult.wildActive,
      exactFaceCount: countResult.exactCount,
      wildCount: countResult.wildCount,
      totalMatching: countResult.totalMatching,
      isBidderSuccessful,
      winnerId: winner.id,
      winnerName: winner.name,
      loserId: loser.id,
      loserName: loser.name,
      allPlayerDice: countResult.playerDetails
    };

    const targetEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][this.currentBid.faceValue - 1];
    const wildDesc = countResult.wildActive ? `(含 ${countResult.wildCount} 个 ⚀ 赖子)` : '(1点非赖子)';
    this.addLog(`🔍 开盅验骰！全场共有 ${countResult.totalMatching} 个【${targetEmoji} ${this.currentBid.faceValue}点】${wildDesc}，叫点为 ${this.currentBid.quantity} 个！`);
    
    if (isBidderSuccessful) {
      this.addLog(`🛡️ 实际数量充足！【${bidder.name}】报数成立，质疑者【${challenger.name}】质疑失败受罚！`);
    } else {
      this.addLog(`🚨 实际数量不足！【${bidder.name}】吹牛被当场戳穿，接受惩罚！`);
    }

    this.room.broadcastState();

    // 封装惩罚上下文，精准反馈谁质疑成功/失败、谁受罚饮下毒药
    const challengeContext = {
      type: 'CHALLENGE',
      challengerName: challenger.name,
      bidderName: bidder.name,
      isBidderSuccessful,
      isChallengerLoser: isBidderSuccessful
    };

    // 延迟 4500ms 执行惩罚动效，充分留足验骰与清点查看时间
    setTimeout(() => {
      this.executePunishment(loser, winner.id, challengeContext);
    }, 4500);
  }

  /**
   * 精确命中 (Spot-on / 刚中)
   */
  actionSpotOn(callerId) {
    if (!this.config.enableSpotOn) throw new Error('本局未开启精确命中规则！');
    if (this.status !== 'BIDDING') throw new Error('当前非叫点阶段，无法发起精确命中！');
    if (this.currentTurnPlayerId !== callerId) throw new Error('尚未轮到你的行动回合！');
    if (!this.currentBid) throw new Error('尚未有玩家叫点，无法发起精确命中！');

    this.clearAllTimers();
    const caller = this.room.players.find(p => p.id === callerId);
    if (!caller) throw new Error('玩家状态异常！');

    this.status = 'REVEAL';
    this.addLog(`🎯 玩家【${caller.name}】拍桌宣布：精确命中 (Spot-on)！断定全场骰数分毫不差！`);

    const countResult = this.calculateDiceCount(this.currentBid.faceValue);
    const isExactMatch = countResult.totalMatching === this.currentBid.quantity;

    this.revealEvent = {
      action: 'SPOT_ON',
      callerId,
      callerName: caller.name,
      bid: { ...this.currentBid },
      targetFace: this.currentBid.faceValue,
      wildActive: countResult.wildActive,
      totalMatching: countResult.totalMatching,
      isExactMatch,
      allPlayerDice: countResult.playerDetails
    };

    const targetEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][this.currentBid.faceValue - 1];
    this.addLog(`🔍 开盅验骰！全场实际共有 ${countResult.totalMatching} 个【${targetEmoji}】，叫点为 ${this.currentBid.quantity} 个！`);

    if (isExactMatch) {
      this.addLog(`🌟【神准奇迹】精确命中成功！实际数量分毫不差！发起者【${caller.name}】封神，除其以外全场其余玩家均须受罚！`);
      this.room.broadcastState();
      setTimeout(() => {
        const otherVictims = this.room.players.filter(p => p.isAlive && p.id !== caller.id);
        this.executeBatchPunishment(otherVictims, caller.id);
      }, 4500);
    } else {
      this.addLog(`💥【差之毫厘】数量未能精准匹配！发起者【${caller.name}】判断失误，接受惩罚！`);
      this.room.broadcastState();
      const spotContext = {
        type: 'SPOT_ON',
        callerName: caller.name,
        isExactMatch: false
      };
      setTimeout(() => {
        this.executePunishment(caller, this.currentBid.playerId, spotContext);
      }, 4500);
    }
  }

  /**
   * 清点全场所有活着的玩家手中符合特定面值的骰子
   */
  calculateDiceCount(faceValue) {
    const alivePlayers = this.room.players.filter(p => p.isAlive);
    // 默认 1 点为万能。若房间开启了锁1规则且已被锁死，则 1 点失去万能属性 (除非原本目标点数就是 1)
    const isWildActive = !this.config.enableLockOne || !this.wildLocked;
    const countWild = isWildActive && faceValue !== 1;

    let exactCount = 0;
    let wildCount = 0;
    const playerDetails = [];

    for (const p of alivePlayers) {
      const dice = p.dice || [];
      const pExact = dice.filter(d => d === faceValue).length;
      const pWild = countWild ? dice.filter(d => d === 1).length : 0;
      exactCount += pExact;
      wildCount += pWild;

      playerDetails.push({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        dice: [...dice],
        exactCount: pExact,
        wildCount: pWild,
        total: pExact + pWild
      });
    }

    return {
      wildActive: isWildActive,
      exactCount,
      wildCount,
      totalMatching: exactCount + wildCount,
      playerDetails
    };
  }

  /**
   * 执行单名玩家惩罚 (喝毒药 或 轮盘赌开枪)
   */
  executePunishment(victim, nextStarterId = null, reasonContext = null) {
    this.status = 'PUNISHMENT';
    let isDead = false;
    let punishMessage = '';

    if (this.config.punishType === 'POISON') {
      victim.poisonDrunk = (victim.poisonDrunk || 0) + 1;
      const bottlesLeft = Math.max(0, 2 - victim.poisonDrunk);
      isDead = victim.poisonDrunk >= 2;
      if (isDead) {
        victim.isAlive = false;
      }

      // 精确描述：谁质疑成功/失败，谁饮下毒药
      let actionDesc = '';
      if (reasonContext && reasonContext.type === 'CHALLENGE') {
        if (reasonContext.isChallengerLoser) {
          actionDesc = `【${reasonContext.challengerName}】质疑失败，饮下 1 瓶毒药！`;
        } else {
          actionDesc = `【${reasonContext.challengerName}】质疑成功，【${reasonContext.bidderName}】吹牛受罚，饮下 1 瓶毒药！`;
        }
      } else if (reasonContext && reasonContext.type === 'SPOT_ON') {
        actionDesc = `【${reasonContext.callerName}】精确命中失败，饮下 1 瓶毒药！`;
      } else {
        actionDesc = `玩家【${victim.name}】对决失误，饮下 1 瓶毒药！`;
      }

      if (isDead) {
        punishMessage = `☠️【暴毙出局】${actionDesc.replace('饮下 1 瓶毒药！', '饮下第 2 瓶毒药暴毙出局！')}`;
      } else {
        punishMessage = `🧪 ${actionDesc}剩余生命: 1/2 瓶！`;
      }
    } else {
      // 俄罗斯轮盘模式 (6孔渐进)
      const chamberCapacity = 6;
      const currentBulletsFired = victim.bulletsFired || 0;
      const bangProbability = 1 / Math.max(1, chamberCapacity - currentBulletsFired);
      const isBang = Math.random() < bangProbability;

      let challengePrefix = '';
      if (reasonContext && reasonContext.type === 'CHALLENGE') {
        challengePrefix = reasonContext.isChallengerLoser
          ? `【${reasonContext.challengerName}】质疑失败直面枪口：`
          : `【${reasonContext.challengerName}】质疑成功，【${reasonContext.bidderName}】吹牛受罚直面枪口：`;
      }

      if (isBang) {
        victim.isAlive = false;
        isDead = true;
        punishMessage = `💥【砰！】${challengePrefix}致命枪火轰鸣！玩家【${victim.name}】未能逃过轮盘审判，遗憾出局！`;
      } else {
        victim.bulletsFired = currentBulletsFired + 1;
        const nextSurviveChamber = Math.max(1, chamberCapacity - victim.bulletsFired);
        punishMessage = `💨【咔嗒】${challengePrefix}空膛哑火！玩家【${victim.name}】大难不死！下次存活率: ${nextSurviveChamber - 1}/${nextSurviveChamber}！`;
      }
    }

    this.punishEvent = {
      type: this.config.punishType,
      victimId: victim.id,
      victimName: victim.name,
      poisonDrunk: victim.poisonDrunk,
      bulletsFired: victim.bulletsFired,
      isDead,
      message: punishMessage
    };

    this.addLog(punishMessage);
    this.room.broadcastState();

    // 检查终局
    this.checkGameContinuation(nextStarterId);
  }

  /**
   * 批量执行惩罚 (针对 Spot-on 成功时其余全员受罚)
   */
  executeBatchPunishment(victims, nextStarterId) {
    this.status = 'PUNISHMENT';
    const batchLogs = [];

    for (const victim of victims) {
      if (this.config.punishType === 'POISON') {
        victim.poisonDrunk = (victim.poisonDrunk || 0) + 1;
        if (victim.poisonDrunk >= 2) {
          victim.isAlive = false;
          batchLogs.push(`☠️【${victim.name}】饮下第2瓶毒药暴毙出局！`);
        } else {
          batchLogs.push(`🧪【${victim.name}】被迫饮下1瓶毒药(剩1/2)！`);
        }
      } else {
        const bangProbability = 1 / Math.max(1, 6 - (victim.bulletsFired || 0));
        if (Math.random() < bangProbability) {
          victim.isAlive = false;
          batchLogs.push(`💥【${victim.name}】中弹淘汰！`);
        } else {
          victim.bulletsFired = (victim.bulletsFired || 0) + 1;
          batchLogs.push(`💨【${victim.name}】空枪生还！`);
        }
      }
    }

    this.punishEvent = {
      type: this.config.punishType,
      isBatch: true,
      messages: batchLogs
    };

    for (const msg of batchLogs) {
      this.addLog(msg);
    }
    this.room.broadcastState();

    this.checkGameContinuation(nextStarterId);
  }

  checkGameContinuation(nextStarterId) {
    const alivePlayers = this.room.players.filter(p => p.isAlive);
    if (alivePlayers.length <= 1) {
      setTimeout(() => {
        this.endGame();
      }, 3500);
    } else {
      setTimeout(() => {
        this.startNextRound(nextStarterId);
      }, 5000);
    }
  }

  endGame() {
    this.clearAllTimers();
    this.status = 'GAME_OVER';
    const alivePlayers = this.room.players.filter(p => p.isAlive);
    const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;

    if (winner) {
      winner.isWinner = true;
      this.addLog(`🏆【天王诞生】玩家【${winner.name}】凭借绝顶心机笑傲全场，摘得骗子酒馆骰王桂冠！`);
    } else {
      this.addLog('💀 酒馆惨烈终局：所有玩家全军覆没，无人幸免！');
    }

    this.room.broadcastState();
  }

  /**
   * 检查 AI 决策
   */
  checkAITurn() {
    if (this.status !== 'BIDDING') return;
    const curPlayer = this.room.players.find(p => p.id === this.currentTurnPlayerId);
    if (!curPlayer || !curPlayer.isAlive) return;

    if (!curPlayer.isBot && curPlayer.connected && !curPlayer.isOffline) return;

    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }

    const delay = 1200 + Math.random() * 1200;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      try {
        if (this.status !== 'BIDDING' || this.currentTurnPlayerId !== curPlayer.id) return;
        const freshPlayer = this.room.players.find(p => p.id === curPlayer.id);
        if (!freshPlayer || !freshPlayer.isAlive) return;
        this.makeAIDecision(freshPlayer);
      } catch (err) {
        console.warn('AI 决策调度异常捕获:', err.message);
      }
    }, delay);
  }

  /**
   * 智能人机 AI 决策模型 (基于二项期望与心理博弈)
   */
  makeAIDecision(botPlayer) {
    try {
      const alivePlayers = this.room.players.filter(p => p.isAlive);
      const totalDiceInPlay = alivePlayers.length * (this.config.dicePerPlayer || 5);
      const myDice = botPlayer.dice || [];
      const isWildActive = !this.config.enableLockOne || !this.wildLocked;

      // 1. 若当前尚未有任何人起叫，AI 起叫自身数量最多的点数
      if (!this.currentBid) {
        const counts = {};
        for (let f = 1; f <= 6; f++) counts[f] = 0;
        for (const d of myDice) counts[d]++;

        // 寻找自己手里最优势的点数 (优先 2~6)
        let bestFace = 2;
        let maxCnt = -1;
        for (let f = 2; f <= 6; f++) {
          const effectiveCount = counts[f] + (isWildActive ? counts[1] : 0);
          if (effectiveCount > maxCnt) {
            maxCnt = effectiveCount;
            bestFace = f;
          }
        }

        // 起叫数量保底为 存活人数
        const initialQty = Math.max(1, alivePlayers.length);
        this.actionBid(botPlayer.id, initialQty, bestFace);
        return;
      }

      // 2. 分析上家叫点
      const currentQty = this.currentBid.quantity;
      const currentFace = this.currentBid.faceValue;

      // 若当前叫点已达到全场骰子极限数量且为6点，AI 绝不盲目加骰，直接发起质疑开盅！
      if (currentQty >= totalDiceInPlay && currentFace === 6) {
        this.actionChallenge(botPlayer.id);
        return;
      }

      // 计算我手里该点数的数量
      const myExact = myDice.filter(d => d === currentFace).length;
      const myWild = (isWildActive && currentFace !== 1) ? myDice.filter(d => d === 1).length : 0;
      const myTotalMatching = myExact + myWild;

      // 未知骰子总数
      const unknownDice = Math.max(0, totalDiceInPlay - myDice.length);
      // 单颗未知骰子命中的概率 (若万能则 2/6 = 1/3，否则 1/6)
      const prob = (isWildActive && currentFace !== 1) ? (2 / 6) : (1 / 6);
      const expectedUnknown = unknownDice * prob;
      const totalExpected = myTotalMatching + expectedUnknown;

      // 3. 决定是否发起质疑 (Liar!)
      // 若上家叫的数量远超出数学期望 + 容忍阈值，果断质疑
      const challengeThreshold = totalExpected + 1.6;
      if (currentQty >= challengeThreshold) {
        this.actionChallenge(botPlayer.id);
        return;
      }

      // 4. 精确命中 (Spot-on) 探索 (极小概率在刚好相等且开启时尝试)
      if (this.config.enableSpotOn && Math.abs(currentQty - totalExpected) < 0.35 && Math.random() < 0.25) {
        this.actionSpotOn(botPlayer.id);
        return;
      }

      // 5. 否则进行加码叫点
      // 方案 A: 增加数量 (最稳妥)
      // 方案 B: 保持数量但提高点数
      if (currentFace < 6 && Math.random() < 0.45) {
        // 保持当前数量，提高面值
        const nextFace = currentFace + 1;
        this.actionBid(botPlayer.id, currentQty, nextFace);
      } else {
        // 增加数量，并可重选自己手里数量较多的面值
        let nextFace = currentFace;
        // 偶尔换成自己最拿手的点数
        const faceCounts = {};
        for (let f = 2; f <= 6; f++) {
          faceCounts[f] = myDice.filter(d => d === f).length + (isWildActive ? myDice.filter(d => d === 1).length : 0);
        }
        let bestFace = currentFace;
        let maxCnt = 0;
        for (let f = 2; f <= 6; f++) {
          if (faceCounts[f] > maxCnt) {
            maxCnt = faceCounts[f];
            bestFace = f;
          }
        }
        if (Math.random() < 0.6) nextFace = bestFace;

        this.actionBid(botPlayer.id, currentQty + 1, nextFace);
      }
    } catch (err) {
      console.warn('AI 执行叫点逻辑异常，执行安全保底:', err.message);
      try {
        if (this.currentBid) {
          this.actionChallenge(botPlayer.id);
        } else {
          this.actionBid(botPlayer.id, 1, 2);
        }
      } catch (_) {}
    }
  }

  /**
   * 生成用于前端渲染的视角快照
   */
  getStateSnapshot(viewerPlayerId) {
    const viewer = this.room.players.find(p => p.id === viewerPlayerId);
    const isViewerDead = viewer && !viewer.isAlive;
    const canSeeAll = (isViewerDead && !this.config.disableSpectatorXray) || this.status === 'REVEAL' || this.status === 'PUNISHMENT' || this.status === 'ROUND_SUMMARY' || this.status === 'GAME_OVER';

    const aliveCount = this.room.players.filter(p => p.isAlive).length;
    const totalDiceRemaining = aliveCount * (this.config.dicePerPlayer || 5);

    return {
      mode: 'LIARS_DICE',
      status: this.status,
      roundNumber: this.roundNumber,
      config: { ...this.config },
      currentBid: this.currentBid ? { ...this.currentBid } : null,
      wildLocked: this.wildLocked,
      isWildActive: !this.config.enableLockOne || !this.wildLocked,
      currentTurnPlayerId: this.currentTurnPlayerId,
      turnDeadline: this.turnDeadline,
      turnRemainingSeconds: this.turnDeadline > 0 ? Math.max(0, Math.ceil((this.turnDeadline - Date.now()) / 1000)) : null,
      totalDiceRemaining,
      revealEvent: this.revealEvent,
      punishEvent: this.punishEvent,
      roundBids: [...this.roundBids],
      logs: [...this.logs],
      players: this.room.players.map(p => {
        const isSelf = p.id === viewerPlayerId;
        const showDice = isSelf || canSeeAll;
        const bulletsFired = p.bulletsFired || 0;
        const remainingChambers = Math.max(1, 6 - bulletsFired);
        const safeChambers = Math.max(0, remainingChambers - 1);
        const surviveChance = `${safeChambers}/${remainingChambers}`;
        const survivePercent = Math.round((safeChambers / remainingChambers) * 100);

        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHost: p.isHost,
          isBot: p.isBot,
          isAlive: p.isAlive,
          isOffline: p.isOffline,
          connected: p.connected,
          isTurn: p.id === this.currentTurnPlayerId,
          isWinner: p.isWinner,
          poisonDrunk: p.poisonDrunk || 0,
          bulletsFired,
          surviveChance,
          survivePercent,
          remainingChambers,
          diceCount: (p.dice || []).length,
          dice: showDice ? (p.dice || []) : (p.dice || []).map(() => ({ hidden: true }))
        };
      })
    };
  }
}

module.exports = LiarsDiceGame;
