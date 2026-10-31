/**
 * 骗子酒馆 - 骗子纸牌 · 恶魔模式 规则状态机 (LiarsDeckGame.js)
 * 经典纸牌吹牛抓谎玩法 + 😈 恶魔卡 (Devil Card) + 📜 恶魔契约 (Devil's Deal)
 */

const LiarsDeck = require('./LiarsDeck');
const Revolver = require('./Revolver');

const TARGET_RANKS = [
  { rank: 'Q', label: 'Queen (Q)', symbol: '👑', desc: '王后' },
  { rank: 'K', label: 'King (K)', symbol: '👑', desc: '国王' },
  { rank: 'A', label: 'Ace (A)', symbol: '👑', desc: '王牌' }
];

class LiarsDeckGame {
  constructor(room) {
    this.room = room;
    this.deck = new LiarsDeck(true);

    this.status = 'LOBBY'; // 'LOBBY', 'PLAYING', 'CHALLENGE_REVEAL', 'ROULETTE', 'ROUND_OVER', 'GAME_OVER'
    this.handNumber = 0;
    this.tableCard = null; // 游戏开局前不公布目标牌，开局时随机确定

    // 房间可配置规则
    this.config = {
      enableDevilCard: true,  // 😈 恶魔牌：默认开启 (21张牌)
      enableDevilsDeal: false, // 📜 恶魔契约：额外扩展，默认关闭
      disableTurnTimer: false, // ⏳ 不限时思考机制 (不读秒)：默认关闭
      disableSpectatorXray: false, // 🙈 观战无透视：默认关闭 (默认开启全景透视)
      maxPlayers: 4
    };

    // 牌桌公共数据
    this.tablePile = [];         // 桌面扣置牌堆 [{ playerId, playerName, count, cards }]
    this.tableCardsCount = 0;    // 桌面累计扣牌总数
    this.historyFlatCards = [];  // 打出的扁平牌流水 (供恶魔契约查询最近4张)
    this.lastPlay = null;        // 上一位玩家的出牌声明 { playerId, playerName, count, cards, claimedRank }

    this.currentTurnPlayerId = null;
    this.turnDeadline = 0;
    this.turnTimer = null;
    this.nextHandTimer = null;

    // 交互动效与弹窗事件
    this.revealEvent = null;     // 质疑/契约揭牌浮层事件
    this.rouletteEvent = null;   // 俄罗斯轮盘动画事件
    this.logs = [];              // 对局历史流水记录
  }

  addLog(msg) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 60) this.logs.pop();
  }

  updateConfig(newConfig = {}) {
    if (this.status !== 'LOBBY') return false;
    if (typeof newConfig.enableDevilCard === 'boolean') {
      this.config.enableDevilCard = newConfig.enableDevilCard;
    }
    if (typeof newConfig.enableDevilsDeal === 'boolean') {
      this.config.enableDevilsDeal = newConfig.enableDevilsDeal;
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
    const timerText = this.config.disableTurnTimer ? '⏳ 不限时思考(不读秒)' : '⏱️ 20秒读秒';
    const specText = this.config.disableSpectatorXray ? '🙈 观战无透视' : '👁️ 观战透视';
    this.addLog(`房主更新规则：${this.config.enableDevilCard ? '😈 启用恶魔牌' : '🚫 禁用恶魔牌'}，${this.config.enableDevilsDeal ? '📜 启用恶魔契约' : '🚫 禁用恶魔契约'}，${timerText}，${specText}，上限 ${this.config.maxPlayers} 人。`);
    return true;
  }

  /**
   * 开启整场全新游戏
   */
  startNewGame() {
    const connectedPlayers = this.room.players.filter(p => p.connected);
    if (connectedPlayers.length < 2) {
      this.addLog('🔄 人数不足 2 人，无法开局，请邀请电脑 AI 或等待好友加入！');
      this.room.broadcastState();
      return;
    }

    this.handNumber = 0;
    for (const p of this.room.players) {
      p.isAlive = true;
      p.cards = [];
      p.hasClearedCards = false;
      p.isWinner = false;
      p.shotsFired = 0; // 6 孔左轮初始已开 0 枪，初次开枪几率 1/6
    }

    this.addLog('🔥 骗子酒馆·纸牌恶魔局 正式开始！');
    this.startNextHand();
  }

  /**
   * 开启新一小局发牌
   */
  startNextHand() {
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    const alivePlayers = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline));
    if (alivePlayers.length <= 1) {
      this.checkEndGame();
      return;
    }

    this.handNumber += 1;
    this.status = 'PLAYING';
    this.revealEvent = null;
    this.rouletteEvent = null;
    this.tablePile = [];
    this.tableCardsCount = 0;
    this.historyFlatCards = [];
    this.lastPlay = null;

    // 1. 重新洗牌 (带恶魔牌配置)
    this.deck = new LiarsDeck(this.config.enableDevilCard);

    // 2. 随机抽选本局目标牌 (Q, K, 或 A)
    this.tableCard = TARGET_RANKS[Math.floor(Math.random() * TARGET_RANKS.length)];

    // 3. 为每位存活玩家分发 5 张手牌
    for (const p of alivePlayers) {
      p.cards = this.deck.draw(5);
      p.hasClearedCards = false;
    }

    // 4. 决定本局起手先手玩家 (按顺位轮流)
    const startIdx = (this.handNumber - 1) % alivePlayers.length;
    this.currentTurnPlayerId = alivePlayers[startIdx].id;

    const startPlayer = alivePlayers[startIdx];
    this.addLog(`🎴 第 ${this.handNumber} 副牌开局！本轮桌面目标牌为：【${this.tableCard.label}】！`);
    if (this.config.enableDevilCard) {
      this.addLog('😈 本局包含【Devil 卡】！若被翻开，出恶魔牌者免罚，其余全员开枪！');
    }
    this.addLog(`👉 首轮由【${startPlayer.name}】先手行动！`);

    this.resetTurnCountdown();
    this.room.broadcastState();

    this.checkAITurn();
  }

  /**
   * 重置 20 秒行动倒计时 (若开启不限时思考，且当前为真人玩家则不设倒计时)
   */
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
      this.handleTurnTimeout();
    }, 20000);
  }

  /**
   * 行动超时自动处理
   */
  handleTurnTimeout() {
    if (this.status !== 'PLAYING') return;
    const player = this.room.players.find(p => p.id === this.currentTurnPlayerId);
    if (!player || !player.isAlive || player.cards.length === 0) return;

    // 当其他在座所有玩家手牌均已打尽时，超时自动强制质疑
    const otherAliveWithCards = this.room.players.filter(p => p.id !== player.id && p.isAlive && p.connected && p.cards.length > 0);
    if (otherAliveWithCards.length === 0 && this.tableCardsCount > 0) {
      this.addLog(`⏰ 【${player.name}】行动超时！其他玩家手牌均已打尽，系统强制对其发起质疑！`);
      this.actionChallenge(player.id);
      return;
    }

    this.addLog(`⏰ 【${player.name}】行动超时！系统代为出牌！`);
    // 超时默认自动打出第 1 张手牌（如是恶魔牌自动单张，否则最多打出 1 张合规牌）
    const cardToPlay = player.cards[0];
    this.actionPlayCards(player.id, [cardToPlay.id]);
  }

  /**
   * 玩家操作：出牌 (1 ~ 3 张)
   * @param {string} playerId 
   * @param {Array<string>} cardIds 
   */
  actionPlayCards(playerId, cardIds) {
    if (this.status !== 'PLAYING') throw new Error('当前非出牌阶段！');
    if (this.currentTurnPlayerId !== playerId) throw new Error('尚未轮到您的出牌回合！');
    if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > 3) {
      throw new Error('每次最少打出 1 张牌，最多打出 3 张牌！');
    }

    // 核心规则：当在场其他所有存活玩家手牌均已打尽时，出牌阶段被系统强制替换为质疑，无法继续出牌！
    const otherAliveWithCards = this.room.players.filter(p => p.id !== playerId && p.isAlive && p.connected && p.cards.length > 0);
    if (otherAliveWithCards.length === 0 && this.tableCardsCount > 0) {
      throw new Error('其他玩家手牌已全部清空，当前阶段被强制替换为质疑，无法继续出牌！');
    }

    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) throw new Error('玩家不存在或已阵亡！');

    // 检查玩家手牌中是否存在这些牌
    const chosenCards = [];
    for (const cid of cardIds) {
      const idx = player.cards.findIndex(c => c.id === cid);
      if (idx === -1) throw new Error('选择的手牌不合法或不在手牌中！');
      chosenCards.push(player.cards[idx]);
    }

    // 核心规则：😈 恶魔卡只能单张打出！
    const hasDevil = chosenCards.some(c => c.type === 'DEVIL');
    if (hasDevil && chosenCards.length > 1) {
      throw new Error('😈 恶魔牌只能单张打出，严禁与其它牌组合打包！');
    }

    // 从玩家手牌移除
    player.cards = player.cards.filter(c => !cardIds.includes(c.id));

    // 记入桌面牌堆
    const playRecord = {
      playerId: player.id,
      playerName: player.name,
      avatar: player.avatar,
      count: chosenCards.length,
      cards: chosenCards, // 真实牌面 (用于结算判定)
      claimedRank: this.tableCard.rank,
      time: Date.now()
    };

    this.tablePile.push(playRecord);
    this.tableCardsCount += chosenCards.length;
    this.historyFlatCards.push(...chosenCards);
    this.lastPlay = playRecord;

    this.addLog(`🃏 【${player.name}】打出 ${chosenCards.length} 张牌，声称是【${this.tableCard.label}】！`);

    // 检查该玩家手牌是否已清空
    if (player.cards.length === 0) {
      player.hasClearedCards = true;
      this.addLog(`🎉 【${player.name}】手牌已全部清空，本副牌安全脱身！`);
    }

    // 判断局势是否推进
    this.advanceTurn();
  }

  /**
   * 推进至下一位行动玩家
   */
  advanceTurn() {
    const alivePlayersWithCards = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline) && p.cards.length > 0);

    // 若场上所有存活玩家手牌全部出完，或只剩 1 人有手牌
    if (alivePlayersWithCards.length === 0) {
      this.addLog('🏁 牌桌手牌已全部打尽，全员安然脱险，准备发下一副新牌！');
      this.finishHandCycle();
      return;
    }

    // 顺位寻找下一位存活且手中有牌的玩家 (逆时针推进)
    const allAlive = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline));
    const curIdx = allAlive.findIndex(p => p.id === this.currentTurnPlayerId);
    let nextPlayer = null;

    for (let i = 1; i <= allAlive.length; i++) {
      const candidate = allAlive[(curIdx + i) % allAlive.length];
      if (candidate.cards.length > 0) {
        nextPlayer = candidate;
        break;
      }
    }

    if (!nextPlayer) {
      this.finishHandCycle();
      return;
    }

    this.currentTurnPlayerId = nextPlayer.id;
    this.resetTurnCountdown();
    this.room.broadcastState();

    this.checkAITurn();
  }

  /**
   * 玩家操作：质疑揭穿 (Liar!)
   * @param {string} challengerId 
   */
  actionChallenge(challengerId) {
    if (this.status !== 'PLAYING') throw new Error('当前非行动阶段！');
    if (this.currentTurnPlayerId !== challengerId) throw new Error('尚未轮到您的出牌回合！');
    if (!this.lastPlay) throw new Error('牌桌暂无上一位玩家出牌，无法质疑！');

    const challenger = this.room.players.find(p => p.id === challengerId);
    const prevPlayer = this.room.players.find(p => p.id === this.lastPlay.playerId);
    if (!challenger || !prevPlayer) throw new Error('玩家信息无效！');

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    this.status = 'CHALLENGE_REVEAL';
    const revealedCards = this.lastPlay.cards;
    const targetRank = this.tableCard.rank;

    // 阶段 1：先进入验牌悬念等待 (等待片刻再揭晓上一名玩家的结果)
    this.revealEvent = {
      phase: 'SUSPENSE',
      type: 'CHALLENGE_SUSPENSE',
      challenger: { id: challenger.id, name: challenger.name, avatar: challenger.avatar },
      liar: { id: prevPlayer.id, name: prevPlayer.name, avatar: prevPlayer.avatar },
      cardsCount: revealedCards.length,
      tableCard: this.tableCard,
      message: `⚠️ 【${challenger.name}】质疑【${prevPlayer.name}】，验牌中...`
    };
    this.addLog(`⚠️ 【${challenger.name}】质疑【${prevPlayer.name}】，验牌中...`);
    this.room.broadcastState();

    // 延迟 1.8 秒揭晓结果
    setTimeout(() => {
      // 1. 核心判定：是否包含 😈 恶魔卡
      const hasDevil = revealedCards.some(c => c.type === 'DEVIL');

      if (hasDevil) {
        // 核心规则：谁质疑恶魔牌，出恶魔牌的玩家免罚，其余玩家需开枪！
        const victims = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline) && p.id !== prevPlayer.id);

        this.revealEvent = {
          phase: 'RESULT',
          type: 'DEVIL_TRIGGERED',
          hasDevil: true,
          devilPlayerId: prevPlayer.id,
          devilPlayerName: prevPlayer.name,
          challenger: { id: challenger.id, name: challenger.name, avatar: challenger.avatar },
          liar: { id: prevPlayer.id, name: prevPlayer.name, avatar: prevPlayer.avatar },
          cards: revealedCards,
          tableCard: this.tableCard,
          message: `😈 翻出恶魔牌！【${prevPlayer.name}】免罚，其余所有玩家接受轮盘惩罚！`,
          victims: victims.map(v => ({ id: v.id, name: v.name, avatar: v.avatar }))
        };

        this.addLog(`😈 翻出恶魔牌！【${prevPlayer.name}】免受惩罚，其余所有玩家直面轮盘赌！`);
        this.room.broadcastState();

        setTimeout(() => {
          this.executeRouletteQueue(victims);
        }, 3200);
        return;
      }

      // 2. 常规牌判定：检查是否存在假牌 (非目标牌且非 Joker)
      const isBluff = revealedCards.some(c => c.rank !== targetRank && c.type !== 'JOKER');

      if (isBluff) {
        // 上家说谎！上家一人受罚
        const victims = [prevPlayer];
        this.revealEvent = {
          phase: 'RESULT',
          type: 'BLUFF_CAUGHT',
          challenger: { id: challenger.id, name: challenger.name, avatar: challenger.avatar },
          liar: { id: prevPlayer.id, name: prevPlayer.name, avatar: prevPlayer.avatar },
          cards: revealedCards,
          tableCard: this.tableCard,
          message: `🚨 【${prevPlayer.name}】撒谎，接受开枪！`,
          victims: [{ id: prevPlayer.id, name: prevPlayer.name, avatar: prevPlayer.avatar }]
        };

        this.addLog(`🚨 【${prevPlayer.name}】撒谎，接受开枪！`);
        this.room.broadcastState();

        setTimeout(() => {
          this.executeRouletteQueue(victims);
        }, 3000);
      } else {
        // 上家诚实！质疑者误判，质疑者一人受罚
        const victims = [challenger];
        this.revealEvent = {
          phase: 'RESULT',
          type: 'TRUTH_FAILED',
          challenger: { id: challenger.id, name: challenger.name, avatar: challenger.avatar },
          liar: { id: prevPlayer.id, name: prevPlayer.name, avatar: prevPlayer.avatar },
          cards: revealedCards,
          tableCard: this.tableCard,
          message: `🛡️ 【${prevPlayer.name}】没撒谎，【${challenger.name}】质疑失败受罚！`,
          victims: [{ id: challenger.id, name: challenger.name, avatar: challenger.avatar }]
        };

        this.addLog(`🛡️ 【${prevPlayer.name}】没撒谎，【${challenger.name}】质疑失败受罚！`);
        this.room.broadcastState();

        setTimeout(() => {
          this.executeRouletteQueue(victims);
        }, 3000);
      }
    }, 1800);
  }

  /**
   * 玩家操作：恶魔契约 (Devil's Deal)
   * 房主建房的额外可选机制，默认关闭。翻开最近打出的 4 张牌，若全假则除发起者外全员受罚，若有真牌则发起者自己受罚。
   * @param {string} callerId 
   */
  actionDevilsDeal(callerId) {
    if (!this.config.enableDevilsDeal) throw new Error('本局未开启【恶魔契约】额外机制！');
    if (this.status !== 'PLAYING') throw new Error('当前非行动阶段！');
    if (this.currentTurnPlayerId !== callerId) throw new Error('尚未轮到您的出牌回合！');
    if (this.historyFlatCards.length < 4) {
      throw new Error(`桌面累计打出牌数不足 4 张（当前仅 ${this.historyFlatCards.length} 张），无法发起恶魔契约！`);
    }

    const caller = this.room.players.find(p => p.id === callerId);
    if (!caller || !caller.isAlive) throw new Error('玩家无效！');

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    this.status = 'CHALLENGE_REVEAL';
    const last4Cards = this.historyFlatCards.slice(-4);
    const targetRank = this.tableCard.rank;

    this.revealEvent = {
      phase: 'SUSPENSE',
      type: 'DEVIL_DEAL',
      challenger: { id: caller.id, name: caller.name, avatar: caller.avatar },
      cardsCount: 4,
      tableCard: this.tableCard,
      message: `📜 【${caller.name}】发起了【恶魔契约】！正在翻开最近打出的 4 张牌...`
    };
    this.addLog(`📜 【${caller.name}】发起了【恶魔契约】！正在翻开最近打出的 4 张牌...`);
    this.room.broadcastState();

    setTimeout(() => {
      // 检查是否 4 张牌全都是谎报（全都是假牌，无一是目标牌或 Joker）
      const isLieCard = (c) => c.rank !== targetRank && c.type !== 'JOKER';
      const allLies = last4Cards.every(isLieCard);

      if (allLies) {
        // 4 张全都是谎报！契约生效，除发起者外全员受罚
        const victims = this.room.players.filter(p => p.isAlive && p.connected && p.id !== caller.id);

        this.revealEvent = {
          phase: 'RESULT',
          type: 'DEVIL_DEAL_SUCCESS',
          challenger: { id: caller.id, name: caller.name, avatar: caller.avatar },
          cards: last4Cards,
          tableCard: this.tableCard,
          message: `🔥 恶魔契约生效！最近打出的 4 张牌全都是谎报！发起者【${caller.name}】安全，除他外全场直面轮盘赌！`,
          victims: victims.map(v => ({ id: v.id, name: v.name, avatar: v.avatar }))
        };

        this.addLog(`🔥 恶魔契约生效！4 张牌证实全为谎言！除【${caller.name}】外全场接受轮盘惩罚！`);
        this.room.broadcastState();

        setTimeout(() => {
          this.executeRouletteQueue(victims);
        }, 3200);
      } else {
        // 存在真牌或Joker！契约反噬，发起者自己受罚
        const victims = [caller];

        this.revealEvent = {
          phase: 'RESULT',
          type: 'DEVIL_DEAL_FAIL',
          challenger: { id: caller.id, name: caller.name, avatar: caller.avatar },
          cards: last4Cards,
          tableCard: this.tableCard,
          message: `⚡ 契约反噬！4 张牌中夹杂着真牌！发起者【${caller.name}】自己承受轮盘惩罚！`,
          victims: [{ id: caller.id, name: caller.name, avatar: caller.avatar }]
        };

        this.addLog(`⚡ 契约反噬！4 张牌并非全假！【${caller.name}】遭受反噬，自己直面轮盘赌！`);
        this.room.broadcastState();

        setTimeout(() => {
          this.executeRouletteQueue(victims);
        }, 3200);
      }
    }, 1800);
  }

  /**
   * 顺序执行轮盘惩罚队列
   * @param {Array} victims 受罚玩家列表
   * @param {number} index 当前轮到第几个受罚者
   */
  executeRouletteQueue(victims, index = 0) {
    if (!victims || index >= victims.length) {
      // 队列执行完毕，清空事件，检查胜负或开启下一小手
      this.rouletteEvent = null;
      this.revealEvent = null;
      this.finishHandCycle();
      return;
    }

    const victim = victims[index];
    // 若受罚玩家已阵亡或彻底不存在，跳过执行下一个 (离线玩家由 AI 托管受罚)
    if (!victim.isAlive || (!victim.connected && !victim.isOffline)) {
      this.executeRouletteQueue(victims, index + 1);
      return;
    }

    // 6 弹孔渐进式俄罗斯轮盘赌规则：
    // 初次 1/6 概率中枪；存活则弹巢移入下一孔，下次 1/5 概率，以此类推 (1/6 -> 1/5 -> 1/4 -> 1/3 -> 1/2 -> 1/1)
    const shotsFired = victim.shotsFired || 0;
    const remainingChambers = Math.max(1, 6 - shotsFired);
    const bangChance = 1 / remainingChambers;
    const roll = Math.random();
    const isBang = roll < bangChance;
    const chanceText = `1/${remainingChambers}`;

    // 阶段 1：瞄准扣动阶段 (结局尚未发生，弹巢转动与准星锁定，绝不提前剧透)
    this.addLog(`🔫 【${victim.name}】直面枪口，正在扣动第 ${shotsFired + 1} 枪扳机 (风险 ${chanceText})...`);

    this.rouletteEvent = {
      type: 'LIARS_ROULETTE',
      player: { id: victim.id, name: victim.name, avatar: victim.avatar },
      playerId: victim.id,
      shotsFired: shotsFired + 1,
      chamberCount: 6,
      chanceText,
      pending: true,
      result: null
    };

    this.status = 'ROULETTE';
    this.room.broadcastState();

    // 阶段 2：等待 1.8 秒转轮瞄准动画播放后，实弹击发或空枪咔嗒！
    setTimeout(() => {
      if (isBang) {
        victim.isAlive = false;
        victim.deathCards = [...(victim.cards || [])];
        victim.cards = [];
        this.addLog(`💥 砰！【${victim.name}】第 ${shotsFired + 1} 枪中弹淘汰！`);
      } else {
        victim.shotsFired = shotsFired + 1;
        this.addLog(`💨 咔嗒！【${victim.name}】第 ${shotsFired + 1} 枪空枪脱险！`);
      }

      this.rouletteEvent = {
        type: 'LIARS_ROULETTE',
        player: { id: victim.id, name: victim.name, avatar: victim.avatar },
        playerId: victim.id,
        shotsFired: shotsFired + 1,
        chamberCount: 6,
        chanceText,
        pending: false,
        result: {
          isBang,
          survived: !isBang,
          shotsFired: victim.shotsFired,
          remainingChambers: isBang ? 0 : (6 - victim.shotsFired)
        }
      };

      this.room.broadcastState();

      // 阶段 3：击发火光/青烟与战况展现 2.5 秒后，继续下一受罚者或判定胜负
      setTimeout(() => {
        this.executeRouletteQueue(victims, index + 1);
      }, 2500);
    }, 1800);
  }

  /**
   * 结束一小轮，检查是否产生唯一总冠军，或发下一副牌
   */
  finishHandCycle() {
    this.status = 'ROUND_OVER';
    this.rouletteEvent = null;
    this.revealEvent = null;

    const alivePlayers = this.room.players.filter(p => p.isAlive && p.connected);

    if (alivePlayers.length <= 1) {
      this.checkEndGame();
      return;
    }

    this.addLog('⏳ 裁决结算完毕，4 秒后将洗牌发牌开启下一副新牌...');
    this.room.broadcastState();

    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startNextHand();
    }, 4000);
  }

  /**
   * 检查是否产生唯一冠军
   */
  checkEndGame() {
    this.status = 'GAME_OVER';
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);

    const alivePlayers = this.room.players.filter(p => p.isAlive && p.connected);
    if (alivePlayers.length === 1) {
      const champ = alivePlayers[0];
      champ.isWinner = true;
      this.addLog(`👑 胜负终局！【${champ.name}】成为骗子纸牌唯一幸存者，赢取全场胜利！`);
    } else {
      this.addLog('💀 全员阵亡，无人生还！酒馆归于死寂。');
    }

    this.room.broadcastState();
  }

  /**
   * 电脑 AI 机器人思考与决策调度 (支持离线玩家 AI 托管代打)
   */
  checkAITurn() {
    if (this.status !== 'PLAYING') return;
    const curPlayer = this.room.players.find(p => p.id === this.currentTurnPlayerId);
    if (!curPlayer || !curPlayer.isAlive || curPlayer.cards.length === 0) return;
    // 如果既不是机器人，也不是离线代打玩家，则等待人类操作
    if (!curPlayer.isBot && curPlayer.connected && !curPlayer.isOffline) return;

    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }

    // 拟真思考延迟 1400 ~ 2400ms
    const thinkDelay = Math.floor(1400 + Math.random() * 1000);

    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      try {
        if (this.status !== 'PLAYING' || this.currentTurnPlayerId !== curPlayer.id) return;
        const freshPlayer = this.room.players.find(p => p.id === curPlayer.id);
        if (!freshPlayer || !freshPlayer.isAlive) return;
        this.makeAIDecision(freshPlayer);
      } catch (err) {
        console.warn('LiarsDeck AI 决策调度异常捕获:', err.message);
      }
    }, thinkDelay);
  }

  /**
   * 执行 AI 具体决策 (智能吹牛、设恶魔陷阱或抓谎)
   */
  makeAIDecision(player) {
    try {
      const hand = player.cards || [];
      if (hand.length === 0) return;

      // 0. 核心规则：当在场其他所有存活玩家手牌均已打尽时，被强制替换为质疑，无法继续出牌！
      const otherAliveWithCards = this.room.players.filter(p => p.id !== player.id && p.isAlive && (p.connected || p.isOffline) && p.cards.length > 0);
      if (otherAliveWithCards.length === 0 && this.tableCardsCount > 0) {
        this.actionChallenge(player.id);
        return;
      }

    const targetRank = this.tableCard.rank;
    const bluffChance = typeof player.bluffChance === 'number' ? player.bluffChance : 0.35;

    // 1. 若有上一位玩家出牌，优先评估是否发起【质疑 (Challenge)】
    if (this.lastPlay) {
      const prevCount = this.lastPlay.count; // 上家出了几张
      // 统计自己手里持有的目标牌数量
      const myMatchingCount = hand.filter(c => c.rank === targetRank || c.type === 'JOKER').length;

      // 概率计算：若上家出 3 张，AI 自己手里又有 3~4 张，那上家极大可能说谎
      let doubtProb = 0.20;
      if (prevCount === 3) doubtProb += 0.40;
      if (prevCount === 2) doubtProb += 0.20;
      if (myMatchingCount >= 3) doubtProb += 0.35;
      if (myMatchingCount >= 2) doubtProb += 0.15;

      // 结合 AI 的狡诈与激进个性微调
      doubtProb = doubtProb + (bluffChance * 0.2);

      if (Math.random() < doubtProb) {
        this.actionChallenge(player.id);
        return;
      }
    }

    // 2. 若开启恶魔契约且桌面累计牌数 ≥4，激进狂徒型 AI 有小概率发起恶魔契约
    if (this.config.enableDevilsDeal && this.historyFlatCards.length >= 4 && bluffChance >= 0.45 && Math.random() < 0.25) {
      this.actionDevilsDeal(player.id);
      return;
    }

    // 3. 决定出牌组合
    // 3.1 若手中有 😈 恶魔牌，且性格偏狡诈/凶悍，有 35% ~ 60% 概率将其作为单张陷阱打出！
    const devilCard = hand.find(c => c.type === 'DEVIL');
    if (devilCard && Math.random() < (0.35 + bluffChance * 0.3)) {
      this.actionPlayCards(player.id, [devilCard.id]);
      return;
    }

    // 3.2 筛选手牌中符合目标牌或 Joker 的真牌
    const matchingCards = hand.filter(c => c.rank === targetRank || c.type === 'JOKER');
    const fakeCards = hand.filter(c => c.type !== 'DEVIL' && c.rank !== targetRank && c.type !== 'JOKER');

    // 若手里有真牌且判定不吹牛 (约 75% 几率走诚实出牌)
    if (matchingCards.length > 0 && Math.random() < 0.75) {
      const playCount = Math.min(matchingCards.length, Math.floor(1 + Math.random() * 2)); // 1~2 张
      const toPlay = matchingCards.slice(0, playCount).map(c => c.id);
      this.actionPlayCards(player.id, toPlay);
      return;
    }

    // 3.3 吹牛/谎报出牌：选择 1 ~ 2 张假牌谎报
    if (fakeCards.length > 0) {
      const playCount = Math.min(fakeCards.length, Math.random() < 0.7 ? 1 : 2);
      const toPlay = fakeCards.slice(0, playCount).map(c => c.id);
      this.actionPlayCards(player.id, toPlay);
      return;
    }

    // 兜底：出第 1 张手牌
    this.actionPlayCards(player.id, [hand[0].id]);
  } catch (err) {
    console.warn('LiarsDeck AI 决策执行异常，保底质疑:', err.message);
    try {
      if (this.tableCardsCount > 0) {
        this.actionChallenge(player.id);
      }
    } catch (_) {}
  }
}

  /**
   * 状态快照生成
   */
  getStateSnapshot(viewerPlayerId) {
    const viewer = this.room.players.find(v => v.id === viewerPlayerId);
    const isViewerDead = Boolean(viewer && !viewer.isAlive);
    const activeAlive = this.room.players.filter(p => p.isAlive && (p.connected || p.isOffline));
    const otherAliveWithCards = activeAlive.filter(p => p.id !== viewerPlayerId && (p.cards || []).length > 0);
    const mustChallenge = this.status === 'PLAYING' &&
      this.currentTurnPlayerId === viewerPlayerId &&
      otherAliveWithCards.length === 0 &&
      this.tableCardsCount > 0;

    return {
      mode: 'LIARS_DECK',
      status: this.status,
      handNumber: this.handNumber,
      tableCard: this.status === 'LOBBY' ? null : this.tableCard,
      mustChallenge,
      config: { ...this.config },
      tableCardsCount: this.tableCardsCount,
      lastPlay: this.lastPlay
        ? {
            playerId: this.lastPlay.playerId,
            playerName: this.lastPlay.playerName,
            avatar: this.lastPlay.avatar,
            count: this.lastPlay.count,
            claimedRank: this.lastPlay.claimedRank,
            time: this.lastPlay.time
          }
        : null,
      currentTurnPlayerId: this.currentTurnPlayerId,
      turnDeadline: this.turnDeadline,
      turnRemainingSeconds: this.turnDeadline > 0 ? Math.max(0, Math.ceil((this.turnDeadline - Date.now()) / 1000)) : null,
      revealEvent: this.revealEvent,
      rouletteEvent: this.rouletteEvent,
      logs: [...this.logs],
      players: this.room.players.map(p => {
        const isSelf = p.id === viewerPlayerId;
        const isGameOver = this.status === 'GAME_OVER';
        const canSeeCards = isSelf || isGameOver || (isViewerDead && !this.config.disableSpectatorXray);
        const shotsFired = p.shotsFired || 0;
        const remainingChambers = Math.max(1, 6 - shotsFired);
        const safeChambers = Math.max(0, remainingChambers - 1);
        const surviveChance = `${safeChambers}/${remainingChambers}`;
        const survivePercent = Math.round((safeChambers / remainingChambers) * 100);
        const finalCards = (p.cards && p.cards.length > 0) ? p.cards : (p.deathCards || []);
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHost: p.isHost,
          isBot: p.isBot,
          isOffline: !!p.isOffline,
          connected: p.connected,
          personality: p.personality || '',
          isAlive: p.isAlive,
          hasClearedCards: p.hasClearedCards || false,
          isWinner: p.isWinner || false,
          shotsFired,
          bulletsFired: shotsFired,
          remainingChambers,
          currentChance: `1/${remainingChambers}`,
          surviveChance,
          survivePercent,
          cardCount: (p.cards || []).length,
          // 阵亡玩家具备全景透视特权；本人或终局结算也可看真实手牌
          cards: canSeeCards ? finalCards : (p.cards || []).map(c => ({ hidden: true }))
        };
      })
    };
  }
}

module.exports = LiarsDeckGame;
