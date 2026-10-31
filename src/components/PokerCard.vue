<template>
  <div
    class="real-poker-card"
    :class="[
      `card-${size}`,
      {
        'is-back': faceDown || card?.hidden,
        'is-red': isRed,
        'is-black': !isRed,
        'is-selected': selected,
        'is-devil': card?.type === 'DEVIL',
        'is-joker': card?.type === 'JOKER'
      }
    ]"
  >
    <!-- 卡牌背面 (精致美式经典菱形交织花纹牌背) -->
    <template v-if="faceDown || card?.hidden">
      <div class="card-back-pattern">
        <div class="inner-border">
          <div class="crosshatch-grid"></div>
          <div class="center-medallion">
            <span class="skull-spade">♠</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 卡牌正面 (符合国际标准扑克版式) -->
    <template v-else-if="card">
      <!-- 恶魔牌 DEVIL (仅保留恶魔图样，去除恶魔牌字眼) -->
      <div v-if="card.type === 'DEVIL'" class="special-card-wrap">
        <div class="corner-index top-left">
          <span class="corner-suit devil-corner-icon">😈</span>
        </div>
        <div class="card-center">
          <div class="center-special">
            <span class="special-icon devil-huge-icon">😈</span>
          </div>
        </div>
        <div class="corner-index bottom-right">
          <span class="corner-suit devil-corner-icon">😈</span>
        </div>
      </div>

      <!-- 百搭牌 JOKER (去除百搭字样，直接 JOKER 牌) -->
      <div v-else-if="card.type === 'JOKER'" class="special-card-wrap">
        <div class="corner-index top-left">
          <span class="corner-val joker-txt">JOKER</span>
          <span class="corner-suit">🃏</span>
        </div>
        <div class="card-center">
          <div class="center-special">
            <span class="special-icon joker-huge-icon">🃏</span>
          </div>
        </div>
        <div class="corner-index bottom-right">
          <span class="corner-val joker-txt">JOKER</span>
          <span class="corner-suit">🃏</span>
        </div>
      </div>

      <!-- 常规扑克牌 (Q, K, A) -->
      <template v-else>
        <!-- 左上角标 -->
        <div class="corner-index top-left">
          <span class="corner-val">{{ card.label }}</span>
          <span class="corner-suit">{{ card.suitSymbol }}</span>
        </div>

        <!-- 中心牌面主体内容 -->
        <div class="card-center">
          <div class="center-pip">
            <span class="pip-suit">{{ card.suitSymbol }}</span>
          </div>
        </div>

        <!-- 右下角倒置角标 (翻转 180 度) -->
        <div class="corner-index bottom-right">
          <span class="corner-val">{{ card.label }}</span>
          <span class="corner-suit">{{ card.suitSymbol }}</span>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  card: {
    type: Object,
    default: null
  },
  faceDown: {
    type: Boolean,
    default: false
  },
  size: {
    type: String,
    default: 'md' // 'sm', 'md', 'lg', 'xl'
  },
  selected: {
    type: Boolean,
    default: false
  }
});

const isRed = computed(() => {
  if (!props.card) return false;
  return props.card.suit === 'hearts' || props.card.suit === 'diamonds' || props.card.color === '#e11d48' || props.card.color === '#ea580c';
});
</script>

<style scoped>
.real-poker-card {
  position: relative;
  background: #fdfdfd;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
  border: 1px solid #d1d5db;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px;
  user-select: none;
  transition: transform 0.2s, box-shadow 0.2s;
  overflow: hidden;
  flex-shrink: 0;
}

.real-poker-card.is-red {
  color: #dc2626;
}

.real-poker-card.is-black {
  color: #111827;
}

.real-poker-card.is-selected {
  border-color: #fbbf24;
  box-shadow: 0 0 16px rgba(251, 191, 36, 0.8), 0 6px 20px rgba(0, 0, 0, 0.5);
  transform: translateY(-8px);
}

/* 恶魔牌 DEVIL CARD 专属样式 */
.real-poker-card.is-devil {
  background: linear-gradient(135deg, #2b0404 0%, #170101 100%);
  border: 2px solid #ef4444;
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.6), 0 4px 14px rgba(0, 0, 0, 0.6);
  color: #fca5a5;
}
.real-poker-card.is-devil.is-selected {
  border-color: #f87171;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.9), 0 8px 24px rgba(0, 0, 0, 0.7);
  transform: translateY(-10px);
}
.devil-txt {
  font-size: 8px !important;
  font-weight: 900 !important;
  color: #ef4444;
  letter-spacing: 0.5px;
}
.card-md .devil-txt { font-size: 9px !important; }
.card-lg .devil-txt { font-size: 11px !important; }
.devil-tag {
  background: #7f1d1d;
  color: #fecaca;
  border: 1px solid #dc2626;
}

/* 百搭牌 JOKER 专属样式 */
.real-poker-card.is-joker {
  background: linear-gradient(135deg, #2e1065 0%, #0f172a 100%);
  border: 2px solid #a855f7;
  box-shadow: 0 0 14px rgba(168, 85, 247, 0.6), 0 4px 14px rgba(0, 0, 0, 0.6);
  color: #d8b4fe;
}
.real-poker-card.is-joker.is-selected {
  border-color: #c084fc;
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.9), 0 8px 24px rgba(0, 0, 0, 0.7);
  transform: translateY(-10px);
}
.joker-txt {
  font-size: 8px !important;
  font-weight: 900 !important;
  color: #c084fc;
  letter-spacing: 0.5px;
}
.card-md .joker-txt { font-size: 9px !important; }
.card-lg .joker-txt { font-size: 11px !important; }
.joker-tag {
  background: #581c87;
  color: #f3e8ff;
  border: 1px solid #9333ea;
}

/* 特殊卡片内部排版 */
.special-card-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px;
}
.center-special {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.special-icon {
  font-size: 24px;
  line-height: 1;
}
.card-sm .special-icon { font-size: 16px; }
.card-md .special-icon { font-size: 26px; }
.card-lg .special-icon { font-size: 36px; }
.special-tag {
  font-size: 9px;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: 4px;
  line-height: 1.2;
}
.card-xs .special-icon { font-size: 13px; }
.card-xs .special-tag { font-size: 7px; }
.card-xs .devil-corner-icon { font-size: 8px; }
.card-xs .devil-huge-icon { font-size: 16px !important; }
.card-xs .joker-huge-icon { font-size: 15px !important; }
.card-xs .joker-txt { font-size: 6px !important; }
.card-sm .special-tag { font-size: 8px; }
.card-lg .special-tag { font-size: 11px; }

.devil-corner-icon {
  font-size: 14px;
}
.card-sm .devil-corner-icon { font-size: 11px; }
.card-md .devil-corner-icon { font-size: 15px; }
.card-lg .devil-corner-icon { font-size: 20px; }

.devil-huge-icon {
  font-size: 34px !important;
  filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.8));
}
.card-sm .devil-huge-icon { font-size: 22px !important; }
.card-md .devil-huge-icon { font-size: 36px !important; }
.card-lg .devil-huge-icon { font-size: 50px !important; }

.joker-huge-icon {
  font-size: 30px !important;
  filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.8));
}
.card-sm .joker-huge-icon { font-size: 20px !important; }
.card-md .joker-huge-icon { font-size: 32px !important; }
.card-lg .joker-huge-icon { font-size: 46px !important; }

/* 尺寸体系 (国际扑克标准长宽比约为 1 : 1.42) */
.card-xs {
  width: 28px;
  height: 40px;
  border-radius: 4px;
  padding: 2px;
}
.card-xs .corner-val {
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
}
.card-xs .corner-suit {
  font-size: 7.5px;
  line-height: 1;
}
.card-xs .center-watermark {
  font-size: 12px;
}
.card-xs .pip-suit {
  font-size: 11px;
}

.card-sm {
  width: 44px;
  height: 64px;
  border-radius: 5px;
  padding: 3px;
}
.card-md {
  width: 66px;
  height: 94px;
  border-radius: 8px;
  padding: 4px;
}
.card-lg {
  width: 88px;
  height: 125px;
  border-radius: 10px;
  padding: 6px;
}
.card-xl {
  width: 124px;
  height: 176px;
  border-radius: 14px;
  padding: 8px;
}

/* 牌桌公共牌专用响应式尺寸 */
.card-felt {
  width: 82px;
  height: 116px;
  border-radius: 9px;
  padding: 5px;
}

@media (max-height: 540px), (max-width: 900px) {
  .card-felt {
    width: 34px;
    height: 48px;
    border-radius: 5px;
    padding: 2px;
  }
  .card-felt .corner-val {
    font-size: 10px;
    font-weight: 800;
  }
  .card-felt .corner-suit {
    font-size: 8px;
  }
  .card-felt .center-watermark {
    font-size: 13px;
  }
  .card-felt .pip-suit {
    font-size: 14px;
  }
  .card-felt .center-medallion {
    width: 14px;
    height: 14px;
  }
  .card-felt .skull-spade {
    font-size: 8px;
  }
}

/* 真实角标 */
.corner-index {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.card-sm .corner-val { font-size: 11.5px; font-weight: 900; line-height: 1; }
.card-sm .corner-suit { font-size: 9.5px; margin-top: 0.5px; line-height: 1; }

.card-md .corner-val { font-size: 17px; font-weight: 900; }
.card-md .corner-suit { font-size: 14px; margin-top: 1px; }

.card-lg .corner-val { font-size: 22px; font-weight: 900; }
.card-lg .corner-suit { font-size: 18px; margin-top: 2px; }

.card-xl .corner-val { font-size: 32px; font-weight: 900; }
.card-xl .corner-suit { font-size: 26px; margin-top: 2px; }

.corner-index.top-left {
  align-self: flex-start;
}

.corner-index.bottom-right {
  align-self: flex-end;
  transform: rotate(180deg);
  transform-origin: center center;
}

/* 中心主体展示 */
.card-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/* Ace 大花色 */
.center-ace .huge-suit {
  font-size: 40px;
  line-height: 1;
}
.card-sm .center-ace .huge-suit { font-size: 24px; }
.card-md .center-ace .huge-suit { font-size: 38px; }
.card-lg .center-ace .huge-suit { font-size: 52px; }
.card-xl .center-ace .huge-suit { font-size: 74px; }

/* 宫廷人头牌 */
.center-court {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.card-sm .court-crown { font-size: 16px; }
.card-md .court-crown { font-size: 24px; }
.card-lg .court-crown { font-size: 32px; }
.card-xl .court-crown { font-size: 46px; }

.court-symbol {
  font-size: 18px;
  line-height: 1;
}
.card-sm .court-symbol { font-size: 12px; }
.card-md .court-symbol { font-size: 18px; }
.card-lg .court-symbol { font-size: 24px; }
.card-xl .court-symbol { font-size: 34px; }

.court-label {
  display: none;
}

/* 数字牌主体 */
.pip-suit {
  font-size: 28px;
  line-height: 1;
}
.card-sm .pip-suit { font-size: 18px; }
.card-md .pip-suit { font-size: 28px; }
.card-lg .pip-suit { font-size: 40px; }
.card-xl .pip-suit { font-size: 58px; }

/* 经典经典花纹牌背 */
.card-back-pattern {
  position: absolute;
  inset: 3px;
  background: #7f1d1d;
  border-radius: 6px;
  border: 2px solid #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.inner-border {
  width: 90%;
  height: 90%;
  border: 1px solid #fecaca;
  border-radius: 4px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.12) 0, rgba(255, 255, 255, 0.12) 2px, transparent 0, transparent 8px),
    repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.12) 0, rgba(255, 255, 255, 0.12) 2px, transparent 0, transparent 8px);
}

.center-medallion {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #991b1b;
  border: 1px solid #fecaca;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
}
.card-lg .center-medallion { width: 34px; height: 34px; }
.card-xl .center-medallion { width: 48px; height: 48px; }

.skull-spade {
  color: #fef08a;
  font-size: 13px;
}
.card-lg .skull-spade { font-size: 18px; }
.card-xl .skull-spade { font-size: 26px; }
</style>
