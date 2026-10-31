<template>
  <div class="head-shooter-overlay" :class="{ 'is-bang': isBang, 'is-alive': isRevealed && !isBang }">
    <!-- 1. 枪支击发与枪口火焰/青烟动效 (全息拟真渲染) -->
    <div class="gun-muzzle-wrapper" :class="{ 'recoil-active': isRevealed }">
      <!-- 实体转轮手枪示意图标与准星瞄准 -->
      <div class="crosshair-target" :class="{ locked: isRevealed }">
        <span class="crosshair-ring"></span>
        <span class="gun-silhouette">🔫</span>
      </div>

      <!-- 枪口火焰 (中弹时爆发巨大火光与震屏粒子) -->
      <div v-if="isRevealed && isBang" class="bang-flame-burst">
        <div class="muzzle-flash">🔥</div>
        <div class="sparks">✨</div>
      </div>

      <!-- 击发失败/空枪青烟 -->
      <div v-else-if="isRevealed && !isBang" class="click-smoke-drift">
        <div class="smoke-puff">💨</div>
      </div>
    </div>

    <!-- 2. 头顶悬浮状态看板 -->
    <div class="shoot-pill" :class="{ 'pill-bang': isBang, 'pill-alive': isRevealed && !isBang }">
      <div class="pill-title">
        <span v-if="!isRevealed" class="pulse-icon">⚠️</span>
        <span v-else-if="isBang" class="bang-icon">💥</span>
        <span v-else class="safe-icon">🛡️</span>
        <span class="pill-text">{{ statusText }}</span>
      </div>

      <!-- 左轮弹巢转动与击发高亮 (德州8孔，纸牌6孔渐进) -->
      <div class="mini-cylinder-housing" :class="{ spinning: isSpinning }">
        <div
          v-for="idx in chamberCount"
          :key="idx"
          class="mini-chamber"
          :class="getChamberClass(idx)"
          :title="`弹巢槽位 ${idx}`"
        >
          <span v-if="hasPrimer(idx)" class="mini-primer"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  event: {
    type: Object,
    required: true
  },
  isSpinning: {
    type: Boolean,
    default: true
  },
  isRevealed: {
    type: Boolean,
    default: false
  }
});

const isActuallyRevealed = computed(() => {
  if (props.event?.pending === true) return false;
  if (props.event?.pending === false && props.event?.result) return true;
  return props.isRevealed;
});

const isBang = computed(() => isActuallyRevealed.value && props.event?.result?.isBang);
const isMiracle = computed(() => isActuallyRevealed.value && props.event?.result?.miracleSaved);

const isLiarsDeck = computed(() => props.event?.type === 'LIARS_ROULETTE');
const chamberCount = computed(() => isLiarsDeck.value ? (props.event?.chamberCount || 6) : 8);

function getChamberClass(idx) {
  if (isLiarsDeck.value) {
    const curShot = props.event?.shotsFired || 1;
    if (idx < curShot) return 'chamber-fired-past'; // 之前击发过的空弹位
    if (idx === curShot) {
      if (isActuallyRevealed.value && isBang.value) return 'chamber-fired';
      if (isActuallyRevealed.value && !isBang.value) return 'chamber-empty';
      return 'chamber-danger';
    }
    return 'chamber-upcoming';
  } else {
    // 德州扑克模式 (8孔)
    const isLoaded = idx <= (props.event.isAllIn ? 8 : props.event.bullets);
    return {
      'chamber-loaded': isLoaded,
      'chamber-fired': isActuallyRevealed.value && isBang.value && idx === 1,
      'chamber-empty': isActuallyRevealed.value && !isBang.value && idx === 1
    };
  }
}

function hasPrimer(idx) {
  if (isLiarsDeck.value) {
    const curShot = props.event?.shotsFired || 1;
    return idx >= curShot;
  }
  return idx <= (props.event.isAllIn ? 8 : props.event.bullets);
}

const statusText = computed(() => {
  if (!isActuallyRevealed.value) {
    if (isLiarsDeck.value) {
      return `第 ${props.event.shotsFired || 1} 枪 (${props.event.chanceText || '1/6'} 风险)...`;
    }
    if (props.event.isAllIn) {
      return 'ALL-IN 满膛(8/8) 瞄准中...';
    }
    return `直面枪口 (${props.event.bullets}/8 弹)...`;
  }
  if (isMiracle.value) {
    return '🌟 5% 神迹生还！成功避开！';
  }
  if (isBang.value) {
    return '💥 砰！实弹击发！中弹淘汰！';
  }
  if (isLiarsDeck.value) {
    const nextRem = props.event?.result?.remainingChambers;
    const nextText = nextRem ? `下枪 1/${nextRem}` : '终局';
    return `💨 咔嗒！空枪脱险！(${nextText})`;
  }
  return '💨 咔嗒！空枪脱险！';
});
</script>

<style scoped>
.head-shooter-overlay {
  position: absolute;
  top: -48px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  width: max-content;
  animation: overlayDropIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes overlayDropIn {
  from {
    opacity: 0;
    transform: translate(-50%, -15px) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

/* 准星与枪支后坐力区域 */
.gun-muzzle-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
  transition: transform 0.1s ease-out;
}

.gun-muzzle-wrapper.recoil-active {
  animation: gunRecoil 0.4s ease-out;
}

@keyframes gunRecoil {
  0% { transform: translateY(0) scale(1); }
  25% { transform: translateY(-12px) scale(1.25) rotate(-8deg); }
  60% { transform: translateY(4px) scale(0.95) rotate(2deg); }
  100% { transform: translateY(0) scale(1) rotate(0deg); }
}

.crosshair-target {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.crosshair-ring {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1.5px dashed #f59e0b;
  animation: spinRing 3s infinite linear;
}

@keyframes spinRing {
  100% { transform: rotate(360deg); }
}

.crosshair-target.locked .crosshair-ring {
  border-color: #ef4444;
  animation: pulseLock 0.3s ease-out;
}

@keyframes pulseLock {
  0% { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.gun-silhouette {
  font-size: 26px;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8));
  animation: aimBob 1.2s infinite alternate ease-in-out;
}

@keyframes aimBob {
  from { transform: translateY(0); }
  to { transform: translateY(-3px); }
}

/* 枪火与空枪特效 */
.bang-flame-burst {
  position: absolute;
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
}

.muzzle-flash {
  font-size: 42px;
  animation: flashBurst 0.5s ease-out forwards;
}

@keyframes flashBurst {
  0% { transform: scale(0.4); opacity: 0; filter: brightness(2); }
  35% { transform: scale(1.8); opacity: 1; filter: drop-shadow(0 0 24px #ef4444); }
  100% { transform: scale(2.4); opacity: 0; filter: blur(4px); }
}

.sparks {
  position: absolute;
  font-size: 24px;
  animation: sparkScatter 0.6s ease-out forwards;
}

@keyframes sparkScatter {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2) translateY(-20px); opacity: 0; }
}

.click-smoke-drift {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 70;
}

.smoke-puff {
  font-size: 34px;
  animation: smokeRise 0.8s ease-out forwards;
}

@keyframes smokeRise {
  0% { transform: scale(0.6) translateY(0); opacity: 0.9; }
  50% { transform: scale(1.2) translateY(-10px); opacity: 0.6; filter: drop-shadow(0 0 8px #10b981); }
  100% { transform: scale(1.8) translateY(-24px); opacity: 0; }
}

/* 状态看板胶囊 */
.shoot-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(15, 17, 26, 0.96);
  border: 1.5px solid #f59e0b;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.9), 0 0 12px rgba(245, 158, 11, 0.5);
  border-radius: 12px;
  padding: 5px 12px;
  backdrop-filter: blur(10px);
  transition: all 0.3s;
}

.shoot-pill.pill-bang {
  border-color: #ef4444;
  box-shadow: 0 0 25px rgba(239, 68, 68, 0.8);
  background: rgba(69, 10, 10, 0.96);
  animation: headShake 0.45s ease-in-out;
}

@keyframes headShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px) rotate(-3deg); }
  40% { transform: translateX(6px) rotate(3deg); }
  60% { transform: translateX(-4px) rotate(-2deg); }
  80% { transform: translateX(4px) rotate(2deg); }
}

.shoot-pill.pill-alive {
  border-color: #10b981;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.7);
  background: rgba(6, 44, 34, 0.96);
}

.pill-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 900;
  color: #fbbf24;
  white-space: nowrap;
}

.shoot-pill.pill-bang .pill-title {
  color: #fca5a5;
}

.shoot-pill.pill-alive .pill-title {
  color: #6ee7b7;
}

.pulse-icon {
  animation: pulseAmber 0.8s infinite alternate;
}

@keyframes pulseAmber {
  from { transform: scale(1); filter: brightness(1); }
  to { transform: scale(1.3); filter: brightness(1.4); }
}

/* 8孔左轮弹膛指示 */
.mini-cylinder-housing {
  display: flex;
  gap: 3px;
  align-items: center;
  padding: 2px 4px;
  background: #090a0f;
  border-radius: 8px;
  border: 1px solid #1e293b;
}

.mini-cylinder-housing.spinning {
  animation: cylinderChamberSpin 0.3s infinite linear;
}

@keyframes cylinderChamberSpin {
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.mini-chamber {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #141724;
  border: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.mini-chamber.chamber-loaded {
  background: radial-gradient(circle, #f59e0b 30%, #78350f 100%);
  border-color: #fbbf24;
  box-shadow: 0 0 4px rgba(245, 158, 11, 0.8);
}

.mini-primer {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #fef08a;
}

.mini-chamber.chamber-fired {
  background: radial-gradient(circle, #ff0000 30%, #991b1b 100%);
  border-color: #fca5a5;
  box-shadow: 0 0 8px #ef4444;
  transform: scale(1.25);
}

.mini-chamber.chamber-empty {
  background: #064e3b;
  border-color: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.mini-chamber.chamber-fired-past {
  background: #1e293b;
  border-color: #334155;
  opacity: 0.45;
}

.mini-chamber.chamber-danger {
  background: radial-gradient(circle, #ef4444 30%, #7f1d1d 100%);
  border-color: #fca5a5;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.9);
  animation: chamberPulse 0.6s infinite alternate;
}

@keyframes chamberPulse {
  from { transform: scale(1); }
  to { transform: scale(1.25); }
}

.mini-chamber.chamber-upcoming {
  background: #0f172a;
  border-color: #334155;
}

@media (max-height: 560px), (max-width: 900px) {
  .head-shooter-overlay {
    top: -24px;
    transform: translateX(-50%) scale(0.85);
  }
}
</style>
