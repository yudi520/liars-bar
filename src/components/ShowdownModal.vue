<template>
  <div v-if="visible && result" class="showdown-mask" @click.self="$emit('close')">
    <div class="showdown-card">
      <!-- 弹窗顶栏 -->
      <div class="modal-header">
        <div class="h-title">
          <span class="icon">🃏</span>
          <h3>比牌决胜</h3>
        </div>
        <button class="close-x" title="关闭查看牌桌" @click="$emit('close')">✕</button>
      </div>

      <!-- 1. 上方：牌堆公共牌 (精巧紧凑微型，不抢视觉焦点) -->
      <div class="community-deck-section">
        <div class="sec-label">🎴 牌堆公共牌:</div>
        <div class="community-cards-row">
          <PokerCard
            v-for="(card, idx) in (communityCards || [])"
            :key="idx"
            :card="card"
            size="xs"
          />
        </div>
      </div>

      <!-- 2. 下方：各个在局玩家的手牌与牌型比对 -->
      <div class="players-cards-section">
        <div class="sec-label">👥 各玩家手牌与牌型</div>
        <div class="players-grid">
          <div
            v-for="item in (result.evaluatedList || [])"
            :key="item.playerId"
            class="player-card-row"
            :class="{
              'is-winner': revealedOutcome && item.isWinner,
              'is-loser': revealedOutcome && item.isLoser,
              'is-me': item.playerId === myId
            }"
          >
            <!-- 玩家头像与姓名 -->
            <div class="player-info">
              <span class="p-avatar">{{ item.avatar }}</span>
              <div class="p-name-box">
                <span class="p-name">{{ item.playerName }}</span>
                <span v-if="item.playerId === myId" class="me-tag">(我)</span>
              </div>
            </div>

            <!-- 玩家手牌与最佳牌型 -->
            <div class="player-hand-cards">
              <PokerCard
                v-for="(c, cIdx) in (item.cards || [])"
                :key="cIdx"
                :card="c"
                size="xs"
              />
            </div>

            <!-- 牌型与大小 -->
            <div class="hand-eval-badge">
              <span class="rank-tier">第 {{ item.rankOrder }} 大牌型</span>
              <strong class="rank-name">{{ item.rankName }}</strong>
            </div>

            <!-- 胜负印章 (看牌比对 10 秒后自动揭晓) -->
            <div class="outcome-stamp-wrap">
              <transition name="stamp-pop">
                <div v-if="revealedOutcome">
                  <span v-if="item.isWinner" class="stamp win-stamp">🏆 赢</span>
                  <span v-else-if="item.isLoser" class="stamp lose-stamp">💥 输</span>
                  <span v-else class="stamp safe-stamp">安全</span>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import PokerCard from './PokerCard.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  result: {
    type: Object,
    default: null
  },
  communityCards: {
    type: Array,
    default: () => []
  },
  myId: {
    type: String,
    default: ''
  },
  isHost: {
    type: Boolean,
    default: false
  }
});

defineEmits(['start-next-hand', 'close']);

// 控制是否已揭晓输赢：看牌比对 10 秒，揭晓输赢后给 5 秒
const revealedOutcome = ref(false);
let revealTimer = null;

function clearTimers() {
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function startFlow() {
  clearTimers();
  revealedOutcome.value = false;

  // 10 秒看牌比对后，揭晓输赢
  revealTimer = setTimeout(() => {
    revealedOutcome.value = true;
  }, 10000);
}

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      startFlow();
    } else {
      clearTimers();
      revealedOutcome.value = false;
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (props.visible) {
    startFlow();
  }
});

onUnmounted(() => {
  clearTimers();
});
</script>

<style scoped>
.showdown-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: modalFadeIn 0.25s ease-out;
}

@keyframes modalFadeIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

.showdown-card {
  width: 100%;
  max-width: 620px;
  background: #131722;
  border: 2px solid #3b4256;
  border-radius: 18px;
  padding: 18px 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.95);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 94vh;
  overflow-y: auto;
}

/* 顶栏 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #282f42;
  padding-bottom: 10px;
}

.h-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.h-title .icon {
  font-size: 20px;
}

.h-title h3 {
  font-size: 17px;
  font-weight: 800;
  color: #fbbf24;
  margin: 0;
}

.close-x {
  background: #232838;
  border: none;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-x:hover {
  background: #334155;
  color: #fff;
}

/* 区块公用标题 */
.sec-label {
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
  margin-bottom: 8px;
}

/* 1. 上方：牌堆公共牌 (精巧微型，不占空间) */
.community-deck-section {
  background: #191f2e;
  border: 1px solid #2d364f;
  border-radius: 8px;
  padding: 4px 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.community-deck-section .sec-label {
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  margin-bottom: 0;
  white-space: nowrap;
}

.community-cards-row {
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  padding: 0;
}

.community-cards-row :deep(.real-poker-card) {
  width: 26px !important;
  height: 38px !important;
  border-radius: 3px !important;
  padding: 1px !important;
}
.community-cards-row :deep(.corner-val) {
  font-size: 9px !important;
  font-weight: 800 !important;
}
.community-cards-row :deep(.corner-suit) {
  font-size: 7px !important;
}
.community-cards-row :deep(.pip-suit) {
  font-size: 11px !important;
}
.community-cards-row :deep(.center-medallion) {
  width: 12px !important;
  height: 12px !important;
}
.community-cards-row :deep(.skull-spade) {
  font-size: 7px !important;
}

/* 2. 下方：各玩家手牌与牌型比对 */
.players-cards-section {
  display: flex;
  flex-direction: column;
}

.players-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #171b28;
  border: 1px solid #282f42;
  border-radius: 10px;
  padding: 6px 10px;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.player-card-row.is-me {
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
}

.player-card-row.is-winner {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  box-shadow: 0 0 14px rgba(245, 158, 11, 0.3);
}

.player-card-row.is-loser {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.3);
}

/* 玩家信息 */
.player-info {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 60px;
  max-width: 75px;
  flex-shrink: 0;
}

.p-avatar {
  font-size: 17px;
  flex-shrink: 0;
}

.p-name-box {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
}

.p-name {
  font-size: 11.5px;
  font-weight: 700;
  color: #f1f5f9;
  max-width: 55px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-tag {
  font-size: 9.5px;
  color: #38bdf8;
  font-weight: 800;
}

/* 手牌展示：紧凑卡牌尺寸 */
.player-hand-cards {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  align-items: center;
}

.player-hand-cards :deep(.real-poker-card) {
  width: 26px !important;
  height: 38px !important;
  border-radius: 3px !important;
  padding: 1px !important;
}

.player-hand-cards :deep(.corner-val) {
  font-size: 9px !important;
  font-weight: 800 !important;
}

.player-hand-cards :deep(.corner-suit) {
  font-size: 7px !important;
}

.player-hand-cards :deep(.pip-suit) {
  font-size: 11px !important;
}

.player-hand-cards :deep(.devil-huge-icon) {
  font-size: 15px !important;
}

.player-hand-cards :deep(.joker-huge-icon) {
  font-size: 14px !important;
}

.player-hand-cards :deep(.joker-txt) {
  font-size: 6px !important;
}

/* 牌型胶囊 */
.hand-eval-badge {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #202637;
  border-radius: 6px;
  padding: 3px 6px;
  border: 1px solid #2f384f;
  overflow: hidden;
}

.rank-tier {
  font-size: 9px;
  font-weight: 800;
  color: #fbbf24;
  white-space: nowrap;
}

.rank-name {
  font-size: 11px;
  font-weight: 700;
  color: #f8fafc;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 胜负印章 */
.outcome-stamp-wrap {
  min-width: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stamp {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.win-stamp {
  background: #064e3b;
  color: #6ee7b7;
  border: 1px solid #059669;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
}

.lose-stamp {
  background: #7f1d1d;
  color: #fca5a5;
  border: 1px solid #dc2626;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

.safe-stamp {
  background: #1e293b;
  color: #94a3b8;
  font-size: 11px;
}

/* 印章弹入动画 */
.stamp-pop-enter-active {
  animation: stampPopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes stampPopIn {
  0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
  70% { transform: scale(1.15) rotate(3deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

@media (max-height: 560px), (max-width: 900px) {
  .showdown-mask {
    padding: 6px;
  }
  .showdown-card {
    max-width: min(96vw, 760px);
    padding: 8px 14px;
    gap: 6px;
    max-height: 98vh;
    overflow: hidden;
  }
  .modal-header {
    padding-bottom: 4px;
  }
  .h-title .icon {
    font-size: 16px;
  }
  .h-title h3 {
    font-size: 13px;
  }
  .close-x {
    width: 22px;
    height: 22px;
    font-size: 11px;
  }
  .community-deck-section {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 3px 8px;
    border-radius: 8px;
  }
  .community-deck-section .sec-label {
    font-size: 10px;
    margin-bottom: 0;
    white-space: nowrap;
  }
  .community-cards-row {
    gap: 4px;
    padding: 0;
  }
  .community-cards-row :deep(.real-poker-card) {
    width: 24px !important;
    height: 34px !important;
    border-radius: 3px !important;
    padding: 1px !important;
  }
  .community-cards-row :deep(.corner-val) {
    font-size: 8px !important;
    font-weight: 800 !important;
  }
  .community-cards-row :deep(.corner-suit) {
    font-size: 6.5px !important;
  }
  .community-cards-row :deep(.pip-suit) {
    font-size: 10px !important;
  }
  .community-cards-row :deep(.center-medallion) {
    width: 11px !important;
    height: 11px !important;
  }
  .community-cards-row :deep(.skull-spade) {
    font-size: 7px !important;
  }

  .players-cards-section .sec-label {
    display: none;
  }
  .players-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .player-card-row {
    padding: 3px 6px;
    border-radius: 6px;
    gap: 4px;
    min-height: 38px;
    min-width: 0;
    overflow: hidden;
  }
  .player-info {
    min-width: 50px;
    max-width: 65px;
    gap: 3px;
    flex-shrink: 0;
  }
  .p-avatar {
    font-size: 14px;
  }
  .p-name {
    font-size: 10.5px;
    max-width: 44px;
  }
  .player-hand-cards {
    gap: 2px;
    flex-shrink: 0;
  }
  .player-hand-cards :deep(.real-poker-card) {
    width: 23px !important;
    height: 34px !important;
    border-radius: 3px !important;
    padding: 1px !important;
  }
  .player-hand-cards :deep(.corner-val) {
    font-size: 8px !important;
    font-weight: 900 !important;
  }
  .player-hand-cards :deep(.corner-suit) {
    font-size: 6.5px !important;
  }
  .player-hand-cards :deep(.pip-suit) {
    font-size: 9.5px !important;
  }
  .player-hand-cards :deep(.devil-huge-icon) {
    font-size: 13px !important;
  }
  .player-hand-cards :deep(.joker-huge-icon) {
    font-size: 12px !important;
  }
  .player-hand-cards :deep(.joker-txt) {
    font-size: 5px !important;
  }
  .hand-eval-badge {
    padding: 2px 4px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }
  .rank-tier {
    font-size: 8px;
    white-space: nowrap;
  }
  .rank-name {
    font-size: 9.5px;
    margin-top: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .outcome-stamp-wrap {
    min-width: 32px;
    flex-shrink: 0;
  }
  .stamp {
    font-size: 9px;
    padding: 1px 3px;
    white-space: nowrap;
  }
}
</style>
