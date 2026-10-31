<template>
  <div v-if="visible" class="guide-mask" @click.self="$emit('close')">
    <div class="guide-modal dice-theme">
      <!-- 弹窗顶栏 -->
      <div class="guide-header">
        <div class="title-wrap">
          <span class="icon">🎲</span>
          <h2 class="title">骗子骰子 · 吹牛模式官方规则</h2>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="rules-scroll-area">
        <!-- 规则卡片 1 -->
        <div class="dice-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 摇盅窥骰——每位玩家每轮开局各自摇下 5 颗暗骰扣在专属骰盅内。<br>
            只有你自己能偷看点数，对其余所有人绝对保密。
          </p>
        </div>

        <!-- 规则卡片 2 -->
        <div class="dice-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 加码叫点——全员按逆时针轮流报数，预测全场存活玩家同点骰子总和。<br>
            后一位玩家叫点必须递增：要么增加骰子数量，要么在同数量下报更高点数。
          </p>
        </div>

        <!-- 规则卡片 3 -->
        <div class="dice-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> ⚀ 1点万能——在默认规则下，1 点为全能赖子（Wildcard），<br>
            开盅验骰时全场所有的 1 点自动计入目标点数。（可选开启“叫1锁1”规则）。
          </p>
        </div>

        <!-- 规则卡片 4 -->
        <div class="dice-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 质疑开盅——怀疑上家报数虚高时，大喊 Liar 掀开所有骰盅！<br>
            若全场实际点数 ≥ 叫点数，质疑者输；若实际点数 &lt; 叫点数，吹牛者输。
          </p>
        </div>

        <!-- 规则卡片 5 -->
        <div class="dice-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 致命毒药——败者必须当场饮下 1 瓶致命毒药。<br>
            每人仅有 2 瓶毒药容错，喝满 2 瓶暴毙出局！活到最后者赢得骰王桂冠！
          </p>
        </div>

        <!-- 机制说明卡片 -->
        <div class="dice-detail-card">
          <div class="comp-title">📜 游戏机制与房主可选参数</div>
          <div class="comp-grid">
            <div class="comp-item">
              <span class="badge poison">🧪 毒药惩罚</span> 
              <span>默认模式：每人 2 瓶毒药，喝完 2 瓶暴毙淘汰，还原官方经典！</span>
            </div>
            <div class="comp-item">
              <span class="badge gun">🔫 轮盘惩罚</span> 
              <span>可选切换：6 孔递进俄罗斯轮盘赌，败者对自己扣动扳机！</span>
            </div>
            <div class="comp-item">
              <span class="badge wild">⚀ 1点万能</span> 
              <span>默认开启：全场 1 点皆可充当任意点数；开房可选“叫1锁1破百搭”。</span>
            </div>
            <div class="comp-item">
              <span class="badge spot">🎯 精确命中</span> 
              <span>可选机制：断定实际数量完全刚好！成功则全场受罚，失败自己受罚。</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
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
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9);
  position: relative;
}

.dice-theme {
  background: #15181f;
  background-image: 
    radial-gradient(circle at 50% 10%, rgba(217, 119, 6, 0.15) 0%, transparent 60%),
    repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.25) 0px, rgba(0, 0, 0, 0.25) 12px, transparent 12px, transparent 24px);
  border: 2px solid #78350f;
}

.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: rgba(15, 17, 23, 0.95);
  border-bottom: 2px solid #451a03;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-wrap .icon {
  font-size: 20px;
}

.title-wrap .title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #fbbf24;
  letter-spacing: 0.5px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.rules-scroll-area {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dice-rule-card {
  background: #1a1e28;
  border: 1.5px solid #332014;
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.rule-text {
  margin: 0;
  color: #f1e5d8;
  font-size: 13.5px;
  line-height: 1.6;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.flower-icon {
  color: #d97706;
  font-size: 14px;
  margin-right: 4px;
  display: inline-block;
}

.dice-detail-card {
  background: rgba(18, 20, 28, 0.9);
  border: 1px solid #451a03;
  border-radius: 10px;
  padding: 12px 14px;
  margin-top: 4px;
}

.comp-title {
  font-size: 13px;
  font-weight: 800;
  color: #fbbf24;
  margin-bottom: 10px;
}

.comp-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(0, 0, 0, 0.35);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #2d1808;
}

.badge {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.badge.poison {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge.gun {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.badge.wild {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.badge.spot {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.4);
}
</style>
