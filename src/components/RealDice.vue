<template>
  <div
    class="real-die-wrap"
    :class="[
      `size-${size}`,
      {
        'is-hidden': isHidden,
        'is-highlight': highlight,
        'is-wild': wild,
        'is-dimmed': dimmed
      }
    ]"
  >
    <!-- 暗骰背面/隐藏状态 -->
    <div v-if="isHidden" class="die-face die-back">
      <span class="back-pattern">❓</span>
    </div>

    <!-- 真实 1 ~ 6 点实体点数 -->
    <div v-else class="die-face" :class="`val-${numericValue}`">
      <span
        v-for="idx in 9"
        :key="idx"
        class="pip"
        :class="[
          `pip-${idx}`,
          { active: isPipActive(numericValue, idx), 'is-one': numericValue === 1 }
        ]"
      ></span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: {
    type: [Number, String, Object],
    default: 1
  },
  size: {
    type: String,
    default: 'medium' // 'tiny' (14px 变小一半), 'mini' (22px), 'small' (28px), 'medium' (38px), 'large' (46px)
  },
  highlight: {
    type: Boolean,
    default: false
  },
  wild: {
    type: Boolean,
    default: false
  },
  dimmed: {
    type: Boolean,
    default: false
  }
});

const isHidden = computed(() => {
  if (props.value === null || props.value === undefined) return true;
  if (typeof props.value === 'object' && props.value.hidden) return true;
  if (props.value === '?' || props.value === '❓') return true;
  return false;
});

const numericValue = computed(() => {
  if (isHidden.value) return 1;
  const num = Number(props.value);
  if (num >= 1 && num <= 6) return num;
  return 1;
});

/**
 * 3x3 矩阵位置 (1..9):
 * 1 2 3
 * 4 5 6
 * 7 8 9
 */
function isPipActive(val, pipIdx) {
  switch (val) {
    case 1:
      return pipIdx === 5;
    case 2:
      return pipIdx === 1 || pipIdx === 9;
    case 3:
      return pipIdx === 1 || pipIdx === 5 || pipIdx === 9;
    case 4:
      return pipIdx === 1 || pipIdx === 3 || pipIdx === 7 || pipIdx === 9;
    case 5:
      return pipIdx === 1 || pipIdx === 3 || pipIdx === 5 || pipIdx === 7 || pipIdx === 9;
    case 6:
      return pipIdx === 1 || pipIdx === 4 || pipIdx === 7 || pipIdx === 3 || pipIdx === 6 || pipIdx === 9;
    default:
      return false;
  }
}
</script>

<style scoped>
.real-die-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 尺寸规格 */
.size-tiny {
  width: 14px;
  height: 14px;
}

.size-mini {
  width: 22px;
  height: 22px;
}

.size-small {
  width: 28px;
  height: 28px;
}

.size-medium {
  width: 38px;
  height: 38px;
}

.size-large {
  width: 48px;
  height: 48px;
}

/* 实体骰子外壳 (骨白仿象牙微斜角质感) */
.die-face {
  width: 100%;
  height: 100%;
  border-radius: 20%;
  background: radial-gradient(circle at 35% 30%, #ffffff 0%, #f6f1e8 65%, #e5d9c7 100%);
  border: 1px solid #d4c4af;
  box-shadow: 
    1px 2px 4px rgba(0, 0, 0, 0.45),
    inset 1px 1px 1.5px rgba(255, 255, 255, 0.95),
    inset -1px -1.5px 2px rgba(120, 80, 40, 0.25);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  padding: 12%;
  box-sizing: border-box;
  place-items: center;
  position: relative;
}

/* 暗骰背面 */
.die-back {
  background: radial-gradient(circle at 35% 30%, #4a2810 0%, #2b1405 80%, #150901 100%);
  border-color: #78350f;
  box-shadow: 
    1px 2px 4px rgba(0, 0, 0, 0.6),
    inset 1px 1px 1.5px rgba(245, 158, 11, 0.3),
    inset -1px -1px 2px rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.back-pattern {
  font-size: 14px;
  color: #fbbf24;
  opacity: 0.75;
}

.size-tiny .back-pattern { font-size: 8px; }
.size-mini .back-pattern { font-size: 10px; }
.size-small .back-pattern { font-size: 12px; }
.size-large .back-pattern { font-size: 18px; }

/* 骰目点数 (Pips) */
.pip {
  width: 70%;
  height: 70%;
  border-radius: 50%;
  background: transparent;
  transition: all 0.2s;
}

.pip.active {
  background: #1e293b;
  box-shadow: 
    inset 0 1px 1.5px rgba(0, 0, 0, 0.8),
    0 0.5px 0.5px rgba(255, 255, 255, 0.6);
}

/* 1点经典大红心 */
.pip.active.is-one {
  background: #dc2626;
  transform: scale(1.4);
  box-shadow: 
    inset 0 1.5px 2px rgba(0, 0, 0, 0.7),
    0 0.5px 0.5px rgba(255, 255, 255, 0.5);
}

/* 4点中国经典骰子微红 (若为4点则微偏朱红) */
.val-4 .pip.active {
  background: #991b1b;
}

/* 状态高亮动效 */
.is-highlight .die-face {
  border-color: #f59e0b;
  box-shadow: 
    0 0 12px rgba(245, 158, 11, 0.8),
    1px 2px 4px rgba(0, 0, 0, 0.4),
    inset 1px 1px 2px rgba(255, 255, 255, 1);
  transform: scale(1.12);
  z-index: 2;
}

.is-wild .die-face {
  border-color: #10b981;
  box-shadow: 
    0 0 12px rgba(16, 185, 129, 0.8),
    1px 2px 4px rgba(0, 0, 0, 0.4),
    inset 1px 1px 2px rgba(255, 255, 255, 1);
  transform: scale(1.08);
  z-index: 2;
}

.is-dimmed {
  opacity: 0.28;
  filter: grayscale(80%);
}
</style>
