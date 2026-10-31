<template>
  <div class="player-stage">
    <!-- 顶部状态栏 -->
    <header class="player-header">
      <div class="user-meta">
        <span class="avatar">{{ me?.avatar || '🤠' }}</span>
        <div class="meta-txt">
          <div class="uname">{{ me?.name || '酒客' }}</div>
          <div class="seat-bullet">已押: {{ me?.bulletsBet || 0 }} / 8 颗子弹</div>
        </div>
      </div>

      <div class="right-tools">
        <button class="rule-btn" @click="showRules = true">📜 规则</button>
      </div>
    </header>

    <!-- 公共牌微缩带 -->
    <div class="comm-strip">
      <div class="strip-header">
        <span class="stage-tag">第 {{ state.roundIndex }} 轮 ({{ getRoundLabel(state.roundIndex) }})</span>
        <span class="comm-stat">公共牌 ({{ state.communityRevealedCount }}/5)</span>
      </div>
      <div class="comm-cards-row">
        <PokerCard
          v-for="(card, idx) in state.communityCards"
          :key="idx"
          :card="card"
          size="sm"
          :face-down="card.hidden"
        />
      </div>
    </div>

    <!-- 牌局提示条 -->
    <div class="game-turn-banner" :class="{ 'my-turn': isMyTurn }">
      <span v-if="!me?.isAlive">💀 您已不幸阵亡，正在观战酒馆决战...</span>
      <span v-else-if="!me?.inHand">🏳️ 您已弃牌退出本手，等待下一局...</span>
      <span v-else-if="isMyTurn">⚡ 轮到你了！请下定决心抉择行动！</span>
      <span v-else>⏳ 正在等待 <strong>{{ currentTurnPlayerName }}</strong> 决策...</span>
    </div>

    <!-- 核心：私密手牌区 (防偷窥按住看牌) -->
    <div class="private-hand-zone">
      <div class="peek-instruction">
        <span>🛡️ 防偷窥保护：按住下方牌面查看，松手自动隐藏</span>
      </div>

      <div
        class="hand-cards-wrapper"
        @touchstart.passive="isPeeking = true"
        @touchend.passive="isPeeking = false"
        @mousedown="isPeeking = true"
        @mouseup="isPeeking = false"
        @mouseleave="isPeeking = false"
      >
        <PokerCard
          v-for="(card, idx) in (me?.cards || [])"
          :key="idx"
          :card="card"
          size="xl"
          :face-down="!isPeeking && !keepRevealed && !me?.revealedCards"
        />
      </div>

      <!-- 持续看牌开关与自愿亮牌按钮 -->
      <div class="hand-aux-bar">
        <label class="always-peek-chk">
          <input type="checkbox" v-model="keepRevealed" />
          <span>持续显示(独处时)</span>
        </label>

        <!-- 自愿亮牌给全场看 (针对出局者或获胜者) -->
        <button class="public-reveal-btn" @click="$emit('action', 'TOGGLE_REVEAL')">
          {{ me?.revealedCards ? '🔒 遮盖手牌' : '👀 公开手牌' }}
        </button>
      </div>

      <!-- 战报流水 -->
      <div class="ticker-box">
        <span class="tick-icon">📢</span>
        <span class="tick-txt">{{ formatLogText(state.logs && state.logs[0]) }}</span>
      </div>
    </div>

    <!-- 底部操作按钮群 -->
    <div class="player-controls">
      <!-- 正常行动按钮 -->
      <div class="primary-actions">
        <!-- 跟注 -->
        <button
          class="act-btn call-btn"
          :disabled="!canAct"
          @click="$emit('action', 'CALL')"
        >
          <span class="act-icon">➕</span>
          <div class="act-txt">
            <span class="main-t">跟注</span>
            <span class="sub-t">+1 子弹</span>
          </div>
        </button>

        <!-- 弃牌 -->
        <button
          class="act-btn fold-btn"
          :disabled="!canAct"
          @click="$emit('action', 'FOLD')"
        >
          <span class="act-icon">🏳️</span>
          <div class="act-txt">
            <span class="main-t">弃牌</span>
            <span class="sub-t">面对 {{ me?.bulletsBet || 1 }} 弹</span>
          </div>
        </button>
      </div>

      <!-- 特殊技能栏 -->
      <div class="special-actions">
        <!-- 懦夫弃牌 (仅首轮/限1次) -->
        <button
          class="spec-btn coward-btn"
          :disabled="!canAct || state.roundIndex !== 1 || me?.hasUsedCowardFold"
          title="首轮保命特权，仅需装入 1 颗子弹赌命"
          @click="$emit('action', 'COWARD_FOLD')"
        >
          🏃 懦夫弃牌 (1弹)
        </button>

        <!-- Switch 换牌 -->
        <button
          v-if="state.config?.enableSwitch"
          class="spec-btn switch-btn"
          :disabled="!canAct || me?.hasUsedSwitch"
          title="置换手牌，本轮将无法孤注一掷"
          @click="requestSwitchCandidates"
        >
          🔄 换牌 (Switch)
        </button>

        <!-- ALL-IN 孤注一掷 -->
        <button
          class="spec-btn allin-btn"
          :disabled="!canAct || me?.switchedThisTurn"
          title="赌注拉满至8发，5%几率神明保佑生还"
          @click="$emit('action', 'ALL_IN')"
        >
          🔥 孤注一掷 (ALL-IN)
        </button>
      </div>
    </div>

    <!-- Switch 换牌抽屉 -->
    <SwitchDrawer
      :visible="showSwitchDrawer"
      :my-cards="me?.cards || []"
      :candidates="switchCandidates"
      @confirm="onSwitchConfirm"
      @cancel="showSwitchDrawer = false"
    />

    <!-- 轮盘赌决斗弹窗 -->
    <RevolverModal :event="state.rouletteEvent" />

    <!-- 牌型指南 -->
    <HandRankGuide :visible="showRules" @close="showRules = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import RevolverModal from './RevolverModal.vue';
import HandRankGuide from './HandRankGuide.vue';
import SwitchDrawer from './SwitchDrawer.vue';
import PokerCard from './PokerCard.vue';
import { socketService } from '../api/socketService';

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  myId: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['action']);

const isPeeking = ref(false);
const keepRevealed = ref(false);
const showRules = ref(false);
const showSwitchDrawer = ref(false);
const switchCandidates = ref([]);

const me = computed(() => {
  if (!props.state || !props.state.players) return null;
  return props.state.players.find(p => p.id === props.myId);
});

const isMyTurn = computed(() => {
  return props.state.status === 'BETTING' && props.state.currentTurnPlayerId === props.myId;
});

const canAct = computed(() => {
  return isMyTurn.value && me.value && me.value.isAlive && me.value.inHand;
});

const currentTurnPlayerName = computed(() => {
  const p = props.state.players.find(x => x.id === props.state.currentTurnPlayerId);
  return p ? p.name : '';
});

function getRoundLabel(round) {
  if (round === 1) return '翻牌前 Pre-Flop';
  if (round === 2) return '翻牌圈 Flop (3张)';
  if (round === 3) return '转牌圈 Turn (4张)';
  if (round === 4) return '河牌圈 River (5张)';
  return '对决';
}

function formatLogText(log) {
  if (!log) return '牌局推进中...';
  return log.replace(/\[\s*(?:GMT\+8|GMT\+08:00|CST|UTC|中国标准时间)?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:GMT\+8|GMT\+08:00|CST|UTC|中国标准时间)?\s*\]/gi, '[$1]');
}

function requestSwitchCandidates() {
  socketService.send('REQUEST_SWITCH_CANDIDATES');
  socketService.on('switch_candidates', (candidates) => {
    switchCandidates.value = candidates;
    showSwitchDrawer.value = true;
  });
}

function onSwitchConfirm({ discardIndex, newCard }) {
  showSwitchDrawer.value = false;
  emit('action', 'SWITCH', {
    discardCardIndex: discardIndex,
    newCard
  });
}
</script>

<style scoped>
.player-stage {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #0f1017;
  color: #f1f5f9;
  max-width: 500px;
  margin: 0 auto;
}

.player-header {
  height: 54px;
  background: #161823;
  border-bottom: 1px solid #232738;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-meta .avatar {
  font-size: 24px;
}

.meta-txt .uname {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.seat-bullet {
  font-size: 10px;
  color: #fbbf24;
}

.rule-btn {
  background: #232738;
  border: 1px solid #38425e;
  color: #fbbf24;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

/* 公共牌预览带 */
.comm-strip {
  background: #141620;
  padding: 10px 16px;
  border-bottom: 1px solid #232738;
}

.strip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.stage-tag {
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
}

.comm-stat {
  font-size: 11px;
  color: #94a3b8;
}

.comm-cards-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.mini-comm-card {
  width: 48px;
  height: 68px;
  border-radius: 6px;
  background: #1c1f2e;
  border: 1px solid #2e354b;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.mini-comm-card.revealed {
  background: #ffffff;
  border-color: #cbd5e1;
}

.mini-comm-card .val {
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
}

.mini-comm-card .suit {
  font-size: 18px;
  line-height: 1;
}

.mini-comm-card .bk {
  font-size: 18px;
  color: #475569;
}

/* 回合提示 */
.game-turn-banner {
  background: #181b26;
  padding: 8px 16px;
  font-size: 12px;
  text-align: center;
  color: #cbd5e1;
  border-bottom: 1px solid #232738;
}

.game-turn-banner.my-turn {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: #f59e0b;
}

/* 手牌防偷窥核心区 */
.private-hand-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.peek-instruction {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 14px;
}

.hand-cards-wrapper {
  display: flex;
  gap: 16px;
  cursor: pointer;
  touch-action: none;
}

.private-card {
  width: 120px;
  height: 170px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
  transition: transform 0.2s;
}

.private-card:active {
  transform: scale(0.98);
}

.private-card .face {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-radius: 12px;
  border: 2px solid #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.private-card .face .val {
  font-size: 44px;
  font-weight: 900;
  line-height: 1;
}

.private-card .face .suit {
  font-size: 48px;
  line-height: 1;
  margin-top: 6px;
}

.private-card .back {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, #831843 30%, #4c0519 100%);
  border: 3px solid #be185d;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fbcfe8;
}

.private-card .back .lock-icon {
  font-size: 36px;
}

.private-card .back .tap-hint {
  font-size: 12px;
  font-weight: 700;
  margin-top: 6px;
}

.hand-aux-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 260px;
  margin-top: 16px;
  font-size: 11px;
  color: #94a3b8;
}

.always-peek-chk {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.public-reveal-btn {
  background: #1f2333;
  border: 1px solid #3b4256;
  color: #38bdf8;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.ticker-box {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #151824;
  border: 1px solid #282d3f;
  border-radius: 8px;
  padding: 8px 12px;
  width: 100%;
  font-size: 11px;
  color: #cbd5e1;
}

/* 底部操作区 */
.player-controls {
  background: #141620;
  border-top: 1px solid #232738;
  padding: 14px 16px 24px;
}

.primary-actions {
  display: flex;
  gap: 12px;
}

.act-btn {
  flex: 1;
  padding: 12px 10px;
  border-radius: 12px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.act-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.call-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.fold-btn {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.act-icon {
  font-size: 20px;
}

.act-txt {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.main-t {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.1;
}

.sub-t {
  font-size: 10px;
  opacity: 0.9;
}

.special-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.spec-btn {
  flex: 1;
  padding: 8px 4px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid #333d54;
  background: #1c202d;
  color: #e2e8f0;
  cursor: pointer;
}

.spec-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.coward-btn {
  border-color: #38bdf8;
  color: #38bdf8;
}

.switch-btn {
  border-color: #fbbf24;
  color: #fbbf24;
}

.allin-btn {
  border-color: #ef4444;
  color: #f87171;
  font-weight: 800;
}
</style>
