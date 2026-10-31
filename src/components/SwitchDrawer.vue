<template>
  <!-- 极简无遮挡单行底部换牌浮动栏：高度极矮，完全不遮挡桌心公共牌与手牌 -->
  <div v-if="visible" class="switch-bottom-bar">
    <div class="switch-content">
      <!-- 阶段 1：先选要换的手牌 (选定即锁定，无法再换另外一张) -->
      <template v-if="lockedDiscardIdx === null">
        <div class="prompt-hint">👉 请选择要换掉的手牌:</div>
        <div class="cards-flow">
          <div
            v-for="(card, idx) in myCards"
            :key="'choose-' + idx"
            class="card-slot selectable"
            @click="lockDiscardCard(idx)"
          >
            <PokerCard :card="card" size="sm" />
          </div>
        </div>
        <div class="timer-pill" :class="{ urgent: remainingSeconds <= 5 }">
          ⏱️ {{ remainingSeconds }}s
        </div>
      </template>

      <!-- 阶段 2：已选定要换的手牌（锁定），挑选牌库候选牌（点哪个换哪个，没点默认第一张） -->
      <template v-else>
        <!-- 已锁定的弃牌 -->
        <div class="group-box locked-group">
          <span class="group-tag discard-tag">弃 🔒</span>
          <div class="card-slot locked-slot">
            <PokerCard :card="myCards[lockedDiscardIdx]" size="sm" />
            <span class="status-badge discard-badge">弃</span>
          </div>
        </div>

        <!-- 转换箭头 -->
        <div class="exchange-arrow">➔</div>

        <!-- 候选池：默认第一张，点哪个换哪个 -->
        <div class="group-box pick-group">
          <span class="group-tag pick-tag">选</span>
          <div class="cards-flow">
            <div
              v-for="(card, idx) in candidates"
              :key="'cand-' + idx"
              class="card-slot candidate-slot"
              :class="{ active: selectedCandidateIdx === idx }"
              @click="selectCandidate(idx)"
            >
              <PokerCard
                :card="card"
                size="sm"
                :selected="selectedCandidateIdx === idx"
              />
              <span v-if="selectedCandidateIdx === idx" class="status-badge pick-badge">选</span>
            </div>
          </div>
        </div>

        <!-- 确认换牌按钮与倒计时 -->
        <div class="action-wrap">
          <button class="confirm-switch-btn" @click="handleConfirm">
            确认换牌
          </button>
          <div class="timer-pill" :class="{ urgent: remainingSeconds <= 5 }">
            ⏱️ {{ remainingSeconds }}s
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import PokerCard from './PokerCard.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  myCards: {
    type: Array,
    default: () => []
  },
  candidates: {
    type: Array,
    default: () => []
  },
  remainingSeconds: {
    type: Number,
    default: 20
  }
});

const emit = defineEmits(['confirm', 'update-choice']);

// lockedDiscardIdx: 选定弃牌序号后即刻锁定，不可更换另外一张手牌
const lockedDiscardIdx = ref(null);
// selectedCandidateIdx: 默认第一张候选牌 (index 0)
const selectedCandidateIdx = ref(0);
const hasPickedCandidate = ref(false);
const isConfirmed = ref(false);

watch(
  () => props.visible,
  (val) => {
    if (val) {
      lockedDiscardIdx.value = null;
      selectedCandidateIdx.value = 0;
      hasPickedCandidate.value = false;
      isConfirmed.value = false;
    }
  }
);

// 选定要换掉的手牌，选定后立即锁定无法更改另外一张
function lockDiscardCard(idx) {
  if (lockedDiscardIdx.value !== null) return;
  lockedDiscardIdx.value = idx;
  // 实时同步给服务端：已选定该张手牌进行置换
  emit('update-choice', { discardCardIndex: idx });
}

// 挑选候选牌：点了哪张就选哪张
function selectCandidate(idx) {
  hasPickedCandidate.value = true;
  selectedCandidateIdx.value = idx;
  // 实时同步给服务端：已点击选择该候选牌
  const chosenCard = props.candidates[idx];
  emit('update-choice', { newCard: chosenCard, candidateIndex: idx });
}

// 执行确认换牌
function handleConfirm() {
  if (isConfirmed.value) return;
  isConfirmed.value = true;

  // 1. 如果已选了一个牌(如选了4)，就换那张牌；如果是没选一个牌，就默认第 1 张手牌 (index 0)
  const discardIdx = lockedDiscardIdx.value !== null ? lockedDiscardIdx.value : 0;

  // 2. 要换的候选牌：点哪张(如点了5)就换哪张；没点就默认换第一张候选牌
  const candIdx = (selectedCandidateIdx.value !== null && props.candidates[selectedCandidateIdx.value])
    ? selectedCandidateIdx.value
    : 0;
  const newCard = props.candidates[candIdx] || props.candidates[0];

  emit('confirm', {
    discardIndex: discardIdx,
    newCard
  });
}

// 倒计时结束时，在换牌阶段默认换已点击的那张牌，没点击默认第一张牌
watch(
  () => props.remainingSeconds,
  (sec) => {
    if (props.visible && sec <= 0 && !isConfirmed.value) {
      handleConfirm();
    }
  }
);
</script>

<style scoped>
.switch-bottom-bar {
  position: fixed;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: auto;
  animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translate(-50%, 20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.switch-content {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(14, 16, 25, 0.96);
  border: 1.5px solid #6366f1;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85), 0 0 16px rgba(99, 102, 241, 0.4);
  border-radius: 14px;
  padding: 6px 12px;
  backdrop-filter: blur(12px);
}

.prompt-hint {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
  white-space: nowrap;
  padding: 0 4px;
}

.group-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.group-tag {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
}

.discard-tag {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.pick-tag {
  background: rgba(16, 185, 129, 0.25);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.cards-flow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-slot {
  position: relative;
  cursor: pointer;
  transition: transform 0.15s ease;
  user-select: none;
}

.card-slot.selectable:active {
  transform: scale(0.96);
}

.card-slot.locked-slot {
  cursor: default;
}

.status-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  font-size: 9px;
  font-weight: 900;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  border: 1px solid #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  z-index: 5;
}

.discard-badge {
  background: #ef4444;
}

.pick-badge {
  background: #10b981;
}

.exchange-arrow {
  color: #a5b4fc;
  font-size: 16px;
  font-weight: 900;
  padding: 0 2px;
  text-shadow: 0 0 8px rgba(165, 180, 252, 0.6);
}

.action-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
}

.confirm-switch-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  border: none;
  font-size: 13px;
  font-weight: 800;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
  transition: all 0.15s ease;
}

.confirm-switch-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.confirm-switch-btn:active {
  transform: translateY(1px);
}

.timer-pill {
  font-size: 11px;
  font-weight: 800;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 4px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.timer-pill.urgent {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  animation: pulseUrgent 0.8s infinite alternate;
}

@keyframes pulseUrgent {
  from { transform: scale(1); }
  to { transform: scale(1.08); }
}
</style>
