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
      :my-id="myPlayerId()"
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
      :my-id="myPlayerId()"
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
      :my-id="myPlayerId()"
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

// ================================================================
// P0 多房间状态（8.3）：currentRoomId + lb.room 持久化 + 自愈入座
// ================================================================
const ROOM_STORAGE_KEY = 'lb.room';
const currentRoomId = ref(null);
const savedRoom = ref(null);          // { roomId, name, avatar, isHost }
let pendingRoomOp = false;            // 建房/入座请求在途标记（防止自愈与响应竞态）
let pendingView = null;               // P1-2：入座确认后才切换的视图（失败留在表单）

function loadSavedRoom() {
  try {
    // 用 sessionStorage（每标签页独立）：刷新可恢复入座，但新标签页/新窗口
    // 不会被别的窗口的房间上下文劫持（localStorage 会跨标签共享导致误恢复）
    const raw = JSON.parse(sessionStorage.getItem(ROOM_STORAGE_KEY) || 'null');
    return raw && raw.roomId ? raw : null;
  } catch (e) {
    return null;
  }
}

function enterRoom(roomId, { name, avatar, isHost }) {
  currentRoomId.value = roomId;
  socketService.setRoomId(roomId);
  savedRoom.value = { roomId, name: name || '', avatar: avatar || '', isHost: Boolean(isHost) };
  try {
    sessionStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(savedRoom.value));
  } catch (e) {}
}

function clearCurrentRoom() {
  currentRoomId.value = null;
  socketService.setRoomId(null);
  savedRoom.value = null;
  try {
    sessionStorage.removeItem(ROOM_STORAGE_KEY);
  } catch (e) {}
}

// ================================================================
// P1-2 resumeToken 持久化（8.3）：token 与 requestId 同存、重试复用同一 requestId
// ================================================================
function resumeKey(roomId) {
  return 'lb.resume.' + roomId;
}

function loadResume(roomId) {
  try {
    return JSON.parse(sessionStorage.getItem(resumeKey(roomId)) || 'null');
  } catch (e) {
    return null;
  }
}

function saveResume(roomId, token) {
  if (!roomId || !token) return;
  let requestId;
  try {
    requestId = (crypto.randomUUID && crypto.randomUUID()) || ('rq_' + Date.now() + '_' + Math.floor(Math.random() * 1e9));
  } catch (e) {
    requestId = 'rq_' + Date.now();
  }
  const rec = { token, requestId, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  try {
    sessionStorage.setItem(resumeKey(roomId), JSON.stringify(rec));
  } catch (e) {}
}

function clearResume(roomId) {
  if (!roomId) return;
  try {
    sessionStorage.removeItem(resumeKey(roomId));
  } catch (e) {}
}

/** P1-1：前端自报能力（4.5），服务端按会话投影快照。必须在任何入座操作前发送。 */
function announceClientCapability() {
  socketService.send('CLIENT_HELLO', { version: '1.1' });
}

function leaveCurrentRoomLocal() {
  clearResume(currentRoomId.value);
  clearCurrentRoom();
}

/**
 * 关键自愈兜底（8.3）：在房视图中检测到本人未入座时，按持久化的
 * 房间号 + 昵称补发 JOIN_ROOM（不再传 isHost，房主归属由服务端重绑判定）。
 */
function healJoin() {
  if (currentView.value !== 'HOST' && currentView.value !== 'PLAYER') return;
  if (pendingRoomOp) return;
  const saved = savedRoom.value;
  if (!saved || !saved.roomId) return;
  const seated = (gameState.value.players || []).some(p => p.id === mySocketId.value);
  if (seated) return;
  socketService.send('JOIN_ROOM', {
    roomId: saved.roomId,
    name: saved.name,
    avatar: saved.avatar
  });
}

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

// P1-1：本人在帧里的稳定 ID（新协议）——回退到 socketId 兼容 P0 服务端
function myPlayerId() {
  return (gameState.value.self && gameState.value.self.playerId) || mySocketId.value;
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
    // 刷新页面恢复（8.3）：lb.room 存在则恢复视图并重新入座；失败由 ERROR 处理器回大厅
    announceClientCapability();   // P1-1：先声明能力，再入座（保证快照投影模式一致）
    savedRoom.value = loadSavedRoom();
    if (savedRoom.value && savedRoom.value.roomId && currentView.value === 'HOME') {
      currentRoomId.value = savedRoom.value.roomId;
      socketService.setRoomId(savedRoom.value.roomId);
      currentView.value = savedRoom.value.isHost ? 'HOST' : 'PLAYER';
      if (savedRoom.value.isHost && savedRoom.value.name) {
        myHostProfile.value = { name: savedRoom.value.name, avatar: savedRoom.value.avatar || '👑' };
      }
      // P1-2：优先 resumeToken 恢复（保留手牌）；失败由 ERROR 处理器回退 name 重绑
      const resume = loadResume(savedRoom.value.roomId);
      if (resume && resume.token && resume.requestId) {
        pendingRoomOp = true;
        socketService.send('RESUME_SESSION', { resumeToken: resume.token, requestId: resume.requestId });
      } else {
        healJoin();
      }
    } else {
      healJoin();
    }
  });

  socketService.on('server_info', (info) => {
    serverInfo.value = info;
  });

  socketService.on('state_update', (newState) => {
    // 串房防护（8.3）：不属于当前房间的帧直接丢弃，防止"人在 A 房界面、状态来自 B 房"
    if (currentRoomId.value && newState?.roomId && newState.roomId !== currentRoomId.value) {
      return;
    }
    if (newState?.status === 'GAME_OVER' && gameState.value?.status !== 'GAME_OVER') {
      showVictoryBanner.value = true;
    } else if (newState?.status !== 'GAME_OVER') {
      showVictoryBanner.value = false;
    }

    gameState.value = newState;
    if (newState?.roomId && !currentRoomId.value) {
      // 无码入座（MAIN）等场景：从服务端帧学习当前房间号
      const saved = savedRoom.value;
      enterRoom(newState.roomId, {
        name: saved?.name || myHostProfile.value.name,
        avatar: saved?.avatar || myHostProfile.value.avatar,
        isHost: Boolean(newState.self?.isHost)
      });
    }
    pendingRoomOp = false;
    if (pendingView && currentView.value === 'HOME') {
      currentView.value = pendingView;   // 入座确认，切换视图
    }
    pendingView = null;
    healJoin();
  });

  // —— P1-2 断线重连（7.2.1）：RESUME_OK 携带轮换后的新 token ——
  socketService.on('resume_ok', (payload) => {
    pendingRoomOp = false;
    if (pendingView && currentView.value === 'HOME') {
      currentView.value = pendingView;
    }
    pendingView = null;
    if (payload?.roomId) {
      enterRoom(payload.roomId, {
        name: savedRoom.value?.name || myHostProfile.value.name,
        avatar: savedRoom.value?.avatar || myHostProfile.value.avatar,
        isHost: Boolean(payload.state?.self?.isHost)
      });
      if (payload.resumeToken) {
        saveResume(payload.roomId, payload.resumeToken);  // 新 token 配新 requestId，重试仍复用
      }
    }
    if (payload?.state) {
      gameState.value = payload.state;
    }
  });

  // —— P1-2：入座/重绑后服务端签发（轮换）resumeToken ——
  socketService.on('seat_token', (payload) => {
    if (payload?.roomId && payload?.resumeToken) {
      saveResume(payload.roomId, payload.resumeToken);
    }
  });

  // —— P1：房主移交后新 host 收到双凭证 ——
  socketService.on('host_transferred', (payload) => {
    if (payload?.roomId && payload?.resumeToken) {
      saveResume(payload.roomId, payload.resumeToken);
      showToast('房主已将酒馆移交给你！');
    }
  });

  // —— P1：会话被显式撤销（房主/本人操作）——
  socketService.on('sessions_revoked', (payload) => {
    if (payload?.playerId && payload.playerId !== mySocketId.value && payload.playerId !== myPlayerId()) {
      return; // 撤销的是别人
    }
    showToast('会话已被撤销，请重新入座');
    currentView.value = 'HOME';
    clearCurrentRoom();
  });

  // —— 多房间协议事件（4.1）——
  socketService.on('room_created', (payload) => {
    pendingRoomOp = false;
    if (payload?.roomId) {
      enterRoom(payload.roomId, {
        name: myHostProfile.value.name,
        avatar: myHostProfile.value.avatar,
        isHost: true
      });
      if (payload.resumeToken) {
        saveResume(payload.roomId, payload.resumeToken);
      }
    }
    if (payload?.state) {
      gameState.value = payload.state;
    }
  });

  socketService.on('room_closed', (payload) => {
    const closedId = payload?.roomId;
    if (closedId && currentRoomId.value && closedId !== currentRoomId.value) return;
    showToast(payload?.message || '房主已解散房间，已退回大厅。');
    currentView.value = 'HOME';
    clearResume(currentRoomId.value);
    clearCurrentRoom();
  });

  socketService.on('kicked', () => {
    showToast('你已被房主请离房间');
    currentView.value = 'HOME';
    clearResume(currentRoomId.value);
    clearCurrentRoom();
  });

  socketService.on('server_shutdown', () => {
    showToast('服务器维护中，房间即将失效，请稍后重新建房。');
  });

  socketService.on('error', (payload) => {
    const code = payload?.code;
    const message = payload?.message || '操作失败';
    const wasPending = pendingRoomOp;
    pendingRoomOp = false;
    if (wasPending) {
      pendingView = null;   // 入座失败：留在 HOME 表单（WRONG_PASSWORD 已单独处理提示）
    }
    // P1-2：RESUME 失败 → 清掉失效凭证，回退 name 三条件重绑（不弹回大厅）
    if (code === 'RESUME_EXPIRED' || code === 'RESUME_REPLAYED') {
      clearResume(currentRoomId.value);
      showToast('快速恢复失败，正在尝试重新入座…');
      healJoin();
      return;
    }
    if (code === 'RESUME_RATE_LIMITED') {
      showToast('恢复尝试过于频繁，请稍后重试或重新入座。');
      return;
    }
    // P1-2：房间密码错误 → 只提示，留在加入表单（不清表单状态，用户改密码直接重试）
    if (code === 'WRONG_PASSWORD') {
      showToast(message);
      return;
    }
    if (code === 'ROOM_NOT_FOUND') {
      showToast('房间已不存在（服务器重启后房间会消失），请重新建房或加入。');
      currentView.value = 'HOME';
      clearResume(currentRoomId.value);
      clearCurrentRoom();
      return;
    }
    if (wasPending && code !== 'NOT_HOST') {
      // 在途的建房/入座失败（房间满、对局中、重名等）：回大厅并清空本地房间状态
      showToast(message);
      currentView.value = 'HOME';
      clearResume(currentRoomId.value);
      clearCurrentRoom();
      return;
    }
    showToast(message);
  });

  socketService.on('unauthorized_access_key', (msg) => {
    showToast(msg || '进服暗号错误，已被私密酒馆拦截！');
    currentView.value = 'HOME';
  });

  socketService.on('error_notice', (msg) => {
    showToast(msg);
  });

  // 支持 URL 参数快捷进入 (方便多标签页调试测试)；?room=R7K2M9 输码直达（8.1）
  const params = new URLSearchParams(window.location.search);
  if (params.get('host') === '1') {
    setTimeout(() => {
      onStartHost();
    }, 400);
  } else if (params.get('name')) {
    const name = params.get('name');
    const avatars = ['🦊', '🐺', '🐻', '🐵', '🐶', '🦁', '🤠'];
    const avatar = params.get('avatar') || avatars[Math.floor(Math.random() * avatars.length)];
    const roomCode = params.get('room');
    setTimeout(() => {
      onJoinPlayer({ name, avatar, roomCode });
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
      leaveCurrentRoomLocal();
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
      // P0 改造（8.3）：改用 LEAVE_ROOM 消息离座，不再断开重连
      socketService.send('LEAVE_ROOM');
      leaveCurrentRoomLocal();
      currentView.value = 'HOME';
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

  // P0 改造（4.1/8.2）：创建房间改为 CREATE_ROOM，config 随载荷下发；
  // 房间号由服务端在 ROOM_CREATED 返回（单间模式下为 MAIN）。
  // P1-2：房间密码（可选，创建私密房间）。
  pendingRoomOp = true;
  socketService.send('CREATE_ROOM', {
    name: myHostProfile.value.name,
    avatar: myHostProfile.value.avatar,
    mode: chosenMode,
    config: profile?.config || null,
    password: profile?.password || null
  });
  currentView.value = 'HOST';
}

async function onJoinPlayer({ name, avatar, targetHostIp, accessKey, roomCode, roomPassword }) {
  initAudio();
  if (targetHostIp) {
    await socketService.connectToHost(targetHostIp);
  }
  const code = String(roomCode || '').toUpperCase().trim();
  pendingRoomOp = true;
  pendingView = 'PLAYER';   // 视图切换推迟到入座确认：密码错误等失败留在表单
  if (code) {
    // 输码入座（8.2）：roomId 随载荷下发；P1-2 携带房间密码
    enterRoom(code, { name, avatar, isHost: false });
    socketService.send('JOIN_ROOM', { roomId: code, name, avatar, password: roomPassword || null });
  } else {
    // 无码 → MAIN 兼容路径（单间 APK / 旧服务端语义）
    enterRoom('MAIN', { name, avatar, isHost: false });
    socketService.send('JOIN_ROOM', { name, avatar });
  }
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
