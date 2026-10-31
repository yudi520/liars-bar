<template>
  <div class="home-container">
    <!-- 网页浏览器端专享：下载安卓独立 App 极速通道 -->
    <div v-if="!isEmbedded" class="download-app-banner">
      <div class="banner-left">
        <span class="banner-icon">📱</span>
        <div class="banner-texts">
          <span class="banner-title">下载《骗子酒馆》安卓独立 App</span>
          <span class="banner-sub">直接从房主手机免流极速下载，沉浸全屏对决体验</span>
        </div>
      </div>
      <a href="/download-apk" class="download-app-btn" download="liars-bar.apk">
        📥 极速下载 App
      </a>
    </div>

    <!-- 顶部品牌标题 -->
    <div class="brand-hero">
      <div class="brand-tag">LIAR'S BAR · MULTIPLAYER PARTY</div>
      <h1 class="brand-title">🍻 骗子酒馆</h1>
    </div>

    <!-- 游戏模式展示 -->
    <div class="modes-carousel">
      <div
        class="mode-card"
        :class="{ active: selectedMode === 'LIARS_DECK' }"
        @click="selectedMode = 'LIARS_DECK'"
      >
        <div class="mode-badge devil-badge">😈 恶魔模式</div>
        <div class="mode-icon">🃏</div>
        <div class="mode-title">骗子纸牌 · 恶魔模式</div>
        <div class="mode-desc">暗牌出牌与质疑，😈恶魔牌反噬全场轮盘赌，📜可选恶魔契约</div>
        <button class="mode-rule-btn" @click.stop="showDevilRules = true">📖 查看规则</button>
      </div>

      <div
        class="mode-card"
        :class="{ active: selectedMode === 'TEXAS_POKER' }"
        @click="selectedMode = 'TEXAS_POKER'"
      >
        <div class="mode-badge">经典对决</div>
        <div class="mode-icon">🎰</div>
        <div class="mode-title">德州扑克 · 子弹模式</div>
        <div class="mode-desc">筹码即子弹，翻牌见生死，输家直面左轮</div>
        <button class="mode-rule-btn" @click.stop="showRules = true">📖 查看规则</button>
      </div>

      <div
        class="mode-card"
        :class="{ active: selectedMode === 'LIARS_DICE' }"
        @click="selectedMode = 'LIARS_DICE'"
      >
        <div class="mode-badge dice-badge">🎲 经典吹牛</div>
        <div class="mode-icon">🎲</div>
        <div class="mode-title">骗子骰子 · 吹牛模式</div>
        <div class="mode-desc">摇盅博弈，虚实报点，喝下致命毒药</div>
        <button class="mode-rule-btn" @click.stop="showDiceRules = true">📖 查看规则</button>
      </div>
    </div>

    <!-- 核心入口卡片 -->
    <div class="entry-card">
      <div class="tab-header">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'player' }"
          @click="activeTab = 'player'"
        >
          🎮 玩家加入
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'host' }"
          @click="activeTab = 'host'"
        >
          👑 创建房间
        </button>
      </div>

      <!-- 玩家加入房间表单 -->
      <div v-if="activeTab === 'player'" class="form-content">
        <div class="form-group">
          <label>出战昵称：</label>
          <input
            v-model="playerName"
            type="text"
            maxlength="8"
            placeholder="请输入出战昵称..."
            class="input-box"
          />
        </div>

        <div class="form-group">
          <label>选择出战头像：</label>
          <div class="avatar-grid">
            <div
              v-for="item in AVATAR_OPTIONS"
              :key="item.id"
              class="avatar-item"
              :class="{ selected: selectedAvatar === item.emoji }"
              @click="selectedAvatar = item.emoji"
            >
              <span class="emoji">{{ item.emoji }}</span>
              <span class="name">{{ item.name }}</span>
            </div>
          </div>
        </div>

        <!-- 跨机联机指定房主 IP (仅在 App 客户端环境下提供，网页端自动直连当前主机) -->
        <div v-if="isEmbedded" class="form-group host-ip-group">
          <label>房主联机 IP 或云服务器地址：</label>
          <div class="ip-input-row">
            <input
              v-model="targetHostIp"
              type="text"
              placeholder="如: 192.168.1.5 或 47.100.xx.xx:9527"
              class="input-box ip-input"
            />
            <button
              type="button"
              class="probe-btn"
              :disabled="isProbing"
              @click="handleProbeHost"
            >
              {{ isProbing ? '🔍 搜寻中...' : '🔍 探测房主' }}
            </button>
          </div>
          <!-- 进服暗号输入框 -->
          <div class="key-input-row" style="margin-top: 8px;">
            <input
              v-model="serverAccessKey"
              type="text"
              placeholder="🔒 私密进服暗号（可选，未设密码直接留空）"
              class="input-box key-input"
            />
          </div>
          <div class="ip-tip">
            💡 支持输入局域网房主 IP 或自建云服务器地址；若服务器设置了暗号请在此输入
          </div>
        </div>

        <!-- 网页端直连时的私密暗号输入 (网页端不需要输 IP，只需输暗号) -->
        <div v-else class="form-group access-key-group">
          <label>私密进服暗号（可选）：</label>
          <div class="key-input-row">
            <input
              v-model="serverAccessKey"
              type="text"
              placeholder="若该私密酒馆设置了暗号请输入，公开酒馆留空"
              class="input-box key-input"
            />
          </div>
          <div class="ip-tip">
            🔒 只有开启了暗号保护的私密云服务器需要输入，公开房间留空
          </div>
        </div>

        <button class="action-btn join-btn" @click="handleJoinPlayer">
          🎮 加入房间
        </button>
      </div>

      <!-- 房主开房面板 (支持自定义房主昵称与头像) -->
      <div v-else class="form-content">
        <div class="form-group">
          <label>房主出战昵称：</label>
          <input
            v-model="hostName"
            type="text"
            maxlength="8"
            placeholder="请输入房主出战昵称..."
            class="input-box"
          />
        </div>

        <div class="form-group">
          <label>选择房主专属头像：</label>
          <div class="avatar-grid">
            <div
              v-for="item in AVATAR_OPTIONS"
              :key="item.id"
              class="avatar-item"
              :class="{ selected: hostAvatar === item.emoji }"
              @click="hostAvatar = item.emoji"
            >
              <span class="emoji">{{ item.emoji }}</span>
              <span class="name">{{ item.name }}</span>
            </div>
          </div>
        </div>

        <!-- 恶魔模式专属开房设置 -->
        <div v-if="selectedMode === 'LIARS_DECK'" class="mode-rules-card">
          <div class="rule-box-header">
            <span class="rule-icon">😈</span>
            <span class="rule-title">恶魔模式规则参数配置</span>
          </div>

          <label class="toggle-option-row">
            <input type="checkbox" v-model="enableDevilCard" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">😈 包含恶魔牌 (Devil Card) <em class="tag-default">默认开启</em></span>
              <span class="toggle-desc">被质疑翻开时，出恶魔牌的玩家免受惩罚，其余所有玩家直面轮盘赌！</span>
            </div>
          </label>

          <label class="toggle-option-row">
            <input type="checkbox" v-model="enableDevilsDeal" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">📜 恶魔契约 (Devil's Deal) <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">台面累计≥4张牌时可发起契约；若4张全为谎言则他人受罚，有一张真牌则发起者受罚。</span>
            </div>
          </label>

          <!-- 不限时思考机制 (不读秒) -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="disableTurnTimerDeck" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">⏳ 不限时思考机制 (不读秒) <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后真人玩家行动不进行倒计时读秒，可从容无限制深度思考；电脑 AI 仍自动按常速决策。</span>
            </div>
          </label>

          <!-- 观战无透视 -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="disableSpectatorXrayDeck" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">🙈 观战无透视 <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后淘汰阵亡选手观战时无法透视其他存活玩家底牌，保持悬念；关闭则可全景透视。</span>
            </div>
          </label>

          <div class="toggle-option-row limit-row">
            <div class="toggle-content" style="flex: 1;">
              <span class="toggle-name">👥 房间人数上限 <em class="tag-default">当前: {{ deckMaxPlayers }} 人</em></span>
              <span class="toggle-desc">支持 2 ~ 4 人对决（最少 2 人，最多 4 人）。</span>
            </div>
            <div class="num-selector-inline">
              <button
                v-for="n in [2, 3, 4]"
                :key="n"
                type="button"
                class="num-choice-btn"
                :class="{ active: deckMaxPlayers === n }"
                @click.prevent="deckMaxPlayers = n"
              >
                {{ n }}人
              </button>
            </div>
          </div>
        </div>

        <!-- 德州扑克·子弹模式专属开房设置 -->
        <div v-else-if="selectedMode === 'TEXAS_POKER'" class="mode-rules-card">
          <div class="rule-box-header">
            <span class="rule-icon">🎰</span>
            <span class="rule-title">子弹模式规则参数配置</span>
          </div>

          <label class="toggle-option-row">
            <input type="checkbox" v-model="enableSwitch" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">🔄 Switch 换牌机制 <em class="tag-default">默认开启</em></span>
              <span class="toggle-desc">开启后每位玩家每场对决可换牌 1 次，候选卡牌 4➔3➔2 递减。</span>
            </div>
          </label>

          <label class="toggle-option-row">
            <input type="checkbox" v-model="eliminateAllLosers" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">💥 淘汰所有落败者 <em class="tag-default">默认开启</em></span>
              <span class="toggle-desc">开启时所有弱于头名的败者均须开枪；关闭时仅淘汰单局最后一名最弱者。</span>
            </div>
          </label>

          <!-- 不限时思考机制 (不读秒) -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="disableTurnTimerTexas" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">⏳ 不限时思考机制 (不读秒) <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后真人玩家行动不进行倒计时读秒，可从容无限制深度思考；电脑 AI 仍自动按常速决策。</span>
            </div>
          </label>

          <!-- 观战无透视 -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="disableSpectatorXrayTexas" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">🙈 观战无透视 <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后淘汰阵亡选手观战时无法透视其他存活玩家底牌，保持悬念；关闭则可全景透视。</span>
            </div>
          </label>

          <div class="toggle-option-row limit-row">
            <div class="toggle-content" style="flex: 1;">
              <span class="toggle-name">👥 房间人数上限 <em class="tag-default">当前: {{ texasMaxPlayers }} 人</em></span>
              <span class="toggle-desc">支持 2 ~ 4 人对决（最少 2 人，最多 4 人）。</span>
            </div>
            <div class="num-selector-inline">
              <button
                v-for="n in [2, 3, 4]"
                :key="n"
                type="button"
                class="num-choice-btn"
                :class="{ active: texasMaxPlayers === n }"
                @click.prevent="texasMaxPlayers = n"
              >
                {{ n }}人
              </button>
            </div>
          </div>
        </div>

        <!-- 骗子骰子·吹牛模式专属开房设置 -->
        <div v-else-if="selectedMode === 'LIARS_DICE'" class="mode-rules-card">
          <div class="rule-box-header">
            <span class="rule-icon">🎲</span>
            <span class="rule-title">吹牛模式规则参数配置</span>
          </div>

          <!-- 惩罚模式：毒药 vs 轮盘 -->
          <div class="toggle-option-row limit-row">
            <div class="toggle-content" style="flex: 1;">
              <span class="toggle-name">
                {{ dicePunishType === 'POISON' ? '🧪 致命毒药惩罚' : '🔫 俄罗斯轮盘惩罚' }}
                <em class="tag-default">{{ dicePunishType === 'POISON' ? '官方原版' : '刺激开枪' }}</em>
              </span>
              <span class="toggle-desc">
                {{ dicePunishType === 'POISON' ? '每输一次饮下1瓶毒药，喝满2瓶暴毙淘汰' : '败者对自己扣动6孔左轮手枪，命悬一线' }}
              </span>
            </div>
            <div class="num-selector-inline">
              <button
                type="button"
                class="num-choice-btn"
                :class="{ active: dicePunishType === 'POISON' }"
                @click.prevent="dicePunishType = 'POISON'"
              >
                🧪 毒药 (2瓶)
              </button>
              <button
                type="button"
                class="num-choice-btn"
                :class="{ active: dicePunishType === 'ROULETTE' }"
                @click.prevent="dicePunishType = 'ROULETTE'"
              >
                🔫 轮盘赌 (6孔)
              </button>
            </div>
          </div>

          <!-- 锁1规则 (叫1破百搭) -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="enableLockOne" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">🔒 锁1规则 (叫1破百搭) <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后，若有玩家主动叫了1点，则全场1点万能属性立即失效转为纯点；关闭时1点全程万能。</span>
            </div>
          </label>

          <!-- 精确命中 (Spot-on) -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="enableSpotOn" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">🎯 精确命中 (Spot-on / 刚中) <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后可宣称骰数刚好相等！精准命中则其余全员受罚，若不符则自己受罚。</span>
            </div>
          </label>

          <!-- 不限时思考机制 (不读秒) -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="disableTurnTimerDice" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">⏳ 不限时思考机制 (不读秒) <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后真人玩家行动不进行倒计时读秒，可从容无限制深度思考；电脑 AI 仍自动按常速决策。</span>
            </div>
          </label>

          <!-- 观战无透视 -->
          <label class="toggle-option-row">
            <input type="checkbox" v-model="disableSpectatorXrayDice" class="toggle-checkbox" />
            <div class="toggle-content">
              <span class="toggle-name">🙈 观战无透视 <em class="tag-optional">默认关闭</em></span>
              <span class="toggle-desc">开启后淘汰阵亡选手观战时无法透视其他存活玩家手骰，保持悬念；关闭则可全景透视。</span>
            </div>
          </label>

          <!-- 玩家手骰数量 (3 ~ 10 颗，默认 5 颗) -->
          <div class="toggle-option-row limit-row">
            <div class="toggle-content" style="flex: 1;">
              <span class="toggle-name">🎲 玩家手骰数量 <em class="tag-default">当前: {{ dicePerPlayer }} 颗/人 (默认 5 颗)</em></span>
              <span class="toggle-desc">每位玩家初始分发手骰数量，可在 3 ~ 10 颗之间任意调整。</span>
            </div>
            <div class="num-selector-inline dice-count-selector">
              <button
                v-for="d in [3, 4, 5, 6, 7, 8, 9, 10]"
                :key="d"
                type="button"
                class="num-choice-btn"
                :class="{ active: dicePerPlayer === d }"
                @click.prevent="dicePerPlayer = d"
              >
                {{ d }}颗
              </button>
            </div>
          </div>

          <!-- 房间人数上限 -->
          <div class="toggle-option-row limit-row">
            <div class="toggle-content" style="flex: 1;">
              <span class="toggle-name">👥 房间人数上限 <em class="tag-default">当前: {{ diceMaxPlayers }} 人</em></span>
              <span class="toggle-desc">支持 2 ~ 4 人对决（最少 2 人，最多 4 人）。</span>
            </div>
            <div class="num-selector-inline">
              <button
                v-for="n in [2, 3, 4]"
                :key="n"
                type="button"
                class="num-choice-btn"
                :class="{ active: diceMaxPlayers === n }"
                @click.prevent="diceMaxPlayers = n"
              >
                {{ n }}人
              </button>
            </div>
          </div>
        </div>

        <button class="action-btn host-btn" @click="handleOpenHost">
          🔥 创建房间
        </button>
      </div>
    </div>

    <!-- 规则弹窗 -->
    <HandRankGuide :visible="showRules" @close="showRules = false" />
    <LiarsDeckGuide :visible="showDevilRules" @close="showDevilRules = false" />
    <LiarsDiceGuide :visible="showDiceRules" @close="showDiceRules = false" />

    <!-- 优雅沉浸式酒馆弹窗 (替代原生丑陋灰色 Alert) -->
    <transition name="toast-modal-pop">
      <div
        v-if="toastInfo.visible"
        class="custom-alert-backdrop"
        @click.self="toastInfo.visible = false"
      >
        <div class="custom-alert-card" :class="`alert-theme-${toastInfo.type}`">
          <div class="alert-card-header">
            <div class="alert-header-left">
              <span class="alert-icon">{{ toastInfo.icon }}</span>
              <span class="alert-title">{{ toastInfo.title }}</span>
            </div>
            <button class="alert-close-btn" @click="toastInfo.visible = false">✕</button>
          </div>
          <div class="alert-card-body">
            <p class="alert-message">{{ toastInfo.message }}</p>
            <p v-if="toastInfo.subtext" class="alert-subtext">{{ toastInfo.subtext }}</p>
          </div>
          <div class="alert-card-actions">
            <button class="alert-confirm-btn" :class="`btn-${toastInfo.type}`" @click="toastInfo.visible = false">
              确定
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { AVATAR_OPTIONS } from '../utils/pokerConstants';
import { isEmbeddedRuntime, getTargetHostIp, setTargetHostIp, getServerAccessKey, setServerAccessKey } from '../utils/env';
import socketService from '../api/socketService';
import HandRankGuide from './HandRankGuide.vue';
import LiarsDeckGuide from './LiarsDeckGuide.vue';
import LiarsDiceGuide from './LiarsDiceGuide.vue';

const emit = defineEmits(['start-host', 'join-player']);

const isEmbedded = ref(isEmbeddedRuntime());
const targetHostIp = ref(getTargetHostIp());
const serverAccessKey = ref(getServerAccessKey());
const isProbing = ref(false);

const toastInfo = ref({
  visible: false,
  icon: '🎉',
  title: '提示',
  message: '',
  subtext: '',
  type: 'success'
});

function showToast({ icon = '🔔', title = '提示', message = '', subtext = '', type = 'success' }) {
  toastInfo.value = {
    visible: true,
    icon,
    title,
    message,
    subtext,
    type
  };
}

async function handleProbeHost() {
  isProbing.value = true;
  try {
    const foundIp = await socketService.probeHost(targetHostIp.value);
    if (foundIp) {
      targetHostIp.value = foundIp;
      setTargetHostIp(foundIp);
      showToast({
        icon: '🎉',
        title: '已发现局域网房主',
        message: `成功探测到在线房主：${foundIp}`,
        subtext: 'IP 地址已自动为您填入，点击下方「🎮 加入房间」即可立即联机！',
        type: 'success'
      });
    } else {
      showToast({
        icon: '⚠️',
        title: '未搜寻到在线房主',
        message: '未在当前 WiFi / 热点中探测到在线房主',
        subtext: '请确认房主手机已开启房间并连接同一 WiFi，或直接手动输入其 IP。',
        type: 'warning'
      });
    }
  } catch (e) {
    console.error('探测房主失败:', e);
  } finally {
    isProbing.value = false;
  }
}

const urlParams = new URLSearchParams(window.location.search);
let initialMode = 'LIARS_DECK';
const modeParam = urlParams.get('mode');
if (modeParam === 'texas' || modeParam === 'TEXAS_POKER') initialMode = 'TEXAS_POKER';
if (modeParam === 'dice' || modeParam === 'LIARS_DICE') initialMode = 'LIARS_DICE';

const selectedMode = ref(initialMode); // 'LIARS_DECK', 'TEXAS_POKER', 'LIARS_DICE'

// 骗子纸牌 · 恶魔模式专属参数
const enableDevilCard = ref(true);      // 😈 恶魔牌：默认添加
const enableDevilsDeal = ref(false);    // 📜 恶魔契约：默认关闭
const disableTurnTimerDeck = ref(false);// ⏳ 不限时思考机制：默认关闭
const disableSpectatorXrayDeck = ref(false); // 🙈 观战无透视：默认关闭
const deckMaxPlayers = ref(4);          // 恶魔模式上限：默认 4 人

// 德州扑克 · 子弹模式专属参数
const enableSwitch = ref(true);         // 🔄 Switch 换牌机制：默认开启
const eliminateAllLosers = ref(true);   // 💥 淘汰所有落败者：默认开启
const disableTurnTimerTexas = ref(false);// ⏳ 不限时思考机制：默认关闭
const disableSpectatorXrayTexas = ref(false); // 🙈 观战无透视：默认关闭
const texasMaxPlayers = ref(4);         // 德州扑克上限：默认 4 人

// 骗子骰子 · 吹牛模式专属参数
const dicePunishType = ref('POISON');   // 惩罚方式：'POISON' (默认) | 'ROULETTE'
const enableLockOne = ref(false);       // 锁1规则 (叫1破百搭)：额外机制，默认关闭
const enableSpotOn = ref(false);        // 精确命中 (Spot-on)：额外机制，默认关闭
const disableTurnTimerDice = ref(false);// ⏳ 不限时思考机制：默认关闭
const disableSpectatorXrayDice = ref(false); // 🙈 观战无透视：默认关闭
const dicePerPlayer = ref(5);           // 玩家手骰数量：3~10 颗，默认 5 颗
const diceMaxPlayers = ref(4);          // 骰子模式上限：默认 4 人

const activeTab = ref(urlParams.get('tab') === 'player' ? 'player' : 'host');
const playerName = ref('盲侠客');
const selectedAvatar = ref('🤠');
const hostName = ref('酒馆老板');
const hostAvatar = ref('👑');
const showRules = ref(urlParams.get('guide') === 'rules');
const showDevilRules = ref(urlParams.get('guide') === 'devil');
const showDiceRules = ref(urlParams.get('guide') === 'dice');

function handleJoinPlayer() {
  if (isEmbedded.value) {
    setTargetHostIp(targetHostIp.value ? targetHostIp.value.trim() : '');
  }
  setServerAccessKey(serverAccessKey.value ? serverAccessKey.value.trim() : '');
  emit('join-player', {
    name: playerName.value.trim() || '酒馆醉客',
    avatar: selectedAvatar.value,
    targetHostIp: isEmbedded.value && targetHostIp.value ? targetHostIp.value.trim() : '',
    accessKey: serverAccessKey.value ? serverAccessKey.value.trim() : ''
  });
}

function handleOpenHost() {
  // 房主模式重置为本机
  if (isEmbedded.value) {
    setTargetHostIp('');
  }
  setServerAccessKey(serverAccessKey.value ? serverAccessKey.value.trim() : '');
  let config = {};
  if (selectedMode.value === 'LIARS_DECK') {
    config = {
      enableDevilCard: enableDevilCard.value,
      enableDevilsDeal: enableDevilsDeal.value,
      disableTurnTimer: disableTurnTimerDeck.value,
      disableSpectatorXray: disableSpectatorXrayDeck.value,
      maxPlayers: deckMaxPlayers.value
    };
  } else if (selectedMode.value === 'TEXAS_POKER') {
    config = {
      enableSwitch: enableSwitch.value,
      eliminateAllLosers: eliminateAllLosers.value,
      disableTurnTimer: disableTurnTimerTexas.value,
      disableSpectatorXray: disableSpectatorXrayTexas.value,
      maxPlayers: texasMaxPlayers.value
    };
  } else if (selectedMode.value === 'LIARS_DICE') {
    config = {
      punishType: dicePunishType.value,
      enableLockOne: enableLockOne.value,
      enableSpotOn: enableSpotOn.value,
      dicePerPlayer: dicePerPlayer.value,
      disableTurnTimer: disableTurnTimerDice.value,
      disableSpectatorXray: disableSpectatorXrayDice.value,
      maxPlayers: diceMaxPlayers.value
    };
  }

  emit('start-host', {
    name: hostName.value.trim() || '酒馆老板',
    avatar: hostAvatar.value || '👑',
    mode: selectedMode.value,
    config,
    accessKey: serverAccessKey.value ? serverAccessKey.value.trim() : ''
  });
}
</script>

<style scoped>
.home-container {
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  box-sizing: border-box;
}

/* 顶部品牌区 (白色明亮简约风) */
.brand-hero {
  text-align: center;
  margin-top: 6px;
  margin-bottom: 20px;
}

.brand-tag {
  font-size: 11px;
  letter-spacing: 2.5px;
  color: #64748b;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.brand-title {
  font-size: 32px;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: 0.5px;
  margin: 4px 0 6px;
}

.brand-desc {
  font-size: 14px;
  color: #475569;
  font-weight: 500;
}

/* 多模式横向滑块 (白底卡片质感) */
.modes-carousel {
  display: flex;
  gap: 12px;
  width: 100%;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 20px;
  scrollbar-width: none;
}
.modes-carousel::-webkit-scrollbar {
  display: none;
}

.mode-card {
  flex: 0 0 170px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s;
}

.mode-card.active {
  border-color: #f59e0b;
  background: #fffbeb;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.15);
}

.mode-card.devil-glow {
  border-color: #ef4444;
  background: #fef2f2;
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.2);
}

.mode-card.locked {
  background: #f8fafc;
  opacity: 0.65;
}

.mode-badge {
  align-self: flex-start;
  font-size: 10px;
  background: #f59e0b;
  color: #ffffff;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 6px;
  margin-bottom: 6px;
}

.mode-badge.devil-badge {
  background: #b45309;
  color: #ffffff;
}

.mode-badge.dice-badge {
  background: #d97706;
  color: #ffffff;
}

.mode-rule-btn {
  margin-top: 8px;
  align-self: flex-start;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-rule-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

.mode-badge.lock {
  background: #94a3b8;
  color: #ffffff;
}

.mode-icon {
  font-size: 26px;
  margin: 2px 0 4px;
}

.mode-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.mode-desc {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
  line-height: 1.35;
}

/* 核心表单卡片 (高质感纯白面板) */
.entry-card {
  width: 100%;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
}

.tab-header {
  display: flex;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  padding: 4px;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  padding: 12px 10px;
  background: transparent;
  border: none;
  border-radius: 12px;
  color: #64748b;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #0f172a;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.form-content {
  padding: 22px 20px;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 8px;
}

.input-box {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  color: #0f172a;
  font-size: 15px;
  font-weight: 600;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-box:focus {
  border-color: #f59e0b;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.avatar-item {
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s;
}

.avatar-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.avatar-item.selected {
  border-color: #f59e0b;
  background: #fffbeb;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.25);
  transform: translateY(-2px);
}

.avatar-item .emoji {
  font-size: 26px;
}

.avatar-item .name {
  font-size: 11px;
  color: #475569;
  font-weight: 600;
  margin-top: 4px;
}

.avatar-item.selected .name {
  color: #b45309;
}

.action-btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

.action-btn:active {
  transform: scale(0.98);
}

.join-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(217, 119, 6, 0.3);
}

.host-intro {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 22px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
}

.host-intro .icon {
  font-size: 32px;
  flex-shrink: 0;
}

.host-intro h4 {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}

.host-intro p {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 0;
}

.host-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
}

/* 恶魔模式开房专属规则卡 (柔和中性深灰底，不用特定红色) */
.mode-rules-card {
  margin-top: 14px;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-box-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
  color: #334155;
}

.toggle-option-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  background: #ffffff;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
}

.toggle-option-row:hover {
  border-color: #cbd5e1;
}

.toggle-checkbox {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  cursor: pointer;
  accent-color: #b45309;
}

.toggle-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-default {
  font-size: 10px;
  font-style: normal;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 5px;
  border-radius: 4px;
}

.tag-optional {
  font-size: 10px;
  font-style: normal;
  background: #f1f5f9;
  color: #64748b;
  padding: 1px 5px;
  border-radius: 4px;
}

.toggle-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.limit-row {
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.num-selector-inline {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.dice-count-selector {
  flex-wrap: wrap;
  max-width: 280px;
  justify-content: flex-end;
}

.num-choice-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.num-choice-btn:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.num-choice-btn.active {
  background: #b45309;
  border-color: #b45309;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(180, 83, 9, 0.25);
}

/* 浏览器端下载横幅 */
.download-app-banner {
  width: 100%;
  max-width: 620px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 12px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 10px rgba(56, 189, 248, 0.2);
}

.banner-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.banner-icon {
  font-size: 24px;
}

.banner-texts {
  display: flex;
  flex-direction: column;
}

.banner-title {
  font-size: 13.5px;
  font-weight: 800;
  color: #38bdf8;
}

.banner-sub {
  font-size: 11px;
  color: #94a3b8;
}

.download-app-btn {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  border: 1px solid #38bdf8;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
  transition: all 0.2s;
}

.download-app-btn:hover {
  background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
  transform: translateY(-1px);
}

/* 房主 IP 输入行 */
.ip-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ip-input {
  flex: 1;
}

.probe-btn {
  padding: 7px 12px;
  background: #334155;
  color: #f1f5f9;
  border: 1px solid #475569;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.probe-btn:hover:not(:disabled) {
  background: #475569;
  border-color: #38bdf8;
  color: #38bdf8;
}

.probe-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.ip-tip {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.key-input-row {
  display: flex;
  align-items: center;
}

.key-input {
  width: 100%;
}

/* 优雅沉浸式酒馆 Alert 弹窗 */
.custom-alert-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.custom-alert-card {
  width: min(88vw, 360px);
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid #334155;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 0, 0, 0.6);
  animation: alertPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.custom-alert-card.alert-theme-success {
  border-color: rgba(34, 197, 94, 0.6);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 20px rgba(34, 197, 94, 0.25);
}

.custom-alert-card.alert-theme-warning {
  border-color: rgba(245, 158, 11, 0.6);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 20px rgba(245, 158, 11, 0.25);
}

.alert-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.alert-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-icon {
  font-size: 18px;
}

.alert-title {
  font-size: 14px;
  font-weight: 800;
  color: #f1f5f9;
}

.alert-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.alert-close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.alert-card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alert-message {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.45;
}

.alert-subtext {
  margin: 0;
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.45;
}

.alert-card-actions {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px 14px;
  background: rgba(0, 0, 0, 0.2);
}

.alert-confirm-btn {
  padding: 6px 20px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.alert-confirm-btn.btn-success {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  color: #ffffff;
  border: 1px solid #22c55e;
  box-shadow: 0 2px 10px rgba(34, 197, 94, 0.35);
}

.alert-confirm-btn.btn-success:hover {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
}

.alert-confirm-btn.btn-warning {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  color: #ffffff;
  border: 1px solid #f59e0b;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35);
}

.alert-confirm-btn.btn-warning:hover {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

@keyframes alertPop {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

.toast-modal-pop-enter-active,
.toast-modal-pop-leave-active {
  transition: all 0.2s ease-out;
}
.toast-modal-pop-enter-from,
.toast-modal-pop-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
</style>
