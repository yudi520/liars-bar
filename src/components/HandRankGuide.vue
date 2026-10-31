<template>
  <div v-if="visible" class="guide-mask" @click.self="$emit('close')">
    <div class="guide-modal">
      <div class="guide-header">
        <div class="title-wrap">
          <span class="icon">📜</span>
          <h2 class="title">德州扑克牌型官方规则</h2>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="guide-notice">
        <span>💡 牌型由 2 张私密手牌 + 5 张公共牌中挑选组合出<strong>最大 5 张牌</strong>进行胜负比对。</span>
      </div>

      <div class="guide-list">
        <div
          v-for="item in HAND_RANK_LIST"
          :key="item.rank"
          class="rank-row"
          :class="{ top3: item.rank >= 8 }"
        >
          <!-- 牌型卡牌展示样例 -->
          <div class="cards-preview">
            <div
              v-for="(card, cIdx) in item.sample"
              :key="cIdx"
              class="mini-card"
              :style="{ color: card.color }"
            >
              <span class="c-val">{{ card.label }}</span>
              <span class="c-suit">{{ card.suit }}</span>
            </div>
          </div>

          <!-- 牌型中英文说明 -->
          <div class="rank-info">
            <div class="rank-title-line">
              <span class="rank-en">{{ item.en }}</span>
              <span class="rank-order">{{ item.order }}</span>
            </div>
            <div class="rank-zh">{{ item.name }}</div>
            <div class="rank-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { HAND_RANK_LIST } from '../utils/pokerConstants';

defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

defineEmits(['close']);
</script>

<style scoped>
.guide-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.guide-modal {
  width: 100%;
  max-width: 580px;
  max-height: 85vh;
  background: #181920;
  border: 1px solid #334155;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: #111217;
  border-bottom: 1px solid #262933;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-wrap .icon {
  font-size: 20px;
}

.title {
  font-size: 17px;
  font-weight: 700;
  color: #fbbf24;
}

.close-btn {
  background: #2a2e3d;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.guide-notice {
  background: rgba(245, 158, 11, 0.1);
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  padding: 10px 18px;
  font-size: 12px;
  color: #fde68a;
}

.guide-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #20222b;
  border: 1px solid #2e3344;
  border-radius: 10px;
  padding: 8px 12px;
}

.rank-row.top3 {
  background: linear-gradient(90deg, #2a241b 0%, #20222b 100%);
  border-color: #d97706;
}

.cards-preview {
  display: flex;
  gap: 4px;
}

.mini-card {
  width: 28px;
  height: 40px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.c-val {
  font-size: 11px;
  line-height: 1;
}

.c-suit {
  font-size: 12px;
  line-height: 1;
}

.rank-info {
  flex: 1;
  min-width: 0;
}

.rank-title-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rank-en {
  font-size: 13px;
  font-weight: 800;
  color: #f1f5f9;
  letter-spacing: 0.5px;
}

.rank-order {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
}

.rank-zh {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
  margin-top: 2px;
}

.rank-desc {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}
</style>
