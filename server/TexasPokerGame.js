/**
 * 骗子酒馆 - 德州扑克子弹模式核心规则与状态机 (TexasPokerGame.js)
 * 完整实现子弹筹码、公共牌随子弹递增揭示、懦夫弃牌、换牌(Switch)、ALL-IN神佑生还、多人淘汰规则配置
 */

const { PokerDeck } = require('./PokerDeck');
const Revolver = require('./Revolver');

class TexasPokerGame {
  constructor(room) {
    this.room = room;
    this.deck = new PokerDeck();

    // 房主自定义规则配置
    this.config = {
      enableSwitch: true,          // 默认开启换牌机制 (房主可切换)
      eliminateAllLosers: true,    // 默认淘汰所有败者 (比第一名弱的全部受罚，可选仅淘汰垫底)
      disableTurnTimer: false,     // ⏳ 不限时思考机制 (不读秒)：默认关闭
      disableSpectatorXray: false, // 🙈 观战无透视：默认关闭 (默认开启全景透视)
      maxPlayers: 4                // 默认 4 人局 (2~6 人)
    };

    // 游戏全局状态
    this.status = 'LOBBY';         // LOBBY, DEALING, BETTING, ROULETTE, SHOWDOWN, HAND_SUMMARY, GAME_OVER
    this.handNumber = 0;
    this.roundIndex = 1;          // 1: 首轮(1子弹), 2: 翻牌圈(2子弹/3张公共牌), 3: 转牌圈(3子弹/4张公共牌), 4: 河牌圈(4子弹/5张公共牌)
    
    this.communityCards = [];     // 5 张公共牌
    this.communityRevealedCount = 0; // 当前翻开的公共牌数量 (0 -> 3 -> 4 -> 5)
    
    this.currentTurnPlayerId = null;
    this.currentBulletTarget = 1;  // 当前轮次所要求的子弹数
    this.allInTriggered = false;   // 是否有人发起 ALL-IN
    this.allInPlayerId = null;     // 发起 ALL-IN 的玩家 ID
    this.allInPlayerName = '';     // 发起 ALL-IN 的玩家昵称
    
    this.lastAction = null;
    this.rouletteEvent = null;     // 当前正在进行的轮盘赌事件
    this.showdownResult = null;    // 摊牌结算结果
    this.logs = [];                // 酒馆战报流水日志
    this.nextHandTimer = null;     // 自动开启下一副牌定时器
    this.turnTimer = null;         // 20秒决策超时定时器
    this.turnDeadline = 0;         // 当前决策截止时间戳 (ms)
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = 0;
  }

  startTurnTimer() {
    this.clearTurnTimer();
    if (this.status !== 'BETTING' || !this.currentTurnPlayerId) return;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand || !player.isAlive) return;

    // 若开启不限时思考，且当前为真人玩家，则不设倒计时截止
    if (this.config.disableTurnTimer && !player.isBot) {
      this.turnDeadline = 0;
      return;
    }

    this.turnDeadline = Date.now() + 20000;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.handleTurnTimeout();
    }, 20000);
  }

  handleTurnTimeout() {
    if (this.status !== 'BETTING' || !this.currentTurnPlayerId) return;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand || !player.isAlive) return;

    // 若在换牌阶段超时：
    // 1. 如果已选了一个牌(如选了4)，就换那张牌；没选就默认第 1 张手牌 (index 0) 换牌堆的牌
    // 2. 要换的候选牌：如果点了某张(如点了5)就换那张(5)；没点就默认换第一张候选牌
    if (player.switchCandidates && player.switchCandidates.length > 0 && !player.hasUsedSwitch) {
      try {
        const discardIdx = (typeof player.pendingDiscardIndex === 'number' && player.pendingDiscardIndex >= 0 && player.pendingDiscardIndex < player.cards.length)
          ? player.pendingDiscardIndex
          : 0;

        let chosenCard = player.pendingNewCard;
        if (!chosenCard && player.switchCandidates && player.switchCandidates.length > 0) {
          chosenCard = player.switchCandidates[0];
        }

        if (chosenCard) {
          this.addLog(`⏰ 【${player.name}】换牌超时，系统自动完成手牌置换！`);
          this.actionSwitch(player.id, discardIdx, chosenCard, true);
        }
      } catch (e) {
        console.error('超时自动换牌异常:', e);
      }
    }

    if (this.allInTriggered && this.allInPlayerId !== player.id) {
      this.addLog(`⏰ 【${player.name}】决策超时 (20s)，面对 ALL-IN 自动弃牌！`);
      this.actionFold(player.id);
    } else {
      this.addLog(`⏰ 【${player.name}】决策超时 (20s)，系统自动跟注！`);
      this.actionCall(player.id);
    }
  }

  addLog(msg) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 50) this.logs.pop();
  }

  updateConfig(newConfig) {
    if (this.status !== 'LOBBY') return false;
    if (typeof newConfig.enableSwitch === 'boolean') {
      this.config.enableSwitch = newConfig.enableSwitch;
    }
    if (typeof newConfig.eliminateAllLosers === 'boolean') {
      this.config.eliminateAllLosers = newConfig.eliminateAllLosers;
    }
    if (typeof newConfig.disableTurnTimer === 'boolean') {
      this.config.disableTurnTimer = newConfig.disableTurnTimer;
    }
    if (typeof newConfig.disableSpectatorXray === 'boolean') {
      this.config.disableSpectatorXray = newConfig.disableSpectatorXray;
    }
    if (typeof newConfig.maxPlayers === 'number' && newConfig.maxPlayers >= 2 && newConfig.maxPlayers <= 4) {
      this.config.maxPlayers = newConfig.maxPlayers;
    }
    const timerText = this.config.disableTurnTimer ? '⏳ 启用不限时思考(不读秒)' : '⏱️ 20秒读秒';
    const specText = this.config.disableSpectatorXray ? '🙈 观战无透视' : '👁️ 观战透视';
    this.addLog(`房主更新了规则：最大人数 ${this.config.maxPlayers} 人，${this.config.enableSwitch ? '开启换牌' : '关闭换牌'}，${this.config.eliminateAllLosers ? '淘汰所有失败者' : '仅淘汰最后一名'}，${timerText}，${specText}。`);
    return true;
  }

  /**
   * 开始全新的一整局游戏
   */
  startNewGame() {
    const connectedPlayers = this.room.players.filter(p => p.connected);
    if (connectedPlayers.length < 2) {
      // 优雅重置为备战大厅，绝不抛出错误中断
      this.status = 'LOBBY';
      this.handNumber = 0;
      this.communityCards = [];
      this.communityRevealedCount = 0;
      this.showdownResult = null;
      this.rouletteEvent = null;
      for (const p of this.room.players) {
        p.isAlive = true;
        p.cards = [];
        p.bulletsBet = 0;
        p.hasUsedCowardFold = false;
        p.hasUsedSwitch = false;
        p.switchedThisTurn = false;
        p.isAllIn = false;
        p.hasActedInRound = false;
        p.revealedCards = false;
        p.isWinner = false;
        p.isLoser = false;
      }
      this.addLog('🔄 当前人数不足 2 人，已自动返回备战大厅，请邀请电脑 AI 或等待好友加入！');
      this.room.broadcastState();
      return;
    }

    // 重置玩家生命状态
    for (const p of this.room.players) {
      p.isAlive = true;
      p.cards = [];
      p.bulletsBet = 0;
      p.hasUsedCowardFold = false;
      p.hasUsedSwitch = false;
      p.switchedThisTurn = false;
      p.isAllIn = false;
      p.hasActedInRound = false;
      p.revealedCards = false;
      p.isWinner = false;
      p.isLoser = false;
    }

    this.handNumber = 0;
    this.addLog('🔥 骗子酒馆·德州扑克 生死局正式开始！');
    this.startNextHand();
  }

  /**
   * 开始新一小局发牌
   */
  startNextHand() {
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }

    const alivePlayers = this.getAlivePlayers();
    if (alivePlayers.length <= 1) {
      this.finishGameOver();
      return;
    }

    this.handNumber++;
    this.roundIndex = 1;
    this.currentBulletTarget = 1;
    this.allInTriggered = false;
    this.allInPlayerId = null;
    this.allInPlayerName = '';
    this.rouletteEvent = null;
    this.showdownResult = null;
    this.deck.reset();

    // 发 5 张公共牌 (初始全部暗牌)
    this.communityCards = this.deck.draw(5);
    this.communityRevealedCount = 0;

    // 重置小局中每个存活玩家状态
    for (const p of this.room.players) {
      p.isWinner = false;
      p.isLoser = false;
      p.lastAction = null;
      if (p.isAlive) {
        p.inHand = true;
        p.cards = this.deck.draw(2);
        p.bulletsBet = 1;          // 底注 1 颗子弹
        p.hasUsedSwitch = false;   // 重新开牌：每副牌享有 1 次换牌机会
        p.switchedThisTurn = false;
        p.isAllIn = false;
        p.hasActedInRound = false;
        p.hasUsedCowardFold = false; // 每副新牌的首轮均可享有懦夫弃牌特权
        p.revealedCards = false;   // 默认保持手牌隐蔽，出局或获胜时可自主公开
        p.switchCandidates = null; // 清空换牌候选池
        p.pendingDiscardIndex = null;
        p.pendingNewCard = null;
      } else {
        p.inHand = false;
        p.cards = [];
        p.bulletsBet = 0;
        p.hasUsedSwitch = false;
        p.switchCandidates = null;
        p.pendingDiscardIndex = null;
        p.pendingNewCard = null;
      }
    }

    this.status = 'BETTING';

    // 确定先手行动玩家：首副牌 (Hand 1) 随机挑选一名存活玩家率先决策，后续每一副牌按逆时针顺序在存活玩家中顺延轮转
    const inHandPlayers = this.getInHandPlayers();
    if (this.handNumber === 1 || !this.handStartPlayerId) {
      const randomIdx = Math.floor(Math.random() * inHandPlayers.length);
      this.handStartPlayerId = inHandPlayers[randomIdx].id;
    } else {
      const alivePlayers = this.getAlivePlayers();
      const lastIdx = alivePlayers.findIndex(p => p.id === this.handStartPlayerId);
      if (lastIdx !== -1) {
        const nextIdx = (lastIdx + 1) % alivePlayers.length;
        this.handStartPlayerId = alivePlayers[nextIdx].id;
      } else {
        this.handStartPlayerId = inHandPlayers[0].id;
      }
    }
    this.currentTurnPlayerId = this.handStartPlayerId;

    const startPlayer = this.room.players.find(p => p.id === this.currentTurnPlayerId);
    this.addLog(`第 ${this.handNumber} 副牌开始：由【${startPlayer ? startPlayer.name : '先手'}】率先决策，全员手枪装填 1 颗底注子弹！`);

    this.startTurnTimer();
    this.room.broadcastState();
    this.checkAITurn();
  }

  getAlivePlayers() {
    return this.room.players.filter(p => p.isAlive);
  }

  getInHandPlayers() {
    return this.room.players.filter(p => p.isAlive && p.inHand);
  }

  getCurrentPlayer() {
    return this.room.players.find(p => p.id === this.currentTurnPlayerId);
  }

  /**
   * 玩家执行行动：跟注 (CALL)
   */
  actionCall(playerId) {
    if (this.status !== 'BETTING' || this.currentTurnPlayerId !== playerId) return false;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand) return false;

    this.clearTurnTimer();

    if (this.allInTriggered) {
      // 场上已有人发起 ALL-IN：跟注也是跟注 8 颗子弹，拉满枪膛
      player.bulletsBet = 8;
      player.isAllIn = true;
      player.hasActedInRound = true;
      player.lastAction = {
        type: 'ALL_IN',
        text: '🔥 跟注 (8弹)',
        time: Date.now()
      };
      this.lastAction = {
        playerId,
        playerName: player.name,
        action: 'CALL',
        text: `🔥 ${player.name} 选择【跟注 8 发子弹】！枪膛装满实弹，直面生死对决！`
      };
      this.addLog(this.lastAction.text);
    } else {
      // 正常轮次每次跟注加 1 颗子弹，手枪装入新子弹
      player.bulletsBet += 1;
      player.hasActedInRound = true;
      player.lastAction = {
        type: 'CALL',
        text: `跟注 (${player.bulletsBet}弹)`,
        time: Date.now()
      };
      this.lastAction = {
        playerId,
        playerName: player.name,
        action: 'CALL',
        text: `${player.name} 选择【跟注】，手枪装填至 ${player.bulletsBet} 颗子弹 (8孔)！`
      };
      this.addLog(this.lastAction.text);
    }

    this.advanceTurn();
    return true;
  }

  /**
   * 玩家执行行动：弃牌面对轮盘 (FOLD)
   */
  actionFold(playerId, options = {}) {
    if (this.status !== 'BETTING' || this.currentTurnPlayerId !== playerId) return false;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand) return false;

    this.clearTurnTimer();

    // 弃牌必须用当前已下注的子弹扣动扳机
    const bulletsToShoot = player.bulletsBet;
    const isAllIn = player.isAllIn;
    const roulette = Revolver.pullTrigger(bulletsToShoot, isAllIn);

    player.inHand = false; // 退出当前局
    player.lastAction = {
      type: 'FOLD',
      text: `🏳️ 已弃牌 (${bulletsToShoot}弹)`,
      time: Date.now()
    };
    if (options.revealCards) {
      player.revealedCards = true;
    }

    this.rouletteEvent = {
      type: 'FOLD_ROULETTE',
      player: { id: player.id, name: player.name, avatar: player.avatar },
      bullets: bulletsToShoot,
      isAllIn,
      result: roulette
    };

    if (roulette.isBang) {
      player.isAlive = false;
      this.addLog(`💀 ${player.name} 弃牌受罚，扣动扳机 (下注 ${bulletsToShoot} 颗子弹)... 枪火喷涌！淘汰出局！`);
    } else {
      this.addLog(`💨 ${player.name} 弃牌受罚，扣动扳机 (下注 ${bulletsToShoot} 颗子弹)... 咔嗒！空枪生还！`);
    }

    // 检查剩余存活在局玩家数量：若仅剩 1 人，立即确立胜者并清空行动权，避免胜者主视角误显“正在决策”
    const remainingInHand = this.getInHandPlayers();
    if (remainingInHand.length === 1) {
      const winner = remainingInHand[0];
      winner.isWinner = true;
      this.currentTurnPlayerId = null;
      this.communityRevealedCount = 5;
      this.showdownResult = {
        winners: [winner],
        losers: [],
        punishedPlayers: [],
        message: `其他玩家已全部弃牌，${winner.name} 成为本小局赢家！`
      };
      this.addLog(`🏆 其他玩家均已弃牌退出，${winner.name} 成为本小局赢家！无需拉动扳机！`);
    }

    this.status = 'ROULETTE';
    this.room.broadcastState();

    // 弃牌玩家完成弃牌与开枪判定后，推进出牌权或等待结算
    this.advanceTurnAfterFold(player.id);

    return true;
  }

  /**
   * 玩家执行行动：懦夫弃牌 (COWARD_FOLD) - 仅限每副牌首轮使用
   */
  actionCowardFold(playerId, options = {}) {
    if (this.status !== 'BETTING' || this.currentTurnPlayerId !== playerId) return false;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand) return false;

    this.clearTurnTimer();

    if (this.allInTriggered) {
      throw new Error('场上已爆发 ALL-IN，只能选择跟注(8发)或弃牌！');
    }

    if (this.roundIndex !== 1) {
      throw new Error('懦夫弃牌仅限每副牌首轮使用！');
    }
    if (player.hasUsedCowardFold) {
      throw new Error('您本副牌首轮已使用过懦夫弃牌！');
    }

    player.hasUsedCowardFold = true;
    player.inHand = false;
    player.lastAction = {
      type: 'COWARD_FOLD',
      text: '🏃 懦夫弃牌 (1弹)',
      time: Date.now()
    };
    if (options.revealCards) {
      player.revealedCards = true;
    }

    // 只需 1 颗子弹赌命
    const roulette = Revolver.pullTrigger(1, false);

    this.rouletteEvent = {
      type: 'COWARD_FOLD_ROULETTE',
      player: { id: player.id, name: player.name, avatar: player.avatar },
      bullets: 1,
      isAllIn: false,
      result: roulette
    };

    if (roulette.isBang) {
      player.isAlive = false;
      this.addLog(`💀 ${player.name} 使用【懦夫弃牌】，只装填 1 颗子弹赌命... 砰！竟中弹淘汰！`);
    } else {
      this.addLog(`💨 ${player.name} 使用【懦夫弃牌】，装填 1 颗子弹赌命... 咔嗒！逃脱成功！`);
    }

    // 检查剩余存活在局玩家数量：若仅剩 1 人，立即确立胜者并清空行动权
    const remainingInHand = this.getInHandPlayers();
    if (remainingInHand.length === 1) {
      const winner = remainingInHand[0];
      winner.isWinner = true;
      this.currentTurnPlayerId = null;
      this.communityRevealedCount = 5;
      this.showdownResult = {
        winners: [winner],
        losers: [],
        punishedPlayers: [],
        message: `其他玩家已全部弃牌，${winner.name} 成为本小局赢家！`
      };
      this.addLog(`🏆 其他玩家均已弃牌退出，${winner.name} 成为本小局赢家！无需拉动扳机！`);
    }

    this.status = 'ROULETTE';
    this.room.broadcastState();

    // 懦夫弃牌完成后，同样将出牌权严格顺延至逆时针方向的下一位在局存活玩家
    this.advanceTurnAfterFold(player.id);

    return true;
  }

  /**
   * 获取当前轮次 Switch 候选牌池数量 (随着轮次由 4 张递减为 2 张)
   */
  getSwitchCandidateCount() {
    if (this.roundIndex === 1) return 4;
    if (this.roundIndex === 2) return 3;
    return 2;
  }

  /**
   * 请求换牌候选卡片
   */
  getSwitchCandidates(playerId) {
    if (this.allInTriggered) {
      throw new Error('场上已爆发 ALL-IN，只能选择跟注(8发)或弃牌！');
    }

    if (!this.config.enableSwitch) {
      throw new Error('房主已关闭换牌机制！');
    }
    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.inHand) {
      throw new Error('当前非参战状态！');
    }
    if (player.hasUsedSwitch) {
      throw new Error('您本副牌已使用过换牌！');
    }
    // 牌库候选牌固定：一旦生成则锁定，禁止取消后重复刷新挑选
    if (player.switchCandidates && player.switchCandidates.length > 0) {
      return player.switchCandidates;
    }
    const count = this.getSwitchCandidateCount();
    player.switchCandidates = this.deck.draw(count);
    return player.switchCandidates;
  }

  /**
   * 玩家执行行动：换牌确认 (SWITCH)
   * @param {boolean} isFromTimeout 是否为倒计时超时自动触发
   */
  actionSwitch(playerId, discardCardIndex, newCard, isFromTimeout = false) {
    if (this.status !== 'BETTING' || this.currentTurnPlayerId !== playerId) return false;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand) return false;

    if (this.allInTriggered) {
      throw new Error('场上已爆发 ALL-IN，只能选择跟注(8发)或弃牌！');
    }

    if (!this.config.enableSwitch) {
      throw new Error('房主未开启换牌机制！');
    }
    if (player.hasUsedSwitch) {
      throw new Error('本副牌已使用过换牌机制！');
    }

    const safeDiscardIndex = (discardCardIndex >= 0 && discardCardIndex < player.cards.length) ? discardCardIndex : 0;

    const oldCard = player.cards[safeDiscardIndex];
    player.cards[safeDiscardIndex] = newCard;
    player.hasUsedSwitch = true;
    player.switchedThisTurn = true; // 进行 Switch 的回合无法 ALL-IN
    player.switchCandidates = null; // 换牌成功，清空候选池
    player.pendingDiscardIndex = null;
    player.pendingNewCard = null;

    player.lastAction = {
      type: 'SWITCH',
      text: '🔄 换了1张牌',
      time: Date.now()
    };

    this.lastAction = {
      playerId,
      playerName: player.name,
      action: 'SWITCH',
      text: `🔄 【${player.name}】换了 1 张手牌！`
    };
    this.addLog(this.lastAction.text);

    if (!isFromTimeout) {
      // 玩家主动确认换牌：重置本回合 20 秒决策倒计时，给玩家充足时间思考跟注或弃牌
      this.startTurnTimer();
    }
    this.room.broadcastState();
    return true;
  }

  /**
   * 玩家执行行动：ALL-IN 孤注一掷
   */
  actionAllIn(playerId) {
    if (this.status !== 'BETTING' || this.currentTurnPlayerId !== playerId) return false;
    const player = this.getCurrentPlayer();
    if (!player || !player.inHand) return false;

    this.clearTurnTimer();

    // 规则限制：牌库未显示 3 张牌不能 ALL-IN
    if (this.communityRevealedCount < 3) {
      throw new Error('牌库未翻开 3 张公共牌前无法 ALL-IN！');
    }

    if (player.switchedThisTurn) {
      throw new Error('进行换牌的回合内无法发起 ALL-IN！');
    }

    player.isAllIn = true;
    player.bulletsBet = 8; // 拉满至 8 颗子弹
    player.hasActedInRound = true;
    player.lastAction = {
      type: 'ALL_IN',
      text: '🔥 ALL-IN (8弹)',
      time: Date.now()
    };
    this.allInTriggered = true;
    this.allInPlayerId = playerId;
    this.allInPlayerName = player.name;

    // 重置其他在手存活玩家行动标记，要求其余玩家响应 ALL-IN (跟注8弹或弃牌)
    const inHandPlayers = this.getInHandPlayers();
    for (const p of inHandPlayers) {
      if (p.id !== playerId) {
        p.hasActedInRound = false;
      }
    }

    this.lastAction = {
      playerId,
      playerName: player.name,
      action: 'ALL_IN',
      text: `🔥 【${player.name}】发起 ALL-IN！手枪装满 8 颗实弹！其他玩家只能选择跟注(8发)或弃牌！`
    };
    this.addLog(this.lastAction.text);

    this.advanceTurn();
    return true;
  }

  /**
   * 玩家自主切换手牌公布状态 (亮牌/暗牌)
   */
  actionToggleRevealCard(playerId) {
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) return false;
    player.revealedCards = !player.revealedCards;
    this.addLog(`👀 ${player.name} ${player.revealedCards ? '公开了自己的手牌！' : '遮盖了自己的手牌。'}`);
    this.room.broadcastState();
    return true;
  }

  /**
   * 推进出牌权或轮次
   */
  advanceTurn() {
    const inHandPlayers = this.getInHandPlayers();
    if (inHandPlayers.length <= 1) {
      this.checkHandFlowAfterLeave();
      return;
    }

    // 检查本轮是否所有在手玩家都已行动完毕
    const allActed = inHandPlayers.every(p => p.hasActedInRound);

    if (allActed) {
      if (this.allInTriggered) {
        // ALL-IN 响应完毕，立即翻开全部 5 张公共牌并开启比牌决胜！
        this.communityRevealedCount = 5;
        this.addLog('⚡ ALL-IN 响应完毕！公共牌全部展开，直接进入摊牌决胜！');
        this.startShowdown();
        return;
      }
      // 推进至下一轮
      this.advanceRound();
    } else {
      // 严格按照牌桌全员顺位逆时针寻找下一位在手参战玩家
      const allPlayers = this.room.players;
      const n = allPlayers.length;
      const currentIndex = allPlayers.findIndex(p => p.id === this.currentTurnPlayerId);
      for (let i = 1; i < n; i++) {
        const candidate = allPlayers[(currentIndex + i) % n];
        if (candidate.isAlive && candidate.inHand) {
          this.currentTurnPlayerId = candidate.id;
          break;
        }
      }
      this.startTurnTimer();
      this.room.broadcastState();
      this.checkAITurn();
    }
  }

  /**
   * 推进轮次 (翻开公共牌)
   */
  advanceRound() {
    this.roundIndex++;
    const inHandPlayers = this.getInHandPlayers();

    // 重置本轮行动标记
    for (const p of inHandPlayers) {
      p.hasActedInRound = false;
      p.switchedThisTurn = false;
    }

    if (this.roundIndex === 2) {
      // 翻开 3 张公共牌 (Flop)
      this.communityRevealedCount = 3;
      this.addLog('🎴 全员手枪装填至 2 颗子弹，翻开 3 张公共牌！进入第 2 轮决策 (现已允许 ALL-IN)！');
    } else if (this.roundIndex === 3) {
      // 翻开第 4 张公共牌 (Turn)
      this.communityRevealedCount = 4;
      this.addLog('🎴 全员手枪装填至 3 颗子弹，翻开第 4 张公共牌！进入第 3 轮决策！');
    } else if (this.roundIndex === 4) {
      // 翻开第 5 张公共牌 (River)
      this.communityRevealedCount = 5;
      this.addLog('🎴 全员手枪装填至 4 颗子弹，翻开第 5 张公共牌！所有牌已翻开！进入第 4 轮决胜决策！');
    } else {
      // 双方/全员跟注后手枪装填至 5 颗子弹，进入摊牌阶段 (Showdown)
      this.startShowdown();
      return;
    }

    // 重置本轮首个行动者：从本副牌起手玩家按逆时针寻找首个在局存活玩家
    const allPlayers = this.room.players;
    const n = allPlayers.length;
    let startPlayer = inHandPlayers.find(p => p.id === this.handStartPlayerId);
    if (!startPlayer) {
      const origIndex = allPlayers.findIndex(p => p.id === this.handStartPlayerId);
      for (let i = 1; i <= n; i++) {
        const candidate = allPlayers[(origIndex + i) % n];
        if (candidate.isAlive && candidate.inHand) {
          startPlayer = candidate;
          break;
        }
      }
    }
    this.currentTurnPlayerId = startPlayer ? startPlayer.id : inHandPlayers[0].id;
    this.status = 'BETTING';
    this.startTurnTimer();
    this.room.broadcastState();
    this.checkAITurn();
  }

  /**
   * 玩家弃牌后推进出牌权：严格按照逆时针顺序顺延至下一名在局存活玩家
   * @param {string} foldedPlayerId 刚刚弃牌的玩家ID
   */
  advanceTurnAfterFold(foldedPlayerId) {
    const inHandPlayers = this.getInHandPlayers();

    // 如果场上只剩 1 人或无人，决出胜负，立即清空行动权避免主视角误显“正在决策”
    if (inHandPlayers.length <= 1) {
      this.currentTurnPlayerId = null;
      if (inHandPlayers.length === 1) {
        inHandPlayers[0].isWinner = true;
      }
      setTimeout(() => {
        this.rouletteEvent = null;
        this.checkHandFlowAfterLeave();
      }, 4500);
      return;
    }

    const allPlayers = this.room.players;
    const n = allPlayers.length;
    const foldedIndex = allPlayers.findIndex(p => p.id === foldedPlayerId);

    // 寻找逆时针方向的下一位在局且存活的玩家
    let nextPlayer = null;
    for (let i = 1; i < n; i++) {
      const candidate = allPlayers[(foldedIndex + i) % n];
      if (candidate.isAlive && candidate.inHand) {
        nextPlayer = candidate;
        break;
      }
    }

    if (nextPlayer) {
      this.currentTurnPlayerId = nextPlayer.id;
    }

    // 延时等待头顶开枪动画播放完毕后，检查是否只剩一人或轮次推进
    setTimeout(() => {
      this.rouletteEvent = null;
      this.checkHandFlowAfterLeave();
    }, 4500);
  }

  /**
   * 当有人弃牌退出后检查局势
   */
  checkHandFlowAfterLeave() {
    const inHandPlayers = this.getInHandPlayers();
    if (inHandPlayers.length === 1) {
      this.clearTurnTimer();
      // 只剩 1 人，直接成为本手胜利者，免于受罚！
      const winner = inHandPlayers[0];
      winner.isWinner = true;
      this.currentTurnPlayerId = null; // 确保清空行动权
      this.addLog(`🏆 其他玩家均已弃牌退出，${winner.name} 成为本小局赢家！无需拉动扳机！`);
      this.status = 'HAND_SUMMARY';
      this.communityRevealedCount = 5; // 获胜时公开全部 5 张公共牌
      this.showdownResult = {
        winners: [winner],
        losers: [],
        punishedPlayers: [],
        message: `${winner.name} 孤身坚守至终，直接赢得本小局！`
      };
      this.room.broadcastState();
      this.checkEndGameOrNext();
      return;
    }

    if (inHandPlayers.length === 0) {
      this.currentTurnPlayerId = null;
      this.checkEndGameOrNext();
      return;
    }

    // 检查是否所有在局玩家都已经行动完毕
    const allActed = inHandPlayers.every(p => p.hasActedInRound);
    if (allActed) {
      if (this.allInTriggered) {
        this.communityRevealedCount = 5;
        this.addLog('⚡ ALL-IN 响应完毕！公共牌全部翻开，直接进入摊牌对决！');
        this.startShowdown();
        return;
      }
      this.advanceRound();
      return;
    }

    // 如果当前轮到的人不在局中，逆时针顺延至下一位在局玩家
    if (!inHandPlayers.some(p => p.id === this.currentTurnPlayerId)) {
      const allPlayers = this.room.players;
      const n = allPlayers.length;
      const curIndex = allPlayers.findIndex(p => p.id === this.currentTurnPlayerId);
      for (let i = 1; i <= n; i++) {
        const candidate = allPlayers[(curIndex + i) % n];
        if (candidate.isAlive && candidate.inHand) {
          this.currentTurnPlayerId = candidate.id;
          break;
        }
      }
    }

    this.status = 'BETTING';
    this.startTurnTimer();
    this.room.broadcastState();
    this.checkAITurn();
  }

  /**
   * 摊牌决胜 (Showdown)
   */
  startShowdown() {
    this.clearTurnTimer();
    this.status = 'SHOWDOWN';
    this.currentTurnPlayerId = null; // 进入摊牌比对，清空回合行动者
    this.communityRevealedCount = 5;
    const inHandPlayers = this.getInHandPlayers();

    this.addLog('⚡ 局势推至极限！进入【摊牌时刻】！比对 7 选 5 最佳牌型！');

    // 评估每位在局玩家的 7 张牌
    const evaluatedList = inHandPlayers.map(p => {
      const allCards = [...p.cards, ...this.communityCards];
      const evalResult = PokerDeck.evaluateHand(allCards);
      return {
        player: p,
        evaluation: evalResult
      };
    });

    // 按照决胜规则严格排序（牌型相同比单牌大小及花色，绝不平局）
    evaluatedList.sort((a, b) => PokerDeck.comparePlayerShowdown(b, a));

    // 严格决出唯一胜者与所有败者，不能都赢，必分胜负
    const winnerItem = evaluatedList[0];
    const winners = [winnerItem.player];
    const losersItems = evaluatedList.slice(1);

    this.addLog(`🥇 最佳牌型【${winnerItem.evaluation.name}】，胜者：${winnerItem.player.name}！安全过关！`);

    // 确定受罚玩家清单
    let punishedPlayers = [];

    if (losersItems.length > 0) {
      if (this.config.eliminateAllLosers) {
        // 房主配置：淘汰所有失败者
        punishedPlayers = losersItems.map(item => item.player);
        this.addLog(`⚠️ 按照规则，所有 ${punishedPlayers.length} 名失败者均须直面枪口！`);
      } else {
        // 规则：只淘汰最后一名玩家 (最弱者)
        punishedPlayers = [losersItems[losersItems.length - 1].player];
        this.addLog(`⚠️ 按照规则，只淘汰牌型垫底的最后一名：${punishedPlayers[0].name} 直面枪口！`);
      }
    }

    // 标记每位存活玩家的胜负状态
    for (const p of this.room.players) {
      p.isWinner = winners.some(w => w.id === p.id);
      p.isLoser = punishedPlayers.some(l => l.id === p.id);
    }

    const rankDescriptions = {
      1: '第 1 大牌型 (最大 · 皇家同花顺)',
      2: '第 2 大牌型 (同花顺)',
      3: '第 3 大牌型 (四条 / 炸弹)',
      4: '第 4 大牌型 (葫芦 / 满堂红)',
      5: '第 5 大牌型 (同花)',
      6: '第 6 大牌型 (顺子)',
      7: '第 7 大牌型 (三条)',
      8: '第 8 大牌型 (两对)',
      9: '第 9 大牌型 (一对)',
      10: '第 10 大牌型 (最小 · 高牌散牌)'
    };

    this.showdownResult = {
      evaluatedList: evaluatedList.map((item, idx) => {
        const isWinner = winners.some(w => w.id === item.player.id);
        const isLoser = punishedPlayers.some(p => p.id === item.player.id);
        const rankOrder = 11 - item.evaluation.rank; // 1~10: 第10个牌型为单牌高牌，第9为一对，第8为两对...第1为皇家同花顺
        return {
          playerId: item.player.id,
          playerName: item.player.name,
          avatar: item.player.avatar,
          cards: item.player.cards,
          best5Cards: item.evaluation.best5Cards || [],
          rankName: item.evaluation.name,
          rank: item.evaluation.rank,
          rankOrder,
          rankOrderText: rankDescriptions[rankOrder] || `第 ${rankOrder} 大牌型`,
          placeIndex: idx + 1, // 对决名次：第1名、第2名...
          isWinner,
          isLoser
        };
      }),
      winners: winners.map(w => ({ id: w.id, name: w.name, avatar: w.avatar })),
      punishedPlayers: punishedPlayers.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
    };

    this.room.broadcastState();

    // 先留出 15 秒比牌展示时间（看牌比对 10 秒 + 揭晓输赢 5 秒），随后自动关闭弹窗开启开枪裁决
    setTimeout(() => {
      // 依次让受罚者接受左轮开枪裁决
      this.executeNextPunishment(punishedPlayers, 0);
    }, 15000);
  }

  /**
   * 依次执行败者枪击惩罚
   */
  executeNextPunishment(punishedPlayers, index) {
    if (index >= punishedPlayers.length) {
      // 惩罚结算全部完成
      this.status = 'HAND_SUMMARY';
      this.room.broadcastState();
      this.checkEndGameOrNext();
      return;
    }

    const victim = punishedPlayers[index];
    const bullets = victim.bulletsBet;
    const isAllIn = victim.isAllIn;
    const roulette = Revolver.pullTrigger(bullets, isAllIn);

    // 阶段 1：瞄准扣动阶段 (结局尚未发生，弹巢转动与准星瞄准，绝不提前剧透)
    this.addLog(`🔫 败者受罚：【${victim.name}】装入 ${bullets} 颗子弹，正在直面枪口扣动扳机...`);

    this.rouletteEvent = {
      type: 'SHOWDOWN_PUNISHMENT',
      player: { id: victim.id, name: victim.name, avatar: victim.avatar },
      bullets,
      isAllIn,
      pending: true,
      result: null
    };

    this.status = 'ROULETTE';
    this.room.broadcastState();

    // 阶段 2：等待 1.8 秒转轮瞄准动画播放后，实弹击发或空枪生还！
    setTimeout(() => {
      if (roulette.isBang) {
        victim.isAlive = false;
        this.addLog(`💥 砰！【${victim.name}】枪火吞噬！第 ${victim.bulletsBet} 弹中弹淘汰！`);
      } else {
        this.addLog(`💨 咔嗒！【${victim.name}】空枪生还！成功逃过一劫！`);
      }

      this.rouletteEvent = {
        type: 'SHOWDOWN_PUNISHMENT',
        player: { id: victim.id, name: victim.name, avatar: victim.avatar },
        bullets,
        isAllIn,
        pending: false,
        result: roulette
      };

      this.room.broadcastState();

      // 阶段 3：火光青烟展示 2.5 秒后继续
      setTimeout(() => {
        this.rouletteEvent = null;
        this.executeNextPunishment(punishedPlayers, index + 1);
      }, 2500);
    }, 1800);
  }

  /**
   * 检查胜负终局或准备下一小局
   */
  checkEndGameOrNext() {
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }

    const alivePlayers = this.getAlivePlayers();
    if (alivePlayers.length <= 1) {
      this.finishGameOver();
    } else {
      // 玩家未淘汰完前，处于结算状态并在倒计时后自动开启下一轮新牌！
      this.status = 'HAND_SUMMARY';
      this.room.broadcastState();

      this.addLog('⏳ 本副牌结算完成，5 秒后将自动发牌开启下一轮新牌...');
      this.nextHandTimer = setTimeout(() => {
        this.nextHandTimer = null;
        if (this.status === 'HAND_SUMMARY') {
          this.startNextHand();
        }
      }, 5000);
    }
  }

  /**
   * 终局胜负裁决
   */
  finishGameOver() {
    this.clearTurnTimer();
    this.status = 'GAME_OVER';
    this.communityRevealedCount = 5; // 最终胜者产生，公开全部 5 张牌大阅兵
    const champion = this.getAlivePlayers()[0] || null;

    if (champion) {
      this.addLog(`👑 胜负终局！【${champion.name}】成为骗子酒馆唯一幸存者，赢取全场胜利！`);
      champion.revealedCards = true;
    } else {
      this.addLog('💀 全员阵亡，无人生还！酒吧归于死寂。');
    }

    this.room.broadcastState();
  }

  /**
   * AI 自动思考与决策调度
   */
  checkAITurn() {
    if (this.status !== 'BETTING') return;
    const player = this.getCurrentPlayer();
    if (!player || !player.isBot || !player.inHand) return;

    // 拟真思考延迟 800ms ~ 1800ms
    const delay = Math.floor(Math.random() * 1000) + 800;
    setTimeout(() => {
      if (this.status !== 'BETTING' || this.currentTurnPlayerId !== player.id) return;
      this.makeAIDecision(player);
    }, delay);
  }

  /**
   * AI 决策逻辑 (拟真心理博弈：支持起手牌评估、换牌决策、合理弃牌避险、强牌掀桌与空手偷鸡 ALL-IN)
   */
  makeAIDecision(player) {
    const hand = player.cards || [];
    const isPair = hand.length === 2 && hand[0].value === hand[1].value;

    // 换牌置换逻辑 (可换可不换那种，根据选手专属博弈个性 switchPreference 动态评估)
    const switchPref = typeof player.switchPreference === 'number' ? player.switchPreference : 0.40;
    if (this.config.enableSwitch && !player.hasUsedSwitch && !this.allInTriggered && this.communityRevealedCount < 5 && Math.random() < switchPref) {
      try {
        const candidates = this.getSwitchCandidates(player.id);
        if (candidates && candidates.length > 0) {
          const sorted = [...candidates].sort((a, b) => b.value - a.value);
          const minIdx = hand.length === 2 && hand[0].value <= hand[1].value ? 0 : 1;
          // 若候选牌优于手中小牌，或不是对子时有 50% 置换以求更好牌型
          if (sorted[0].value > hand[minIdx].value || (!isPair && Math.random() < 0.50)) {
            const chosenCard = sorted[0];
            this.actionSwitch(player.id, minIdx, chosenCard);
            // 换牌后在牌桌上展示广播，拟真思考延迟 1200ms 后再由 AI 继续决策跟注或弃牌
            setTimeout(() => {
              if (this.status === 'BETTING' && this.currentTurnPlayerId === player.id) {
                this.continueAIDecision(player);
              }
            }, 1200);
            return;
          }
        }
      } catch (_) {}
    }

    this.continueAIDecision(player);
  }

  continueAIDecision(player) {
    const hand = player.cards || [];
    const isPair = hand.length === 2 && hand[0].value === hand[1].value;
    const highVal = hand.length > 0 ? Math.max(...hand.map(c => c.value)) : 0;
    const isSameSuit = hand.length === 2 && hand[0].suit === hand[1].suit;
    const isBigCard = highVal >= 11; // J, Q, K, A
    const isTrashHand = !isPair && highVal <= 8 && !isSameSuit; // 杂色小散牌 (如 2-7, 3-8)

    // 结合翻开公共牌后的实际最佳牌型评估
    let handRank = 1;
    const revealedComm = this.communityCards.slice(0, this.communityRevealedCount);
    if (hand.length + revealedComm.length >= 5) {
      try {
        const evalResult = PokerDeck.evaluateHand([...hand, ...revealedComm]);
        if (evalResult) {
          handRank = evalResult.rank;
        }
      } catch (_) {}
    } else if (isPair) {
      handRank = 2; // 起手对子
    }

    // 个性化博弈倾向
    const bluffChance = typeof player.bluffChance === 'number' ? player.bluffChance : 0.25;
    const allInChance = typeof player.allInChance === 'number' ? player.allInChance : 0.35;

    // 1. 面对场上有人 ALL-IN (面对 8 发子弹生死一瞬)
    if (this.allInTriggered) {
      // 强牌 (三条/顺子/同花/葫芦等 rank >= 4)：高概率 (90%) 跟注
      if (handRank >= 4) {
        if (Math.random() < 0.90) {
          this.actionCall(player.id);
        } else {
          this.actionFold(player.id);
        }
        return;
      }
      // 两对或大对子 (rank 3 或 对 A/K/Q)：按性格有 55% ~ 70% 跟注
      if (handRank === 3 || (isPair && highVal >= 12)) {
        if (Math.random() < (0.50 + bluffChance * 0.4)) {
          this.actionCall(player.id);
        } else {
          this.actionFold(player.id);
        }
        return;
      }
      // 普通一对 (rank 2)：75% 理智弃牌，25% 赌徒性格跟注
      if (handRank === 2) {
        if (Math.random() < (0.15 + bluffChance * 0.25)) {
          this.actionCall(player.id);
        } else {
          this.actionFold(player.id);
        }
        return;
      }
      // 散牌/弱牌 (rank 1)：88% 弃牌逃命，极低概率 (12%) 狂徒跟注
      if (Math.random() < (bluffChance * 0.3)) {
        this.actionCall(player.id);
      } else {
        this.actionFold(player.id);
      }
      return;
    }

    // 2. 首轮垃圾牌，考虑【懦夫弃牌】(只需装填 1 颗子弹赌命脱身)
    if (this.roundIndex === 1 && !player.hasUsedCowardFold) {
      if (isTrashHand && Math.random() < 0.45) {
        this.actionCowardFold(player.id);
        return;
      }
      if (handRank === 1 && highVal <= 9 && Math.random() < 0.25) {
        this.actionCowardFold(player.id);
        return;
      }
    }

    // 3. 发起【ALL-IN】孤注一掷 (规则要求翻开至少 3 张公共牌，且本轮未换牌)
    if (this.communityRevealedCount >= 3 && !player.switchedThisTurn) {
      // 3.1 强牌 ALL-IN：三条/顺子/同花/葫芦及以上 (rank >= 4)，或两对 (rank 3)
      if (handRank >= 4 && Math.random() < (0.45 + allInChance * 0.45)) {
        this.actionAllIn(player.id);
        return;
      }
      if (handRank === 3 && Math.random() < (0.30 + allInChance * 0.35)) {
        this.actionAllIn(player.id);
        return;
      }
      // 3.2 偷鸡诈唬 ALL-IN (Bluff)：散牌手牌伪装天牌掀桌，狂徒/狡诈型选手显著触发
      if (handRank <= 2 && Math.random() < (bluffChance * 0.35)) {
        this.addLog(`😈 【${player.name}】眼神凶狠，突然掀桌孤注一掷！`);
        this.actionAllIn(player.id);
        return;
      }
    }

    // 4. 常规轮次面对子弹累加时【主动弃牌】：
    // 当面对 2 颗子弹且手里仅有杂色小散牌时，弃牌率约 35%
    if (player.bulletsBet >= 2 && handRank === 1 && !isBigCard && Math.random() < 0.35) {
      this.actionFold(player.id);
      return;
    }
    // 当面对 3 颗子弹且手里无对子时，弃牌率提高至 55%
    if (player.bulletsBet >= 3 && handRank === 1 && Math.random() < 0.55) {
      this.actionFold(player.id);
      return;
    }
    // 当面对 4 颗子弹及以上，手牌极弱时，弃牌率提高至 70%
    if (player.bulletsBet >= 4 && handRank <= 2 && highVal <= 9 && Math.random() < 0.70) {
      this.actionFold(player.id);
      return;
    }

    // 5. 默认执行跟注
    this.actionCall(player.id);
  }

  /**
   * 获取用于前端渲染的快照状态
   */
  getStateSnapshot(forPlayerId) {
    return {
      status: this.status,
      handNumber: this.handNumber,
      roundIndex: this.roundIndex,
      config: this.config,
      turnDeadline: this.turnDeadline || 0,
      communityCards: this.communityCards.map((c, idx) => {
        if (idx < this.communityRevealedCount) {
          return c;
        }
        return { hidden: true };
      }),
      communityRevealedCount: this.communityRevealedCount,
      currentTurnPlayerId: this.currentTurnPlayerId,
      allInTriggered: this.allInTriggered,
      allInPlayerId: this.allInPlayerId || null,
      allInPlayerName: this.allInPlayerName || '',
      lastAction: this.lastAction,
      rouletteEvent: this.rouletteEvent,
      showdownResult: this.showdownResult,
      logs: this.logs.slice(0, 20),
      players: this.room.players.map(p => {
        const viewer = this.room.players.find(v => v.id === forPlayerId);
        const isViewerDead = viewer && !viewer.isAlive;
        const isSelf = p.id === forPlayerId;
        // 阵亡玩家在未开启「观战无透视」时具备全景透视特权；本人、公开手牌、或结算终局也可看真实底牌
        const canSeeCards = isSelf || (isViewerDead && !this.config.disableSpectatorXray) || p.revealedCards || this.status === 'GAME_OVER' || this.status === 'SHOWDOWN' || this.status === 'HAND_SUMMARY';
        const isLoser = Boolean(p.isLoser || (this.showdownResult && this.showdownResult.punishedPlayers && this.showdownResult.punishedPlayers.some(victim => victim.id === p.id)));
        const isWinner = Boolean(p.isWinner || (this.showdownResult && this.showdownResult.winners && this.showdownResult.winners.some(w => w.id === p.id)));

        // 计算该选手 7 选 5 最佳牌型与大小 (仅当对手牌可见时提供牌型评级)
        let handEvaluation = null;
        if (canSeeCards && p.cards && p.cards.length === 2 && this.communityCards && this.communityCards.length === 5) {
          try {
            const evaluated = PokerDeck.evaluateHand([...p.cards, ...this.communityCards]);
            const rankOrder = 11 - evaluated.rank;
            handEvaluation = {
              rank: evaluated.rank,
              rankOrder,
              rankName: evaluated.name,
              rankOrderText: `第 ${rankOrder} 大牌型`
            };
          } catch (_) {}
        }

        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHost: p.isHost,
          isBot: p.isBot,
          isAlive: p.isAlive,
          inHand: p.inHand,
          bulletsBet: p.bulletsBet,
          hasUsedCowardFold: p.hasUsedCowardFold,
          hasUsedSwitch: p.hasUsedSwitch,
          isAllIn: p.isAllIn,
          lastAction: p.lastAction || null,
          revealedCards: p.revealedCards,
          isLoser: Boolean(isLoser),
          isWinner: Boolean(isWinner),
          handEvaluation,
          cards: canSeeCards ? p.cards : (p.cards ? p.cards.map(() => ({ hidden: true })) : [])
        };
      })
    };
  }
}

module.exports = TexasPokerGame;
