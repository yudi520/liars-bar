<template>
  <div v-if="visible" class="guide-mask" @click.self="$emit('close')">
    <div class="guide-modal devil-theme">
      <!-- 弹窗顶栏 -->
      <div class="guide-header">
        <div class="title-wrap">
          <span class="icon">😈</span>
          <h2 class="title">骗子纸牌 · 恶魔模式官方规则</h2>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="rules-scroll-area">
        <!-- 规则卡片 1 -->
        <div class="devil-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 高风险玩法——每一回合都可能是你的最后一回合，<br>
            而 Devil 卡会让局势更加致命。
          </p>
        </div>

        <!-- 规则卡片 2 -->
        <div class="devil-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 谨慎行动。牌堆中只有一张 Devil 卡，错误地质疑对手可能酿成灾难。
          </p>
        </div>

        <!-- 规则卡片 3 (核心规则) -->
        <div class="devil-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 如果有人质疑恶魔牌，是出恶魔牌的玩家免受惩罚，<br>
            在座其余所有玩家都必须进行一次俄罗斯轮盘。看看谁能活下来。
          </p>
        </div>

        <!-- 规则卡片 4 -->
        <div class="devil-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> Devil's Deal 会翻开最近打出的四张牌。<br>
            只有当四张牌全都是谎报时，效果才会生效。
          </p>
        </div>

        <!-- 规则卡片 5 -->
        <div class="devil-rule-card">
          <p class="rule-text">
            <span class="flower-icon">✿</span> 活到最后，赢得胜利。一张牌就可能改变整场游戏。你敢冒这个险吗？
          </p>
        </div>

        <!-- 纸牌构成说明 -->
        <div class="card-composition-card">
          <div class="comp-title">🃏 牌堆构成与细节说明</div>
          <div class="comp-grid">
            <div class="comp-item"><span class="badge">6张</span> 👑 Queen (Q) 王后</div>
            <div class="comp-item"><span class="badge">6张</span> 👑 King (K) 国王</div>
            <div class="comp-item"><span class="badge">6张</span> 👑 Ace (A) 王牌</div>
            <div class="comp-item"><span class="badge joker">2张</span> 🃏 Joker 百搭牌</div>
            <div class="comp-item"><span class="badge devil">1张</span> 😈 Devil 恶魔牌</div>
          </div>
          <div class="comp-tip">
            💡 <strong>出牌规则：</strong>每回合可打出 1~3 张暗牌并声称符合目标牌。<br>
            ⚠️ <strong>关键限制：</strong>恶魔牌只能单张打出，绝不能与其它牌打包组合！<br>
            📜 <strong>Devil's Deal（恶魔契约）：</strong>房主开房可选机制，台面累计≥4张牌时可发起契约。若4张全为谎言则除发起者外全员轮盘赌，若含任意真牌则发起者自己受罚。
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
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(6px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.guide-modal {
  width: 100%;
  max-width: 640px;
  max-height: 92vh;
  background-color: #28070a;
  background-image: 
    linear-gradient(45deg, #1b0406 25%, transparent 25%), 
    linear-gradient(-45deg, #1b0406 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #1b0406 75%), 
    linear-gradient(-45deg, transparent 75%, #1b0406 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
  border: 2px solid #5a1017;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.95), 0 0 30px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f1e5d8;
}

.guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #1b0406;
  border-bottom: 2px solid #4a0d13;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-wrap .icon {
  font-size: 22px;
}

.title-wrap .title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #fef2f2;
  letter-spacing: 0.5px;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #fca5a5;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ffffff;
}

.rules-scroll-area {
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 官方原汁原味恶魔规则横幅卡片 */
.devil-rule-card {
  background: #110305;
  background-image: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.02) 0px,
    rgba(255, 255, 255, 0.02) 1px,
    transparent 1px,
    transparent 2px
  );
  border: 2px solid #050102;
  box-shadow: inset 0 0 0 1px #450f14, 0 3px 10px rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  padding: 14px 18px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.flower-icon {
  color: #df8b64;
  font-size: 14px;
  margin-right: 4px;
  display: inline-block;
  vertical-align: middle;
}

.rule-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: #f1e5d8;
  font-weight: 500;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

.card-composition-card {
  margin-top: 6px;
  background: #120306;
  border: 1px solid #3d0c11;
  border-radius: 8px;
  padding: 14px 16px;
}

.comp-title {
  font-size: 13px;
  font-weight: 800;
  color: #fef08a;
  margin-bottom: 10px;
}

.comp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.comp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #f1f5f9;
  background: rgba(0, 0, 0, 0.45);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #29080c;
}

.badge {
  background: #475569;
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}

.badge.joker {
  background: #9333ea;
}

.badge.devil {
  background: #dc2626;
}

.comp-tip {
  font-size: 11.5px;
  color: #cbd5e1;
  line-height: 1.65;
  border-top: 1px dashed #4a0d13;
  padding-top: 10px;
}
</style>
