<template>
  <div class="host-stage">
    <!-- 顶部状态栏与局域网二维码入口 -->
    <header class="host-header">
      <div class="brand-zone">
        <span class="logo">🍻</span>
        <div class="title-wrap">
          <h2>骗子酒馆 · 德州扑克大屏</h2>
          <span class="sub-mode">Texas Hold'em · 子弹生死局 (当前第 {{ state.handNumber || 0 }} 手)</span>
        </div>
      </div>

      <div class="header-actions">
        <!-- 扫码加入药丸胶囊 -->
        <div class="lan-pill" @click="showQrModal = true">
          <span class="dot"></span>
          <span class="ip-txt">📱 扫码入座: {{ serverInfo?.lanUrl || '获取中...' }}</span>
          <span class="qr-icon">🔍</span>
        </div>

        <button class="icon-tool-btn" title="查看规则" @click="showRules = true">
          📜 规则
        </button>

        <button class="icon-tool-btn" title="房间设置" @click="showSettings = true">
          ⚙️ 规则设置
        </button>

        <!-- 房主取消/解散房间按钮 -->
        <button class="cancel-room-btn" title="随时解散/取消房间" @click="$emit('cancel-room')">
          🚫 取消房间
        </button>
      </div>
    </header>

    <!-- 牌桌主体核心区 -->
    <main class="table-container">
      <div class="poker-table">
        <!-- 桌心公共牌展示区 -->
        <div class="community-zone">
          <div class="comm-title">
            <span>🎴 公共牌 (已翻开 {{ state.communityRevealedCount }} / 5 张)</span>
            <span class="rule-hint">第2颗翻3张，之后每加1颗翻1张</span>
          </div>

          <div class="cards-felt">
            <PokerCard
              v-for="(card, idx) in state.communityCards"
              :key="idx"
              :card="card"
              size="lg"
              :face-down="card.hidden"
            />
          </div>


        </div>

        <!-- 围绕牌桌就坐的玩家席位 -->
        <div class="seats-ring">
          <div
            v-for="(player, idx) in state.players"
            :key="player.id"
            class="seat-card"
            :class="{
              'is-turn': state.currentTurnPlayerId === player.id,
              'is-dead': !player.isAlive,
              'is-allin': player.isAllIn
            }"
          >
            <!-- 席位头部 -->
            <div class="seat-top">
              <div class="avatar-box">
                <span class="avatar">{{ player.avatar }}</span>
                <span v-if="player.isHost" class="host-crown">👑</span>
                <span v-if="player.isBot" class="bot-badge">AI</span>
              </div>
              <div class="seat-user">
                <div class="uname">
                  {{ player.name }}
                  <span v-if="player.isBot && player.personality" class="bot-style-tag">[{{ player.personality }}]</span>
                </div>
                <div class="status-tag" :class="getStatusClass(player)">
                  {{ getStatusText(player) }}
                </div>
              </div>
            </div>

            <!-- 玩家手牌 (暗牌或已公开) -->
            <div class="player-cards">
              <PokerCard
                v-for="(card, cIdx) in (player.cards || [])"
                :key="cIdx"
                :card="card"
                size="sm"
                :face-down="card.hidden"
              />
            </div>

            <!-- 玩家下注子弹计数条 -->
            <div class="bullet-bar">
              <span class="lbl">已押子弹:</span>
              <div class="bullets-icons">
                <span v-for="b in (player.bulletsBet || 0)" :key="b" class="dot-bullet"></span>
              </div>
              <span class="count-num">({{ player.bulletsBet || 0 }}/8)</span>
            </div>

            <!-- 大厅阶段移除按钮 -->
            <button
              v-if="state.status === 'LOBBY' && !player.isHost"
              class="kick-btn"
              @click="$emit('remove-player', player.id)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部控制栏与战报流水 -->
    <footer class="host-footer">
      <!-- 战报流水 -->
      <div class="log-ticker">
        <span class="log-icon">📢</span>
        <span class="log-text">{{ formatLogText(state.logs && state.logs[0]) }}</span>
      </div>

      <!-- 房主主控制按钮 -->
      <div class="control-actions">
        <template v-if="state.status === 'LOBBY'">
          <button
            class="c-btn bot-btn"
            :disabled="state.players.length >= (state.config.maxPlayers || 4)"
            @click="$emit('add-bot')"
          >
            🤖 邀请电脑 AI
          </button>
          <button
            class="c-btn start-btn"
            :disabled="state.players.length < 2"
            @click="$emit('start-game')"
          >
            🔥 开始生死局 ({{ state.players.length }} 人就绪)
          </button>
        </template>

        <template v-else-if="state.status === 'HAND_SUMMARY'">
          <button class="c-btn next-btn" @click="$emit('start-next-hand')">
            ⏭️ 进入下一手牌
          </button>
        </template>

        <template v-else-if="state.status === 'GAME_OVER'">
          <button class="c-btn reset-btn" @click="$emit('start-game')">
            🔄 重新开局对决
          </button>
        </template>

        <div v-else class="host-gaming-deck">
          <!-- 房主手牌窥视与控制 -->
          <div class="host-hand-preview">
            <div class="host-label">👑 房主手牌:</div>
            <div
              class="host-cards-peek"
              @touchstart.passive="isHostPeeking = true"
              @touchend.passive="isHostPeeking = false"
              @mousedown="isHostPeeking = true"
              @mouseup="isHostPeeking = false"
              @mouseleave="isHostPeeking = false"
            >
              <PokerCard
                v-for="(card, cIdx) in (hostPlayer?.cards || [])"
                :key="cIdx"
                :card="card"
                size="sm"
                :face-down="!isHostPeeking && !hostKeepRevealed && !hostPlayer?.revealedCards"
              />
            </div>
            <div class="host-peek-tools">
              <label class="peek-chk">
                <input type="checkbox" v-model="hostKeepRevealed" />
                <span>亮牌</span>
              </label>
              <button class="peek-pub-btn" @click="$emit('action', 'TOGGLE_REVEAL')">
                {{ hostPlayer?.revealedCards ? '🔒 遮盖' : '👀 公开' }}
              </button>
            </div>
          </div>

          <!-- 房主决策行动按钮 -->
          <div class="host-action-btns">
            <!-- 跟注 -->
            <button
              class="h-act-btn call-btn"
              :class="{ pulse: isHostTurn }"
              :disabled="!canHostAct"
              @click="$emit('action', 'CALL')"
            >
              ➕ 跟注 (+1 弹)
            </button>

            <!-- 弃牌 -->
            <button
              class="h-act-btn fold-btn"
              :disabled="!canHostAct"
              @click="$emit('action', 'FOLD')"
            >
              🏳️ 弃牌 (面对 {{ hostPlayer?.bulletsBet || 1 }} 弹)
            </button>

            <!-- 懦夫弃牌 (仅首轮) -->
            <button
              class="h-spec-btn coward-btn"
              :disabled="!canHostAct || state.roundIndex !== 1 || hostPlayer?.hasUsedCowardFold"
              title="仅需装填 1 颗子弹赌命逃跑"
              @click="$emit('action', 'COWARD_FOLD')"
            >
              🏃 懦夫弃牌 (1弹)
            </button>

            <!-- Switch 换牌 -->
            <button
              v-if="state.config?.enableSwitch"
              class="h-spec-btn switch-btn"
              :disabled="!canHostAct || hostPlayer?.hasUsedSwitch"
              title="置换手牌，本轮无法孤注一掷"
              @click="requestHostSwitchCandidates"
            >
              🔄 换牌
            </button>

            <!-- ALL-IN 孤注一掷 -->
            <button
              class="h-spec-btn allin-btn"
              :disabled="!canHostAct || hostPlayer?.switchedThisTurn"
              title="赌注拉满至8发，5%几率生还"
              @click="$emit('action', 'ALL_IN')"
            >
              🔥 ALL-IN
            </button>
          </div>

          <!-- 状态提示 -->
          <div class="host-turn-status" :class="{ 'is-my-turn': isHostTurn }">
            <span v-if="!hostPlayer?.isAlive">💀 房主已阵亡</span>
            <span v-else-if="!hostPlayer?.inHand">🏳️ 房主已弃牌</span>
            <span v-else-if="isHostTurn">⚡ 轮到房主决策！</span>
            <span v-else>⏳ 等待 <strong>{{ currentTurnName }}</strong> 决策...</span>
          </div>
        </div>
      </div>
    </footer>

    <!-- 二维码大弹窗 -->
    <div v-if="showQrModal" class="qr-modal-mask" @click.self="showQrModal = false">
      <div class="qr-modal-card">
        <div class="modal-h">
          <h3>📱 手机扫码直连酒馆</h3>
          <button class="close-x" @click="showQrModal = false">✕</button>
        </div>
        <p class="modal-tip">局域网玩家连入相同 WiFi / 手机热点即可扫码畅玩：</p>
        <div class="qr-image-wrap">
          <img v-if="serverInfo?.qrCode" :src="serverInfo.qrCode" alt="扫码直连" />
          <div v-else class="qr-placeholder">正在生成直连二维码...</div>
        </div>
        <div class="url-copy-box">
          <code>{{ serverInfo?.lanUrl }}</code>
        </div>
      </div>
    </div>

    <!-- 房主规则设置弹窗 -->
    <div v-if="showSettings" class="settings-mask" @click.self="showSettings = false">
      <div class="settings-card">
        <div class="modal-h">
          <h3>⚙️ 骗子酒馆 · 规则定制</h3>
          <button class="close-x" @click="showSettings = false">✕</button>
        </div>

        <!-- 房间人数上限调节 (2 ~ 4 人) -->
        <div class="config-item">
          <div class="c-info">
            <span class="c-title">房间人数限制 (2 ~ 4 人)</span>
            <span class="c-desc">当前设置：{{ state.config.maxPlayers || 4 }} 人局（最少2人，最多4人）</span>
          </div>
          <div class="num-selector">
            <button
              v-for="n in [2, 3, 4]"
              :key="n"
              class="num-choice-btn"
              :class="{ active: (state.config.maxPlayers || 4) === n }"
              :disabled="state.status !== 'LOBBY'"
              @click="setMaxPlayers(n)"
            >
              {{ n }} 人
            </button>
          </div>
        </div>

        <div class="config-item">
          <div class="c-info">
            <span class="c-title">Switch 换牌机制</span>
            <span class="c-desc">开启后每人每场可换牌 1 次，候选卡牌 4➔3➔2 递减</span>
          </div>
          <label class="switch-toggle">
            <input
              type="checkbox"
              :checked="state.config.enableSwitch"
              :disabled="state.status !== 'LOBBY'"
              @change="toggleSwitchRule"
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="config-item">
          <div class="c-info">
            <span class="c-title">多人 ALL-IN 淘汰机制</span>
            <span class="c-desc">
              {{ state.config.eliminateAllLosers ? '【残酷】淘汰所有比第一名差的失败者' : '【默认】仅淘汰最后一名最弱者' }}
            </span>
          </div>
          <button
            class="rule-toggle-btn"
            :disabled="state.status !== 'LOBBY'"
            @click="toggleEliminateRule"
          >
            {{ state.config.eliminateAllLosers ? '残酷：淘汰所有败者' : '默认：仅淘汰最弱者' }}
          </button>
        </div>

        <div v-if="state.status !== 'LOBBY'" class="settings-warn">
          ⚠️ 游戏进行中无法更改规则，需在开局大厅设置。
        </div>
      </div>
    </div>

    <!-- 房主换牌抽屉 -->
    <SwitchDrawer
      :visible="showHostSwitchDrawer"
      :my-cards="hostPlayer?.cards || []"
      :candidates="hostSwitchCandidates"
      @confirm="onHostSwitchConfirm"
      @cancel="showHostSwitchDrawer = false"
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

function formatLogText(log) {
  if (!log) return '欢迎来到骗子酒馆，请就座准备...';
  return log.replace(/\[\s*(?:GMT\+8|GMT\+08:00|CST|UTC|中国标准时间)?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:GMT\+8|GMT\+08:00|CST|UTC|中国标准时间)?\s*\]/gi, '[$1]');
}

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  serverInfo: {
    type: Object,
    default: null
  },
  myId: {
    type: String,
    default: ''
  }
});

const emit = defineEmits([
  'update-config',
  'add-bot',
  'remove-player',
  'start-game',
  'start-next-hand',
  'cancel-room',
  'action'
]);

function setMaxPlayers(num) {
  emit('update-config', {
    maxPlayers: num
  });
}

const showQrModal = ref(false);
const showRules = ref(false);
const showSettings = ref(false);
const isHostPeeking = ref(false);
const hostKeepRevealed = ref(false);
const showHostSwitchDrawer = ref(false);
const hostSwitchCandidates = ref([]);

const hostPlayer = computed(() => {
  if (!props.state || !props.state.players) return null;
  return props.state.players.find(p => p.id === props.myId || p.isHost);
});

const isHostTurn = computed(() => {
  return props.state.status === 'BETTING' && hostPlayer.value && props.state.currentTurnPlayerId === hostPlayer.value.id;
});

const canHostAct = computed(() => {
  return isHostTurn.value && hostPlayer.value && hostPlayer.value.isAlive && hostPlayer.value.inHand;
});

function requestHostSwitchCandidates() {
  socketService.send('REQUEST_SWITCH_CANDIDATES');
  socketService.on('switch_candidates', (candidates) => {
    hostSwitchCandidates.value = candidates;
    showHostSwitchDrawer.value = true;
  });
}

function onHostSwitchConfirm({ discardIndex, newCard }) {
  showHostSwitchDrawer.value = false;
  emit('action', 'SWITCH', {
    discardCardIndex: discardIndex,
    newCard
  });
}

const totalPotBullets = computed(() => {
  if (!props.state || !props.state.players) return 0;
  return props.state.players.reduce((sum, p) => sum + (p.bulletsBet || 0), 0);
});

const currentTurnName = computed(() => {
  if (!props.state || !props.state.players) return '';
  const p = props.state.players.find(x => x.id === props.state.currentTurnPlayerId);
  return p ? p.name : '';
});

function getStatusText(player) {
  if (!player.isAlive) return '💀 阵亡淘汰';
  if (!player.inHand) return '🏳️ 已弃牌';
  if (player.isAllIn) return '🔥 ALL-IN';
  if (props.state.currentTurnPlayerId === player.id) return '⏳ 正在决策...';
  if (player.hasActedInRound) return '🔒 已跟注';
  return '⌛ 候场中';
}

function getStatusClass(player) {
  if (!player.isAlive) return 'tag-dead';
  if (!player.inHand) return 'tag-folded';
  if (player.isAllIn) return 'tag-allin';
  if (props.state.currentTurnPlayerId === player.id) return 'tag-acting';
  return 'tag-normal';
}

function toggleSwitchRule() {
  emit('update-config', {
    enableSwitch: !props.state.config.enableSwitch
  });
}

function toggleEliminateRule() {
  emit('update-config', {
    eliminateAllLosers: !props.state.config.eliminateAllLosers
  });
}
</script>

<style scoped>
.host-stage {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: #0d0e14;
  overflow: hidden;
}

.host-header {
  height: 64px;
  background: #14161f;
  border-bottom: 1px solid #232736;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-zone .logo {
  font-size: 28px;
}

.brand-zone h2 {
  font-size: 18px;
  font-weight: 800;
  color: #fbbf24;
}

.sub-mode {
  font-size: 11px;
  color: #94a3b8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lan-pill {
  background: #1f2333;
  border: 1px solid #38425e;
  border-radius: 20px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.lan-pill:hover {
  background: #2a3047;
  border-color: #fbbf24;
}

.lan-pill .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.lan-pill .ip-txt {
  font-size: 12px;
  font-weight: 600;
  color: #f8fafc;
}

.icon-tool-btn {
  background: #1f2333;
  border: 1px solid #333d54;
  color: #cbd5e1;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.cancel-room-btn {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid #ef4444;
  color: #fca5a5;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-room-btn:hover {
  background: #ef4444;
  color: #ffffff;
}

.num-selector {
  display: flex;
  gap: 8px;
}

.num-choice-btn {
  background: #252836;
  border: 1px solid #3b4256;
  color: #94a3b8;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.num-choice-btn.active {
  background: #fbbf24;
  border-color: #f59e0b;
  color: #0f172a;
}

/* 牌桌主体 */
.table-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
}

.poker-table {
  width: 100%;
  max-width: 1100px;
  height: 90%;
  max-height: 580px;
  background: radial-gradient(circle, #0e3d2f 20%, #07221a 80%);
  border: 14px solid #332014;
  border-radius: 120px;
  box-shadow: inset 0 0 50px #000, 0 10px 40px rgba(0, 0, 0, 0.8);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 桌心公共牌 */
.community-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 2;
}

.comm-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
  color: #fde68a;
}

.rule-hint {
  font-size: 10px;
  color: #86efac;
  margin-top: 2px;
}

.cards-felt {
  display: flex;
  gap: 12px;
}

.comm-card {
  width: 68px;
  height: 98px;
  border-radius: 8px;
  position: relative;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.5);
  transition: transform 0.3s;
}

.comm-card.flipped {
  transform: translateY(-4px);
}

.card-face {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.card-face .val {
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
}

.card-face .suit {
  font-size: 26px;
  line-height: 1;
  margin-top: 4px;
}

.card-back {
  width: 100%;
  height: 100%;
  background: #831843;
  border: 2px solid #be185d;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fbcfe8;
  font-size: 28px;
}

.pot-bullets-zone {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bullets-pile {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 200px;
}

.brass-bullet {
  width: 8px;
  height: 16px;
  background: linear-gradient(180deg, #fde047 0%, #b45309 100%);
  border-radius: 4px 4px 1px 1px;
  border: 1px solid #78350f;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

.pot-label {
  font-size: 13px;
  color: #fef08a;
  margin-top: 6px;
}

/* 环形席位 */
.seats-ring {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.seat-card {
  position: absolute;
  pointer-events: auto;
  width: 170px;
  background: #171821;
  border: 2px solid #2e3447;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
  transition: all 0.2s;
}

.seat-card.is-turn {
  border-color: #fbbf24;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.6);
  transform: scale(1.05);
}

.seat-card.is-dead {
  opacity: 0.45;
  filter: grayscale(80%);
}

.seat-card.is-allin {
  border-color: #ef4444;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
}

/* 席位定位 (经典 4 人酒馆赌桌：上、右、下、左) */
.seat-card:nth-child(1) { top: -24px; left: calc(50% - 85px); }
.seat-card:nth-child(2) { top: calc(50% - 65px); right: -30px; }
.seat-card:nth-child(3) { bottom: -24px; left: calc(50% - 85px); }
.seat-card:nth-child(4) { top: calc(50% - 65px); left: -30px; }

.seat-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar-box {
  position: relative;
  font-size: 24px;
}

.host-crown {
  position: absolute;
  top: -8px;
  right: -6px;
  font-size: 12px;
}

.bot-badge {
  position: absolute;
  bottom: -4px;
  right: -6px;
  font-size: 9px;
  background: #0284c7;
  color: #fff;
  padding: 1px 3px;
  border-radius: 4px;
}

.seat-user {
  flex: 1;
  min-width: 0;
}

.seat-user .uname {
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-style-tag {
  color: #fbbf24;
  font-size: 10px;
  margin-left: 3px;
  font-weight: normal;
}

.status-tag {
  font-size: 10px;
  font-weight: 700;
  margin-top: 2px;
}

.tag-acting { color: #fbbf24; }
.tag-folded { color: #94a3b8; }
.tag-allin { color: #ef4444; }
.tag-dead { color: #64748b; }
.tag-normal { color: #22c55e; }

.player-cards {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  justify-content: center;
}

.mini-hand-card {
  width: 32px;
  height: 46px;
  background: #111218;
  border: 1px solid #292d3e;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.mini-hand-card.revealed {
  background: #ffffff;
  border-color: #cbd5e1;
}

.mini-hand-card .val {
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

.mini-hand-card .suit {
  font-size: 13px;
  line-height: 1;
}

.bullet-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 10px;
  color: #94a3b8;
}

.bullets-icons {
  display: flex;
  gap: 2px;
}

.dot-bullet {
  width: 6px;
  height: 10px;
  background: #f59e0b;
  border-radius: 2px;
}

.kick-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
}

/* 底部状态 */
.host-footer {
  min-height: 64px;
  background: #14161f;
  border-top: 1px solid #232736;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.log-ticker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #cbd5e1;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* 房主对决控制台 */
.host-gaming-deck {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.host-hand-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1c1f2e;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid #2e354b;
}

.host-label {
  font-size: 12px;
  font-weight: 800;
  color: #fbbf24;
}

.host-cards-peek {
  display: flex;
  gap: 6px;
  cursor: pointer;
}

.host-peek-tools {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.peek-chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
}

.peek-pub-btn {
  background: #252836;
  border: 1px solid #3b4256;
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.host-action-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.h-act-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.h-act-btn:disabled, .h-spec-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.call-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.call-btn.pulse {
  animation: actPulse 1.2s infinite;
}

@keyframes actPulse {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.fold-btn {
  background: #334155;
  color: #cbd5e1;
  border: 1px solid #475569;
}

.fold-btn:hover:not(:disabled) {
  background: #dc2626;
  color: #fff;
}

.h-spec-btn {
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.coward-btn {
  background: #451a03;
  color: #fb923c;
  border-color: #9a3412;
}

.switch-btn {
  background: #1e1b4b;
  color: #818cf8;
  border-color: #4338ca;
}

.allin-btn {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: #ffffff;
  font-weight: 900;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.host-turn-status {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  background: #1e293b;
  color: #94a3b8;
}

.host-turn-status.is-my-turn {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid #f59e0b;
}

.c-btn {
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  border: none;
}

.bot-btn {
  background: #1f2937;
  color: #38bdf8;
  border: 1px solid #0284c7;
}

.start-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
}

.next-btn {
  background: #10b981;
  color: #ffffff;
}

.reset-btn {
  background: #6366f1;
  color: #ffffff;
}

/* 模态框通用 */
.qr-modal-mask, .settings-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.qr-modal-card, .settings-card {
  width: 100%;
  max-width: 440px;
  background: #171821;
  border: 1px solid #334155;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
}

.modal-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.modal-h h3 {
  font-size: 17px;
  font-weight: 800;
  color: #fbbf24;
}

.close-x {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
}

.qr-image-wrap {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}

.qr-image-wrap img {
  width: 220px;
  height: 220px;
  border-radius: 12px;
  background: #fff;
  padding: 8px;
}

.url-copy-box {
  background: #111218;
  border: 1px solid #232734;
  padding: 10px;
  border-radius: 8px;
  text-align: center;
  color: #38bdf8;
  font-size: 13px;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid #232734;
}

.c-info .c-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #f1f5f9;
}

.c-info .c-desc {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.rule-toggle-btn {
  background: #252836;
  border: 1px solid #3b4256;
  color: #fbbf24;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

/* Switch 开关组件 */
.switch-toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #334155;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #f59e0b;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.settings-warn {
  margin-top: 14px;
  font-size: 11px;
  color: #f87171;
  text-align: center;
}
</style>
