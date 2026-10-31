/**
 * 骗子酒馆 - 房间状态机与网络调度中心 (RoomManager.js)
 * 预留多模式架构（首发 TEXAS_POKER 德州扑克子弹模式，可拓展 LIARS_DECK / LIARS_DICE）
 */

const TexasPokerGame = require('./TexasPokerGame');
const LiarsDeckGame = require('./LiarsDeckGame');
const LiarsDiceGame = require('./LiarsDiceGame');
const { AIBot } = require('./AIBot');

class RoomManager {
  constructor(broadcastCallback) {
    this.broadcastCallback = broadcastCallback;
    this.mode = 'LIARS_DECK'; // 默认模式：'LIARS_DECK' 骗子纸牌 · 恶魔模式，亦可切换为 'TEXAS_POKER' 或 'LIARS_DICE'
    this.players = [];         // 房间所有玩家列表
    this.game = this.createGame(this.mode);
  }

  createGame(mode) {
    if (mode === 'LIARS_DECK') {
      return new LiarsDeckGame(this);
    }
    if (mode === 'LIARS_DICE') {
      return new LiarsDiceGame(this);
    }
    return new TexasPokerGame(this);
  }

  /**
   * 房主在大厅阶段切换游戏模式
   */
  switchMode(newMode) {
    if (this.game.status !== 'LOBBY') {
      throw new Error('仅在大厅阶段可切换游戏模式！');
    }
    if (newMode !== 'TEXAS_POKER' && newMode !== 'LIARS_DECK' && newMode !== 'LIARS_DICE') {
      throw new Error(`暂不支持的游戏模式: ${newMode}`);
    }
    this.mode = newMode;
    this.game = this.createGame(newMode);
    for (const p of this.players) {
      p.cards = [];
      p.dice = [];
      p.isAlive = true;
      p.hasClearedCards = false;
      p.isWinner = false;
    }
    let modeName = '🃏 骗子纸牌 · 恶魔模式';
    if (newMode === 'TEXAS_POKER') modeName = '🎰 德州扑克 · 子弹模式';
    if (newMode === 'LIARS_DICE') modeName = '🎲 骗子骰子 · 吹牛模式';
    this.game.addLog(`🔄 房主已将游戏模式切换为【${modeName}】！`);
    this.broadcastState();
  }

  broadcastState() {
    if (typeof this.broadcastCallback === 'function') {
      this.broadcastCallback();
    }
  }

  /**
   * 玩家加入房间
   */
  joinPlayer(socketId, { name, avatar, isHost = false, mode, config }) {
    // 若房主创建/加入房间且场上无活跃人类玩家，彻底重置为全新的大厅状态
    const validModes = ['TEXAS_POKER', 'LIARS_DECK', 'LIARS_DICE'];
    if (isHost && (this.players.length === 0 || this.players.every(p => !p.connected || p.isBot))) {
      this.players = [];
      if (mode && validModes.includes(mode)) {
        this.mode = mode;
      }
      this.game = this.createGame(this.mode);
    } else if (isHost && mode && validModes.includes(mode) && this.mode !== mode && this.game.status === 'LOBBY') {
      this.mode = mode;
      this.game = this.createGame(this.mode);
    }

    if (isHost && config) {
      this.game.updateConfig(config);
    }

    // 若存在同名离线托管玩家，支持断线重连并恢复控制
    let offlinePlayer = this.players.find(p => p.isOffline && p.name === name);
    if (offlinePlayer) {
      offlinePlayer.id = socketId;
      offlinePlayer.connected = true;
      offlinePlayer.isOffline = false;
      offlinePlayer.isBot = false;
      if (avatar) offlinePlayer.avatar = avatar;
      this.game.addLog(`👋 玩家【${offlinePlayer.name}】重新连接上线，收回出战控制权！`);
      this.broadcastState();
      return offlinePlayer;
    }

    let player = this.players.find(p => p.id === socketId);
    if (!player) {
      if (this.players.length >= this.game.config.maxPlayers) {
        throw new Error(`房间已满（上限 ${this.game.config.maxPlayers} 人），无法加入！`);
      }

      player = {
        id: socketId,
        name: name || `酒客_${this.players.length + 1}`,
        avatar: avatar || '🤠',
        isHost: isHost || this.players.length === 0,
        isBot: false,
        connected: true,
        isAlive: true,
        inHand: false,
        cards: [],
        bulletsBet: 0,
        hasUsedCowardFold: false,
        hasUsedSwitch: false,
        switchedThisTurn: false,
        switchCandidates: null,
        isAllIn: false,
        hasActedInRound: false,
        revealedCards: false
      };
      this.players.push(player);
      this.game.addLog(`👋 玩家【${player.name}】进入了骗子酒馆！`);
    } else {
      player.connected = true;
      if (name) player.name = name;
      if (avatar) player.avatar = avatar;
    }

    this.broadcastState();
    return player;
  }

  /**
   * 玩家断开连接
   */
  disconnectPlayer(socketId) {
    const player = this.players.find(p => p.id === socketId);
    if (player) {
      player.connected = false;
      // 如果处于大厅阶段或游戏结束阶段，直接移除
      if (this.game.status === 'LOBBY' || this.game.status === 'GAME_OVER') {
        this.players = this.players.filter(p => p.id !== socketId);
        this.game.addLog(`🚪 玩家【${player.name}】退出了房间。`);
      } else {
        // 游戏对决中离线：保留席位，标记离线并转交 AI 托管出牌
        player.isOffline = true;
        player.isBot = true;
        if (!player.personality) {
          player.personality = '老辣沉稳';
          player.bluffChance = 0.35;
        }
        this.game.addLog(`🔌 玩家【${player.name}】已离线，由电脑 AI 自动托管出牌！`);

        // 若当前正好轮到该离线玩家行动，触发 AI 决策
        if (this.game.currentTurnPlayerId === socketId) {
          if (typeof this.game.checkAITurn === 'function') {
            this.game.checkAITurn();
          } else if (this.game.status === 'BETTING') {
            try {
              this.game.actionFold(socketId);
            } catch (_) {}
          }
        }
      }

      // 若场上已无任何人类玩家（在大厅阶段），彻底归零重置
      const activeHumans = this.players.filter(p => !p.isBot && p.connected);
      if (activeHumans.length === 0 && (this.game.status === 'LOBBY' || this.game.status === 'GAME_OVER')) {
        this.players = [];
        this.game = this.createGame(this.mode);
      }
      this.broadcastState();
    }
  }

  /**
   * 房主添加 AI 电脑玩家
   */
  addBot() {
    if (this.game.status === 'GAME_OVER') {
      this.resetToLobby();
    } else if (this.game.status !== 'LOBBY') {
      this.game.status = 'LOBBY';
    }
    const max = (this.game && this.game.config && this.game.config.maxPlayers) || 4;
    if (this.players.length >= max) {
      throw new Error(`房间人数已达上限 (${max}人)！`);
    }

    const bot = AIBot.createBot(this.players);
    this.players.push(bot);
    this.game.addLog(`🤖 房主邀请了电脑选手【${bot.name}】入座 (风格: ${bot.personality})！`);
    this.broadcastState();
    return bot;
  }

  /**
   * 房主移除玩家或 AI
   */
  removePlayer(playerId) {
    if (this.game.status !== 'LOBBY') {
      throw new Error('仅在大厅阶段可移除玩家！');
    }
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const p = this.players[idx];
      this.players.splice(idx, 1);
      this.game.addLog(`🚪 【${p.name}】已被请出酒馆。`);
      this.broadcastState();
    }
  }

  /**
   * 房主重置房间为备战大厅状态
   */
  resetToLobby() {
    this.game = this.createGame(this.mode);
    for (const p of this.players) {
      p.isAlive = true;
      p.cards = [];
      p.bulletsBet = 0;
      p.hasUsedCowardFold = false;
      p.hasUsedSwitch = false;
      p.switchedThisTurn = false;
      p.switchCandidates = null;
      p.isAllIn = false;
      p.hasActedInRound = false;
      p.revealedCards = false;
      p.hasClearedCards = false;
      p.isWinner = false;
      p.isLoser = false;
    }
    this.game.addLog('🔄 房主重置房间为备战大厅，随时可开局或邀请电脑 AI！');
    this.broadcastState();
  }

  /**
   * 房主随时解散/取消房间
   */
  cancelRoom(socketId) {
    this.game.addLog('🚫 房主解散了骗子酒馆房间，全员退出！');
    this.players = [];
    this.game = this.createGame(this.mode);
    this.broadcastState();
  }

  /**
   * 房主修改房间规则
   */
  updateConfig(config) {
    const res = this.game.updateConfig(config);
    this.broadcastState();
    return res;
  }

  /**
   * 房主启动游戏
   */
  startGame() {
    if (this.players.length < 2) {
      this.addBot();
    }
    this.game.startNewGame();
  }

  /**
   * 房主/玩家开始下一手牌/下一轮
   */
  startNextHand() {
    if (typeof this.game.startNextHand === 'function') {
      this.game.startNextHand();
    } else if (typeof this.game.startNextRound === 'function') {
      this.game.startNextRound();
    }
  }

  /**
   * 处理玩家交互动作
   */
  handleAction(playerId, action, payload = {}) {
    switch (action) {
      // 骗子骰子动作
      case 'BID':
        return this.game.actionBid(playerId, payload.quantity, payload.faceValue);
      case 'UPDATE_SELECTION':
        if (typeof this.game.actionUpdateSelection === 'function') {
          return this.game.actionUpdateSelection(playerId, payload.quantity, payload.faceValue);
        }
        return false;
      case 'CHALLENGE_DICE':
        return this.game.actionChallenge(playerId);
      case 'SPOT_ON':
        return this.game.actionSpotOn(playerId);

      // 骗子纸牌 · 恶魔模式动作
      case 'PLAY_CARDS':
        return this.game.actionPlayCards(playerId, payload.cardIds);
      case 'CHALLENGE':
        return this.game.actionChallenge(playerId);
      case 'DEVILS_DEAL':
        return this.game.actionDevilsDeal(playerId);

      // 德州扑克动作
      case 'CALL':
        return this.game.actionCall(playerId);
      case 'FOLD':
        return this.game.actionFold(playerId, payload);
      case 'COWARD_FOLD':
        return this.game.actionCowardFold(playerId, payload);
      case 'SWITCH': {
        const discardIdx = payload.discardCardIndex !== undefined ? payload.discardCardIndex : payload.discardIndex;
        return this.game.actionSwitch(playerId, discardIdx, payload.newCard);
      }
      case 'ALL_IN':
        return this.game.actionAllIn(playerId);
      case 'TOGGLE_REVEAL':
        return this.game.actionToggleRevealCard(playerId);
      default:
        throw new Error(`未知动作: ${action}`);
    }
  }

  /**
   * 获取指定玩家可获得的房间快照
   */
  getPlayerState(playerId) {
    return {
      mode: this.mode,
      ...this.game.getStateSnapshot(playerId)
    };
  }
}

module.exports = RoomManager;
