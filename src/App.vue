<template>
  <div class="app-root" :class="{ 'is-home': currentView === 'HOME' }" @click.once="initAudio">
    <!-- 移动端竖屏提醒引导 (当处于竖屏时浮现，旋转手机横屏后自动消失) -->
    <div v-if="isPortrait && showPortraitHint" class="portrait-rotate-bar">
      <div class="prb-left">
        <span class="prb-icon">🔄</span>
        <span class="prb-text">检测到竖屏，请旋转手机横屏获得最佳视界</span>
      </div>
      <button class="prb-close-btn" title="关闭提示" @click.stop="showPortraitHint = false">✕</button>
    </div>

    <!-- 首页大堂 -->
    <HomeView
      v-if="currentView === 'HOME'"
      @start-host="onStartHost"
      @join-player="onJoinPlayer"
    />

    <!-- 统一对决视界：骗子纸牌 · 恶魔模式 -->
    <LiarsDeckArena
      v-else-if="(currentView === 'HOST' || currentView === 'PLAYER') && gameState.mode === 'LIARS_DECK'"
      :is-host="currentView === 'HOST'"
      :state="gameState"
      :server-info="serverInfo"
      :my-id="mySocketId"
      @update-config="onUpdateConfig"
      @add-bot="onAddBot"
      @remove-player="onRemovePlayer"
      @start-game="onStartGame"
      @start-next-hand="onStartNextHand"
      @reset-lobby="onResetLobby"
      @open-victory="showVictoryBanner = true"
      @cancel-room="onCancelRoom"
      @leave-room="onLeaveRoom"
      @action="onPlayerAction"
    />

    <!-- 统一对决视界：骗子骰子 · 吹牛模式 -->
    <LiarsDiceArena
      v-else-if="(currentView === 'HOST' || currentView === 'PLAYER') && gameState.mode === 'LIARS_DICE'"
      :is-host="currentView === 'HOST'"
      :state="gameState"
      :server-info="serverInfo"
      :my-id="mySocketId"
      @update-config="onUpdateConfig"
      @add-bot="onAddBot"
      @remove-player="onRemovePlayer"
      @start-game="onStartGame"
      @start-next-hand="onStartNextHand"
      @reset-lobby="onResetLobby"
      @open-victory="showVictoryBanner = true"
      @cancel-room="onCancelRoom"
      @leave-room="onLeaveRoom"
      @action="onPlayerAction"
    />

    <!-- 统一对决视界：德州扑克子弹模式 -->
    <GameArena
      v-else-if="currentView === 'HOST' || currentView === 'PLAYER'"
      :is-host="currentView === 'HOST'"
      :state="gameState"
      :server-info="serverInfo"
      :my-id="mySocketId"
      @update-config="onUpdateConfig"
      @add-bot="onAddBot"
      @remove-player="onRemovePlayer"
      @start-game="onStartGame"
      @start-next-hand="onStartNextHand"
      @reset-lobby="onResetLobby"
      @open-victory="showVictoryBanner = true"
      @cancel-room="onCancelRoom"
      @leave-room="onLeaveRoom"
      @action="onPlayerAction"
    />

    <!-- 终局胜者展示 -->
    <VictoryBanner
      :visible="showVictoryBanner && gameState.status === 'GAME_OVER'"
      :is-host="currentView === 'HOST'"
      :players="gameState.players"
      :community-cards="gameState.communityCards"
      :mode="gameState.mode"
      :config="gameState.config"
      @restart="onStartGame"
      @reset-lobby="onResetLobby"
      @close="showVictoryBanner = false"
      @cancel-room="onCancelRoom"
      @leave-room="onLeaveRoom"
    />

    <!-- 优雅沉浸式确认弹窗 (替代浏览器原生丑陋灰色 confirm 对话框) -->
    <transition name="confirm-modal-pop">
      <div
        v-if="confirmDialog.visible"
        class="custom-confirm-backdrop"
        @click.self="cancelConfirmDialog"
      >
        <div class="custom-confirm-card" :class="`theme-${confirmDialog.type}`">
          <div class="confirm-card-header">
            <span class="confirm-card-icon">{{ confirmDialog.icon }}</span>
            <span class="confirm-card-title">{{ confirmDialog.title }}</span>
            <button class="confirm-card-close" @click="cancelConfirmDialog">✕</button>
          </div>
          <div class="confirm-card-body">
            <p class="confirm-card-desc">{{ confirmDialog.message }}</p>
            <div v-if="confirmDialog.subtext" class="confirm-card-subtext">
              {{ confirmDialog.subtext }}
            </div>
          </div>
          <div class="confirm-card-actions">
            <button class="confirm-action-btn cancel-btn" @click="cancelConfirmDialog">
              {{ confirmDialog.cancelText }}
            </button>
            <button
              class="confirm-action-btn submit-btn"
              :class="confirmDialog.type"
              @click="submitConfirmDialog"
            >
              {{ confirmDialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 全局非阻塞通知气泡 (替代阻塞式原生 alert) -->
    <transition name="toast-pop">
      <div v-if="toastMessage" class="global-app-toast">
        {{ toastMessage }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import HomeView from './components/HomeView.vue';
import GameArena from './components/GameArena.vue';
import LiarsDeckArena from './components/LiarsDeckArena.vue';
import LiarsDiceArena from './components/LiarsDiceArena.vue';
import VictoryBanner from './components/VictoryBanner.vue';
import { socketService } from './api/socketService';
import { sounds } from './utils/audio';

const currentView = ref('HOME'); // 'HOME', 'HOST', 'PLAYER'
const mySocketId = ref('');
const serverInfo = ref(null);
const showVictoryBanner = ref(false);
const toastMessage = ref('');
let toastTimer = null;

// 自定义房主信息
const myHostProfile = ref({ name: '酒馆老板', avatar: '👑' });

// 移动端横竖屏检测与引导提示
const isPortrait = ref(false);
const showPortraitHint = ref(true);

function checkOrientation() {
  const wasPortrait = isPortrait.value;
  isPortrait.value = window.innerHeight > window.innerWidth;
  // 若从横屏切回竖屏，重新展示提示
  if (!wasPortrait && isPortrait.value) {
    showPortraitHint.value = true;
  }
}

function showToast(msg) {
  if (!msg) return;
  toastMessage.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, 2800);
}

const gameState = ref({
  status: 'LOBBY',
  mode: 'LIARS_DECK',
  handNumber: 0,
  roundIndex: 1,
  config: {
    enableSwitch: true,
    eliminateAllLosers: true,
    maxPlayers: 4
  },
  communityCards: [],
  communityRevealedCount: 0,
  currentTurnPlayerId: null,
  allInTriggered: false,
  lastAction: null,
  rouletteEvent: null,
  showdownResult: null,
  logs: [],
  players: []
});

function initAudio() {
  sounds.init();
}

onMounted(async () => {
  // 1. 获取服务器局域网 IP 与信息 (带重试轮询，适配 Android 嵌入式 Node.js 启动耗时)
  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);

  const pollServerInfo = async (maxTries = 30) => {
    for (let i = 0; i < maxTries; i++) {
      const info = await socketService.fetchServerInfo();
      if (info && (info.lanIp || info.port)) {
        serverInfo.value = info;
        if (info.lanIp && info.lanIp !== '127.0.0.1' && info.lanIp !== 'localhost') {
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };

  pollServerInfo(30);

  // 2. 建立 WebSocket 实时通道
  socketService.connect();

  // 3. 监听嵌入式 Node.js 服务就绪通知 (Android APK 环境)
  const onNodeReady = async (e) => {
    console.log('[App] 收到 Node.js 就绪事件通知:', e?.type, e?.detail);
    if (e?.detail && (e.detail.lanUrl || e.detail.port)) {
      serverInfo.value = e.detail;
    }
    const info = await socketService.fetchServerInfo();
    if (info) serverInfo.value = info;
    socketService.connect();
    if (currentView.value === 'HOST') {
      socketService.send('JOIN_ROOM', {
        name: myHostProfile.value.name,
        avatar: myHostProfile.value.avatar,
        isHost: true
      });
    }
    pollServerInfo(10);
  };

  document.addEventListener('nodejs-server-ready', onNodeReady);
  document.addEventListener('nodejs-ready', onNodeReady);

  socketService.on('init', (data) => {
    mySocketId.value = data.socketId;
    if (data.serverInfo) {
      serverInfo.value = data.serverInfo;
    }
    if (data.state) {
      gameState.value = data.state;
    }
    // 关键自愈兜底：若当前在房主视图但房间内尚未有房主入座，自动补发 JOIN_ROOM
    if (currentView.value === 'HOST') {
      const hasHost = data.state?.players?.some(p => p.isHost && !p.isBot);
      if (!hasHost) {
        socketService.send('JOIN_ROOM', {
          name: myHostProfile.value.name,
          avatar: myHostProfile.value.avatar,
          isHost: true,
          mode: gameState.value.mode
        });
      }
    }
  });

  socketService.on('server_info', (info) => {
    serverInfo.value = info;
  });

  socketService.on('state_update', (newState) => {
    if (newState?.status === 'GAME_OVER' && gameState.value?.status !== 'GAME_OVER') {
      showVictoryBanner.value = true;
    } else if (newState?.status !== 'GAME_OVER') {
      showVictoryBanner.value = false;
    }

    gameState.value = newState;
    // 若当前在房主界面且房间内尚无本人/房主，自动补发入座指令
    if (currentView.value === 'HOST') {
      const hasHost = newState?.players?.some(p => p.isHost && !p.isBot);
      if (!hasHost) {
        socketService.send('JOIN_ROOM', {
          name: myHostProfile.value.name,
          avatar: myHostProfile.value.avatar,
          isHost: true,
          mode: gameState.value.mode
        });
      }
    }
  });

  socketService.on('room_disbanded', (msg) => {
    showToast(msg || '房主已解散房间');
    currentView.value = 'HOME';
  });

  socketService.on('unauthorized_access_key', (msg) => {
    showToast(msg || '进服暗号错误，已被私密酒馆拦截！');
    currentView.value = 'HOME';
  });

  socketService.on('error_notice', (msg) => {
    showToast(msg);
  });

  // 支持 URL 参数快捷进入 (方便多标签页调试测试)
  const params = new URLSearchParams(window.location.search);
  if (params.get('host') === '1') {
    setTimeout(() => {
      onStartHost();
    }, 400);
  } else if (params.get('name')) {
    const name = params.get('name');
    const avatars = ['🦊', '🐺', '🐻', '🐵', '🐶', '🦁', '🤠'];
    const avatar = params.get('avatar') || avatars[Math.floor(Math.random() * avatars.length)];
    setTimeout(() => {
      onJoinPlayer({ name, avatar });
    }, 400);
  }
});

const confirmDialog = ref({
  visible: false,
  icon: '🚪',
  title: '解散房间确认',
  message: '',
  subtext: '',
  confirmText: '确认解散',
  cancelText: '再想想',
  type: 'danger',
  onConfirm: null
});

function openCustomConfirm({
  icon = '🚪',
  title = '确认提示',
  message = '',
  subtext = '',
  confirmText = '确定',
  cancelText = '取消',
  type = 'danger',
  onConfirm = null
}) {
  confirmDialog.value = {
    visible: true,
    icon,
    title,
    message,
    subtext,
    confirmText,
    cancelText,
    type,
    onConfirm
  };
}

function cancelConfirmDialog() {
  confirmDialog.value.visible = false;
  confirmDialog.value.onConfirm = null;
}

function submitConfirmDialog() {
  if (confirmDialog.value.onConfirm) {
    try {
      confirmDialog.value.onConfirm();
    } catch (e) {
      console.error('[ConfirmDialog] error:', e);
    }
  }
  confirmDialog.value.visible = false;
  confirmDialog.value.onConfirm = null;
}

function onCancelRoom() {
  openCustomConfirm({
    icon: '🚪',
    title: '解散房间确认',
    message: '确定要解散房间吗？',
    subtext: '',
    confirmText: '确认解散',
    cancelText: '取消',
    type: 'danger',
    onConfirm: () => {
      socketService.send('CANCEL_ROOM');
      currentView.value = 'HOME';
    }
  });
}

function onLeaveRoom() {
  openCustomConfirm({
    icon: '🚪',
    title: '离开房间确认',
    message: '确定要离开房间吗？',
    subtext: '',
    confirmText: '确认离开',
    cancelText: '取消',
    type: 'warning',
    onConfirm: () => {
      currentView.value = 'HOME';
      socketService.disconnect();
      setTimeout(() => {
        socketService.connect();
      }, 400);
    }
  });
}

function onStartHost(profile) {
  initAudio();
  socketService.setTargetHost('');
  if (profile && profile.name) {
    myHostProfile.value = {
      name: profile.name.trim() || '酒馆老板',
      avatar: profile.avatar || '👑'
    };
  }
  const urlMode = new URLSearchParams(window.location.search).get('mode');
  let chosenMode = profile?.mode;
  if (!chosenMode) {
    if (urlMode === 'dice' || urlMode === 'LIARS_DICE') chosenMode = 'LIARS_DICE';
    else if (urlMode === 'texas' || urlMode === 'TEXAS_POKER') chosenMode = 'TEXAS_POKER';
    else chosenMode = 'LIARS_DECK';
  }

  socketService.send('JOIN_ROOM', {
    name: myHostProfile.value.name,
    avatar: myHostProfile.value.avatar,
    isHost: true,
    mode: chosenMode,
    config: profile?.config
  });
  if (profile?.config) {
    socketService.send('UPDATE_CONFIG', profile.config);
  }
  currentView.value = 'HOST';
}

async function onJoinPlayer({ name, avatar, targetHostIp, accessKey }) {
  initAudio();
  if (targetHostIp) {
    await socketService.connectToHost(targetHostIp);
  }
  socketService.send('JOIN_ROOM', {
    name,
    avatar,
    isHost: false,
    accessKey
  });
  currentView.value = 'PLAYER';
}

function onUpdateConfig(config) {
  socketService.send('UPDATE_CONFIG', config);
}

function onAddBot() {
  console.log('[App] onAddBot clicked, sending ADD_BOT to server...');
  try {
    sounds.play('card');
  } catch (e) {}
  socketService.send('ADD_BOT');
}

function onRemovePlayer(playerId) {
  socketService.send('REMOVE_PLAYER', { playerId });
}

function onStartGame() {
  showVictoryBanner.value = false;
  socketService.send('START_GAME');
}

function onResetLobby() {
  showVictoryBanner.value = false;
  socketService.send('RESET_LOBBY');
}

function onStartNextHand() {
  socketService.send('START_NEXT_HAND');
}

function onPlayerAction(action, payload = {}) {
  if (typeof action === 'object' && action !== null) {
    socketService.send('ACTION', action);
    return;
  }
  socketService.send('ACTION', {
    action,
    ...payload
  });
}
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: #0d0e14;
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  overflow-x: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.app-root {
  min-height: 100vh;
  width: 100%;
}

.app-root.is-home {
  background-color: #f8fafc;
  color: #0f172a;
}

/* 全局非阻塞通知气泡 */
.global-app-toast {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #38bdf8;
  color: #f8fafc;
  padding: 7px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 10px rgba(56, 189, 248, 0.4);
  z-index: 9999;
  pointer-events: none;
  white-space: nowrap;
}

.toast-pop-enter-active,
.toast-pop-leave-active {
  transition: all 0.25s ease-out;
}

.toast-pop-enter-from,
.toast-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}

/* 竖屏温和浮动胶囊提醒 (非侵入式) */
.portrait-rotate-bar {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(251, 191, 36, 0.5);
  padding: 6px 14px;
  border-radius: 9999px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6), 0 0 10px rgba(245, 158, 11, 0.25);
  z-index: 10000;
  max-width: 90vw;
  pointer-events: auto;
}

.prb-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #fbbf24;
  font-weight: 700;
}

.prb-icon {
  font-size: 15px;
  animation: rotateSpin 2.5s infinite linear;
}

.prb-close-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  border: none;
  font-size: 12px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.prb-close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.2);
}

@keyframes rotateSpin {
  0% { transform: rotate(0deg); }
  50% { transform: rotate(90deg); }
  100% { transform: rotate(0deg); }
}

/* 自定义沉浸式确认弹窗 (替代浏览器原生丑陋灰色 confirm 对话框) */
.custom-confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(3, 7, 18, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 10005;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.custom-confirm-card {
  width: min(88vw, 340px);
  background: linear-gradient(145deg, #161b26 0%, #0d111a 100%);
  border: 1.5px solid rgba(239, 68, 68, 0.5);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(239, 68, 68, 0.25);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: confirmPop 0.25s ease-out;
}

.custom-confirm-card.theme-warning {
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(245, 158, 11, 0.25);
}

.confirm-card-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  gap: 8px;
}

.confirm-card-icon {
  font-size: 18px;
}

.confirm-card-title {
  flex: 1;
  font-size: 15px;
  font-weight: 800;
  color: #f1f5f9;
  letter-spacing: 0.5px;
}

.confirm-card-close {
  background: none;
  border: none;
  color: #64748b;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.confirm-card-close:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
}

.confirm-card-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.confirm-card-desc {
  font-size: 13.5px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.4;
  margin: 0;
}

.confirm-card-subtext {
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.35;
}

.confirm-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 16px 14px;
  background: rgba(0, 0, 0, 0.2);
}

.confirm-action-btn {
  padding: 7px 16px;
  font-size: 12.5px;
  font-weight: 800;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.confirm-action-btn.cancel-btn {
  background: rgba(51, 65, 85, 0.6);
  color: #cbd5e1;
  border: 1px solid #475569;
}
.confirm-action-btn.cancel-btn:hover {
  background: #475569;
  color: #ffffff;
}

.confirm-action-btn.submit-btn.danger {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: #ffffff;
  border: 1px solid #f87171;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}
.confirm-action-btn.submit-btn.danger:hover {
  background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
}

.confirm-action-btn.submit-btn.warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
  border: 1px solid #fbbf24;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
}
.confirm-action-btn.submit-btn.warning:hover {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
}

@keyframes confirmPop {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

.confirm-modal-pop-enter-active,
.confirm-modal-pop-leave-active {
  transition: all 0.25s ease-out;
}
.confirm-modal-pop-enter-from,
.confirm-modal-pop-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
</style>
