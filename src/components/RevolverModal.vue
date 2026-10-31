<template>
  <div v-if="event" class="revolver-mask">
    <div class="revolver-card" :class="{ 'miracle-card': isMiracle, 'bang-card': isBang }">
      <!-- 正在扣动扳机提示 (弃牌绝不显示你输了) -->
      <template v-if="myId && event.player.id === myId">
        <div v-if="!revealed" class="roulette-status-tip">
          <span v-if="event.type && event.type.includes('FOLD')">🏳️ 弃牌赌命：正在扣动扳机 ({{ event.bullets }}/8 风险)...</span>
          <span v-else>⚡ 牌型落败：正在扣动扳机接受裁决 ({{ event.isAllIn ? '8/8' : `${event.bullets}/8` }} 风险)...</span>
        </div>
        <!-- 只有中弹了才显示“你输了” -->
        <div v-else-if="isBang" class="you-lost-roulette">
          💥 你输了！中弹淘汰！
        </div>
        <div v-else class="you-survived-roulette">
          💨 空枪生还！成功脱险！
        </div>
      </template>

      <!-- 其它玩家正在受罚/弃牌时，展示旁观视角提示，让所有人都清楚谁在面对枪口 -->
      <template v-else>
        <div v-if="!revealed" class="roulette-status-tip spectator-tip">
          <span v-if="event.type && event.type.includes('FOLD')">
            👀 【{{ event.player.name }}】主动弃牌，正在直面枪口 ({{ event.bullets }}/8 风险)...
          </span>
          <span v-else>
            👀 【{{ event.player.name }}】比牌落败，正在直面枪口裁决 ({{ event.isAllIn ? '8/8' : `${event.bullets}/8` }} 风险)...
          </span>
        </div>
        <div v-else-if="isBang" class="other-dead-roulette">
          💀 【{{ event.player.name }}】中弹身亡，淘汰出局！
        </div>
        <div v-else class="other-survived-roulette">
          💨 【{{ event.player.name }}】空枪生还，大难不死！
        </div>
      </template>

      <!-- 顶部受罚者信息 -->
      <div class="victim-header">
        <span class="avatar">{{ event.player.avatar }}</span>
        <div class="name-box">
          <div class="name">{{ event.player.name }}</div>
          <div class="tag" :class="{ allin: event.isAllIn }">
            {{ event.isAllIn ? '🔥 ALL-IN 孤注一掷' : `下注 ${event.bullets} 颗子弹` }}
          </div>
        </div>
      </div>

      <!-- 8 弹巢左轮动画区 -->
      <div class="cylinder-stage">
        <div class="cylinder-housing" :class="{ spinning: isSpinning }">
          <div
            v-for="idx in 8"
            :key="idx"
            class="chamber-hole"
            :class="`hole-${idx}`"
          >
            <div
              v-if="idx <= (event.isAllIn ? 8 : event.bullets)"
              class="bullet-brass"
            >
              <div class="primer"></div>
            </div>
          </div>
          <div class="cylinder-center">⚙️</div>
        </div>

        <!-- 枪口与扳机 -->
        <div class="barrel-hint">
          <span class="warning-text">⚠️ 弹巢装填 {{ event.isAllIn ? 8 : event.bullets }} / 8</span>
          <span v-if="event.isAllIn" class="god-whisper">
            「想祈祷就祈祷吧，神很少回应 (5% 生还率)」
          </span>
        </div>
      </div>

      <!-- 判定结果展示 -->
      <div v-if="revealed" class="result-box" :class="{ dead: isBang, alive: !isBang, miracle: isMiracle }">
        <div class="result-icon">
          <span v-if="isMiracle">🌟</span>
          <span v-else-if="!isBang">💨</span>
          <span v-else>💥</span>
        </div>
        <div class="result-title">
          <span v-if="isMiracle">【神迹生还】</span>
          <span v-else-if="!isBang">【空枪生还】</span>
          <span v-else>【致命中弹】</span>
        </div>
        <div class="result-desc">{{ event.result.message }}</div>
      </div>

      <div v-else class="pulling-indicator">
        <div class="pulse-dot"></div>
        <span>正在扣动扳机...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { sounds } from '../utils/audio';

const props = defineProps({
  event: {
    type: Object,
    default: null
  },
  myId: {
    type: String,
    default: ''
  }
});

const isSpinning = ref(false);
const revealed = ref(false);

const isBang = computed(() => props.event && props.event.result && props.event.result.isBang);
const isMiracle = computed(() => props.event && props.event.result && props.event.result.miracleSaved);

watch(
  () => props.event,
  (newVal) => {
    if (newVal) {
      revealed.value = false;
      isSpinning.value = true;
      sounds.playCockHammer();
      sounds.playCylinderSpin();
      sounds.playHeartbeat();

      // 放慢转盘展示节奏，给玩家充足的紧张悬念感与观察时间 (2400ms)
      setTimeout(() => {
        isSpinning.value = false;
        revealed.value = true;
        if (newVal.result.isBang) {
          sounds.playGunshot();
        } else {
          sounds.playClick();
          if (newVal.result.miracleSaved) {
            sounds.playVictory();
          }
        }
      }, 2400);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.revolver-mask {
  position: fixed;
  inset: 0;
  background: rgba(10, 11, 15, 0.92);
  backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.revolver-card {
  width: 100%;
  max-width: 420px;
  background: #171821;
  border: 2px solid #334155;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.3s ease;
}

.roulette-status-tip {
  width: 100%;
  padding: 8px 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #475569;
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 12px;
}

.you-survived-roulette {
  width: 100%;
  padding: 10px 14px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  text-align: center;
  margin-bottom: 14px;
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.6);
}

.you-lost-roulette {
  width: 100%;
  padding: 10px 14px;
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  border-radius: 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  text-align: center;
  margin-bottom: 14px;
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.6);
  animation: loseFlash 1.2s infinite alternate;
}

.other-dead-roulette {
  width: 100%;
  padding: 10px 14px;
  background: linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%);
  border: 1px solid #ef4444;
  border-radius: 10px;
  color: #fca5a5;
  font-size: 15px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 14px;
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
}

.other-survived-roulette {
  width: 100%;
  padding: 10px 14px;
  background: linear-gradient(135deg, #064e3b 0%, #022c22 100%);
  border: 1px solid #10b981;
  border-radius: 10px;
  color: #6ee7b7;
  font-size: 15px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 14px;
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.4);
}

@keyframes loseFlash {
  from { opacity: 0.85; transform: scale(0.99); }
  to { opacity: 1; transform: scale(1.02); }
}

.revolver-card.bang-card {
  border-color: #ef4444;
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.4);
}

.revolver-card.miracle-card {
  border-color: #fbbf24;
  box-shadow: 0 0 50px rgba(251, 191, 36, 0.6);
}

.victim-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: #1f212d;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #2e3344;
}

.victim-header .avatar {
  font-size: 28px;
}

.victim-header .name {
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.victim-header .tag {
  font-size: 11px;
  color: #fbbf24;
}

.victim-header .tag.allin {
  color: #ef4444;
  font-weight: 800;
}

/* 6 弹巢左轮居中绘制 */
.cylinder-stage {
  margin: 30px 0 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.cylinder-housing {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: #252836;
  border: 8px solid #3b4256;
  box-shadow: inset 0 0 20px #000, 0 8px 24px rgba(0, 0, 0, 0.6);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cylinder-housing.spinning {
  animation: spin 0.4s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.cylinder-center {
  font-size: 20px;
  color: #64748b;
  z-index: 2;
}

.chamber-hole {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #111218;
  border: 2px solid #232734;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 8 弹巢极坐标圆周均匀分布 */
.hole-1 { top: 8px; left: 64px; }
.hole-2 { top: 24px; right: 24px; }
.hole-3 { top: 64px; right: 8px; }
.hole-4 { bottom: 24px; right: 24px; }
.hole-5 { bottom: 8px; left: 64px; }
.hole-6 { bottom: 24px; left: 24px; }
.hole-7 { top: 64px; left: 8px; }
.hole-8 { top: 24px; left: 24px; }

.bullet-brass {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle, #fde047 30%, #b45309 90%);
  border: 1px solid #78350f;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}

.primer {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #78350f;
  border: 1px solid #451a03;
}

.barrel-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.warning-text {
  font-size: 13px;
  font-weight: 700;
  color: #f59e0b;
}

.god-whisper {
  font-size: 11px;
  color: #94a3b8;
  font-style: italic;
}

/* 结果呈现 */
.result-box {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  text-align: center;
  animation: popIn 0.3s ease;
}

@keyframes popIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.result-box.dead {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
}

.result-box.alive {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid #22c55e;
}

.result-box.miracle {
  background: rgba(251, 191, 36, 0.2);
  border: 1px solid #fbbf24;
}

.result-icon {
  font-size: 32px;
}

.result-title {
  font-size: 18px;
  font-weight: 800;
  margin-top: 4px;
  color: #f8fafc;
}

.result-desc {
  font-size: 12px;
  color: #cbd5e1;
  margin-top: 6px;
  line-height: 1.4;
}

.pulling-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #94a3b8;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f59e0b;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
</style>
