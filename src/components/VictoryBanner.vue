<template>
  <div v-if="visible" class="victory-mask" @click.self="$emit('close')">
    <div class="victory-card">
      <!-- 左上角分享牌局功能按钮 (一图展示所有玩家的比牌) -->
      <button class="share-btn" title="一图全览并分享牌局" @click="openShareModal">
        📸 分享牌局
      </button>

      <!-- 右上角关闭按钮 (随时关闭弹窗查看牌桌) -->
      <button class="close-btn" title="查看牌桌" @click="$emit('close')">
        ✕
      </button>

      <!-- 冠军通告 (紧凑单行) -->
      <div class="winner-profile">
        <span class="crown-icon">👑</span>
        <span class="avatar">{{ winner?.avatar || '🤠' }}</span>
        <span class="w-name">{{ winner?.name || '神枪手' }} · 唯一幸存者</span>
      </div>

      <!-- 公共牌展示 (仅德州扑克模式) -->
      <div v-if="mode === 'TEXAS_POKER' && communityCards && communityCards.length > 0" class="final-comm-section">
        <div class="sec-title">🎴 牌堆公共牌</div>
        <div class="cards-row">
          <PokerCard
            v-for="(card, idx) in communityCards"
            :key="idx"
            :card="card"
            size="sm"
          />
        </div>
      </div>

      <!-- 玩家手牌与牌型排名 / 手骰与生存状态 -->
      <div class="all-players-recap">
        <div class="sec-title">
          {{ mode === 'LIARS_DICE' ? '👥 玩家手骰与生存状态' : (mode === 'LIARS_DECK' ? '👥 玩家手牌与决胜状态' : '👥 玩家手牌与牌型') }}
        </div>
        <div class="recap-list">
          <div
            v-for="p in players"
            :key="p.id"
            class="recap-row"
            :class="{ 'is-win': p.id === winner?.id, 'is-dead': !p.isAlive }"
          >
            <!-- 选手身份 -->
            <div class="p-left">
              <span class="p-av">{{ p.avatar }}</span>
              <span class="p-name">{{ p.name }}</span>
              <span class="p-stat">
                {{ p.id === winner?.id ? '🏆 冠军' : (mode === 'LIARS_DICE' && config?.punishType === 'POISON' ? '💀 暴毙' : (mode === 'LIARS_DECK' ? '💀 吞枪阵亡' : '💀 阵亡')) }}
              </span>
            </div>

            <!-- 显示第几大牌型 (仅德州扑克) -->
            <div v-if="mode === 'TEXAS_POKER' && getHandEval(p)" class="hand-eval-badge">
              <span class="rank-tier">第 {{ getHandEval(p).rankOrder }} 大牌型</span>
              <strong class="rank-name">{{ getHandEval(p).rankName }}</strong>
            </div>

            <!-- 选手手骰 (骗子骰子模式) -->
            <div v-if="mode === 'LIARS_DICE'" class="p-dice-list">
              <div v-for="(val, dIdx) in (p.dice || [])" :key="dIdx" class="vic-die-item">
                <RealDice
                  :value="typeof val === 'number' ? val : (val?.val || val?.value || 1)"
                  size="mini"
                />
              </div>
              <span class="p-punish-text">
                {{ config?.punishType === 'POISON' ? `毒药: ${p.poisonDrunk || 0}/2` : `枪击: ${p.bulletsFired || 0}次` }}
              </span>
            </div>

            <!-- 选手手牌 (扑克/纸牌模式) -->
            <div v-else class="p-cards">
              <template v-if="p.cards && p.cards.length > 0">
                <PokerCard
                  v-for="(c, cIdx) in p.cards"
                  :key="cIdx"
                  :card="c"
                  size="xs"
                />
              </template>
              <span v-else-if="mode === 'LIARS_DECK' && p.hasClearedCards" class="cleared-hand-tag">
                ✨ 手牌出清
              </span>
              <span v-if="mode === 'LIARS_DECK'" class="p-punish-text">
                扣枪: {{ p.shotsFired || p.bulletsFired || 0 }}次
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部多功能操作栏 (开启新一轮 / 返回房间 / 查看牌桌 / 解散 / 退出) -->
      <div class="vic-footer">
        <template v-if="isHost">
          <div class="action-grid host-grid">
            <button class="btn-act btn-restart" @click="$emit('restart')">
              🔥 开启新一轮
            </button>
            <button class="btn-act btn-lobby" @click="$emit('reset-lobby')">
              🔄 返回房间备战
            </button>
            <button class="btn-act btn-look" @click="$emit('close')">
              👀 查看牌桌
            </button>
            <button class="btn-act btn-disband" @click="$emit('cancel-room')">
              🚫 解散房间
            </button>
          </div>
        </template>
        <template v-else>
          <div class="player-tip">⏳ 等待房主开启新一轮或返回大厅...</div>
          <div class="action-grid player-grid">
            <button class="btn-act btn-look" @click="$emit('close')">
              👀 查看牌桌
            </button>
            <button class="btn-act btn-leave" @click="$emit('leave-room')">
              🚪 退出房间
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- 牌局一图全览海报分享弹窗 -->
    <div v-if="showShareModal" class="share-modal-mask" @click.self="showShareModal = false">
      <div class="share-modal-dialog">
        <div class="sm-header">
          <div class="sm-title">📸 牌局决胜 · 一图全览</div>
          <button class="sm-close" @click="showShareModal = false">✕</button>
        </div>

        <div class="sm-body">
          <div v-if="posterImgUrl" class="poster-img-wrap">
            <img :src="posterImgUrl" alt="牌局海报" class="poster-img" />
          </div>
          <div v-else class="poster-loading">
            ⏳ 正在绘制高清海报...
          </div>
        </div>

        <div class="sm-footer">
          <button class="sm-btn sm-save-img" @click="savePosterImage">
            💾 保存图片
          </button>
          <button class="sm-btn sm-cancel" @click="showShareModal = false">
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- 保存结果精致自定义弹窗 (彻底替换系统英文 Alert) -->
    <div v-if="saveTipVisible" class="save-tip-mask" @click="saveTipVisible = false">
      <div class="save-tip-card" @click.stop>
        <div class="st-icon">🎉</div>
        <div class="st-title">保存成功</div>
        <div class="st-msg">{{ saveTipMessage }}</div>
        <button class="st-btn" @click="saveTipVisible = false">好的</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import PokerCard from './PokerCard.vue';
import RealDice from './RealDice.vue';
import { sounds } from '../utils/audio';
import { evaluatePlayerHand } from '../utils/pokerConstants';
import { socketService } from '../api/socketService';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  players: {
    type: Array,
    default: () => []
  },
  communityCards: {
    type: Array,
    default: () => []
  },
  isHost: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'TEXAS'
  },
  config: {
    type: Object,
    default: () => ({})
  }
});

defineEmits(['restart', 'reset-lobby', 'close', 'cancel-room', 'leave-room']);

const winner = computed(() => {
  return props.players.find(p => p.isAlive) || props.players[0] || null;
});

function getHandEval(player) {
  if (player.handEvaluation) {
    return player.handEvaluation;
  }
  return evaluatePlayerHand(player.cards, props.communityCards);
}

// 分享牌局海报与文本
const showShareModal = ref(false);
const posterImgUrl = ref('');
const saveTipVisible = ref(false);
const saveTipMessage = ref('');

function openShareModal() {
  showShareModal.value = true;
  nextTick(() => {
    generatePosterImage();
  });
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawDieOnCanvas(ctx, val, x, y, size) {
  const r = size * 0.2;
  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, x, y, size, size, r, true, false);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, size, size, r, false, true);

  if (val === null || val === undefined || val === '?' || (typeof val === 'object' && val.hidden)) {
    ctx.fillStyle = '#64748b';
    ctx.font = `bold ${Math.round(size * 0.58)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + size / 2, y + size / 2);
    ctx.textBaseline = 'alphabetic';
    return;
  }

  const num = typeof val === 'number' ? val : (val.val || val.value || 1);
  const pipR = Math.max(1.6, size * 0.095);
  const isOne = num === 1;
  const pipColor = isOne ? '#dc2626' : (num === 4 ? '#991b1b' : '#1e293b');
  const actualPipR = isOne ? pipR * 1.5 : pipR;

  function drawPip(cx, cy, radius = actualPipR) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = pipColor;
    ctx.fill();
  }

  const p1 = size * 0.25;
  const p2 = size * 0.5;
  const p3 = size * 0.75;

  if (num === 1) {
    drawPip(x + p2, y + p2);
  } else if (num === 2) {
    drawPip(x + p1, y + p1);
    drawPip(x + p3, y + p3);
  } else if (num === 3) {
    drawPip(x + p1, y + p1);
    drawPip(x + p2, y + p2);
    drawPip(x + p3, y + p3);
  } else if (num === 4) {
    drawPip(x + p1, y + p1);
    drawPip(x + p3, y + p1);
    drawPip(x + p1, y + p3);
    drawPip(x + p3, y + p3);
  } else if (num === 5) {
    drawPip(x + p1, y + p1);
    drawPip(x + p3, y + p1);
    drawPip(x + p2, y + p2);
    drawPip(x + p1, y + p3);
    drawPip(x + p3, y + p3);
  } else if (num === 6) {
    drawPip(x + p1, y + p1);
    drawPip(x + p3, y + p1);
    drawPip(x + p1, y + p2);
    drawPip(x + p3, y + p2);
    drawPip(x + p1, y + p3);
    drawPip(x + p3, y + p3);
  }
}

function getCardRank(card) {
  if (!card) return '';
  return card.rank || card.label || (card.value ? String(card.value) : '');
}

function getCardSuit(card) {
  if (!card) return '';
  const s = card.suitSymbol || card.suit;
  if (s === 'spades' || s === '♠') return '♠';
  if (s === 'hearts' || s === '♥') return '♥';
  if (s === 'diamonds' || s === '♦') return '♦';
  if (s === 'clubs' || s === '♣') return '♣';
  return s || '';
}

function isCardRed(card) {
  if (!card) return false;
  const s = card.suitSymbol || card.suit;
  return s === 'hearts' || s === '♥' || s === 'diamonds' || s === '♦';
}

function drawCardOnCanvas(ctx, card, x, y, w, h) {
  // 扑克白底
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w, h, 4, true, false);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 4, false, true);

  if (!card || card.hidden) {
    ctx.fillStyle = '#7f1d1d';
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 2, true, false);
    return;
  }

  const rankStr = getCardRank(card);
  const suitStr = getCardSuit(card);
  const isRed = isCardRed(card);

  ctx.fillStyle = isRed ? '#dc2626' : '#0f172a';

  // 左上角点数 (A, K, Q, 10...)
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.max(9, Math.round(w * 0.4))}px -apple-system, sans-serif`;
  ctx.fillText(rankStr, x + 3, y + Math.round(h * 0.34));

  // 左上角小花色 (♠, ♥, ♦, ♣)
  ctx.font = `${Math.max(8, Math.round(w * 0.34))}px sans-serif`;
  ctx.fillText(suitStr, x + 3, y + Math.round(h * 0.62));

  // 牌面大花色
  ctx.textAlign = 'center';
  ctx.font = `${Math.max(12, Math.round(w * 0.52))}px sans-serif`;
  ctx.fillText(suitStr, x + w / 2 + 3, y + h - 5);
}

// 骗子纸牌专属卡牌绘制 (Devil 恶魔卡 / Joker 百搭牌 / Q K A 牌型高亮渲染)
function drawDeckCardOnCanvas(ctx, card, x, y, w, h) {
  if (!card || card.hidden) {
    ctx.fillStyle = '#7f1d1d';
    roundRect(ctx, x, y, w, h, 3, true, false);
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 3, false, true);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // 1. DEVIL 恶魔牌
  if (card.type === 'DEVIL' || card.rank === 'DEVIL') {
    ctx.fillStyle = '#3b0764';
    roundRect(ctx, x, y, w, h, 3, true, false);
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 3, false, true);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '13px sans-serif';
    ctx.fillText('😈', x + w / 2, y + h / 2 - 4);

    ctx.fillStyle = '#f472b6';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('恶魔', x + w / 2, y + h - 5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // 2. JOKER 百搭牌
  if (card.type === 'JOKER' || card.rank === 'JOKER') {
    ctx.fillStyle = '#78350f';
    roundRect(ctx, x, y, w, h, 3, true, false);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 3, false, true);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '13px sans-serif';
    ctx.fillText('🃏', x + w / 2, y + h / 2 - 4);

    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('百搭', x + w / 2, y + h - 5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // 3. 常规手牌 (Q, K, A)
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w, h, 3, true, false);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 3, false, true);

  const rankStr = card.rank || card.label || 'A';
  const suitStr = getCardSuit(card);
  const isRed = isCardRed(card);

  ctx.fillStyle = isRed ? '#dc2626' : '#0f172a';

  // 左上角字母
  ctx.textAlign = 'left';
  ctx.font = '900 11px -apple-system, sans-serif';
  ctx.fillText(rankStr, x + 3, y + 11);

  // 左上小花色
  ctx.font = '8px sans-serif';
  ctx.fillText(suitStr, x + 3, y + 20);

  // 牌心大花色
  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';
  ctx.fillText(suitStr, x + w / 2 + 4, y + h - 4);
  ctx.textAlign = 'left';
}

function generatePosterImage() {
  try {
    const canvas = document.createElement('canvas');
    const dpr = 2; // 2x 高清绘制
    const width = 640;

    // 骗子骰子模式专属海报绘制 (与图一完全一致)
    if (props.mode === 'LIARS_DICE') {
      const pCount = Math.max(props.players?.length || 2, 2);
      const height = 260 + pCount * 56;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // 1. 深色精致酒吧背景
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#131826');
      bgGrad.addColorStop(1, '#0a0d15');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 金黄边框
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      roundRect(ctx, 8, 8, width - 16, height - 16, 12, false, true);

      // 2. 顶栏主标题
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍻 骗子酒馆 · 骗子骰子决胜', width / 2, 38);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const nowStr = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const punishDesc = props.config?.punishType === 'POISON' ? '2瓶毒药生死决胜' : '6孔左轮生死决胜';
      ctx.fillText(`对决时间：${nowStr}  ·  ${punishDesc}`, width / 2, 56);

      // 3. 冠军幸存者展示横幅
      ctx.fillStyle = '#1e2638';
      roundRect(ctx, 24, 68, width - 48, 50, 8, true, false);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      roundRect(ctx, 24, 68, width - 48, 50, 8, false, true);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      const winName = winner.value?.name || '神枪手';
      const rawAv = winner.value?.avatar || '🤠';
      const winAvStr = rawAv === '👑' ? '' : `${rawAv} `;
      ctx.fillText(`👑 ${winAvStr}${winName} · 唯一幸存者 / 最终胜者`, 38, 99);

      if (props.config?.punishType === 'POISON') {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`[存活毒药: 喝了${winner.value?.poisonDrunk || 0}/2瓶]`, width - 38, 99);
      } else {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`[轮盘存活: 扣动${winner.value?.bulletsFired || 0}枪生还]`, width - 38, 99);
      }

      // 4. 各玩家手骰与生存状态药丸底框
      const playerPillX = 36;
      const playerPillY = 132;
      const playerPillW = 160;
      const playerPillH = 26;
      ctx.fillStyle = '#1c2333';
      roundRect(ctx, playerPillX, playerPillY, playerPillW, playerPillH, 6, true, false);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1;
      roundRect(ctx, playerPillX, playerPillY, playerPillW, playerPillH, 6, false, true);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('👥 玩家手骰与生存状态', playerPillX + playerPillW / 2, playerPillY + playerPillH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      let curY = 172;
      (props.players || []).forEach((p) => {
        const isW = p.id === winner.value?.id || p.isWinner;
        ctx.fillStyle = isW ? 'rgba(234, 179, 8, 0.12)' : '#171c28';
        roundRect(ctx, 24, curY, width - 48, 46, 6, true, false);
        ctx.strokeStyle = isW ? '#eab308' : '#2b3347';
        ctx.lineWidth = 1;
        roundRect(ctx, 24, curY, width - 48, 46, 6, false, true);

        // 头像与姓名
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${p.avatar || '🤠'} ${p.name}`, 36, curY + 28);

        // 身份印章 (冠军/阵亡/暴毙)
        if (isW) {
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('🏆 冠军', 160, curY + 28);
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 11px sans-serif';
          const failText = props.config?.punishType === 'POISON' ? '💀 暴毙' : '💀 阵亡';
          ctx.fillText(failText, 160, curY + 28);
        }

        // 手骰 (支持 3 ~ 10 颗自适应间距)
        const pDice = (p.dice && p.dice.length > 0) ? p.dice : ['?', '?', '?', '?', '?'];
        const dieSize = pDice.length > 6 ? 24 : 28;
        const dieGap = pDice.length > 6 ? 4 : 6;
        const startX = 225;
        pDice.forEach((d, dIdx) => {
          const val = typeof d === 'number' ? d : (d?.val || d?.value || '?');
          drawDieOnCanvas(ctx, val, startX + dIdx * (dieSize + dieGap), curY + 9, dieSize);
        });

        // 右侧生存状态
        ctx.textAlign = 'right';
        ctx.font = '11px sans-serif';
        if (props.config?.punishType === 'POISON') {
          ctx.fillStyle = p.poisonDrunk >= 2 ? '#ef4444' : '#10b981';
          ctx.fillText(`毒药: ${p.poisonDrunk || 0}/2`, width - 36, curY + 28);
        } else {
          ctx.fillStyle = !p.isAlive ? '#ef4444' : '#10b981';
          ctx.fillText(`枪击: ${p.bulletsFired || 0}次`, width - 36, curY + 28);
        }

        curY += 54;
      });

      posterImgUrl.value = canvas.toDataURL('image/png');
      return;
    }

    // 骗子纸牌模式专属海报绘制 (无公共牌、绘制全手牌含恶魔/百搭、恶魔左轮轮盘战绩)
    if (props.mode === 'LIARS_DECK') {
      const pCount = Math.max(props.players?.length || 2, 2);
      const height = 260 + pCount * 56;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // 1. 深色精致酒吧背景
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#131826');
      bgGrad.addColorStop(1, '#0a0d15');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 金黄边框
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      roundRect(ctx, 8, 8, width - 16, height - 16, 12, false, true);

      // 2. 顶栏主标题
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🃏 骗子酒馆 · 骗子纸牌恶魔决胜', width / 2, 38);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const nowStr = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      ctx.fillText(`对决时间：${nowStr}  ·  恶魔左轮生死决胜`, width / 2, 56);

      // 3. 冠军幸存者展示横幅
      ctx.fillStyle = '#1e2638';
      roundRect(ctx, 24, 68, width - 48, 50, 8, true, false);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      roundRect(ctx, 24, 68, width - 48, 50, 8, false, true);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      const winName = winner.value?.name || '神枪手';
      const rawAv = winner.value?.avatar || '🤠';
      const winAvStr = rawAv === '👑' ? '' : `${rawAv} `;
      ctx.fillText(`👑 ${winAvStr}${winName} · 唯一幸存者 / 最终胜者`, 38, 99);

      const winShots = winner.value?.shotsFired || winner.value?.bulletsFired || 0;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`[轮盘存活: 扣动${winShots}枪生还]`, width - 38, 99);

      // 4. 各玩家手牌与决胜状态药丸底框
      const playerPillX = 36;
      const playerPillY = 132;
      const playerPillW = 160;
      const playerPillH = 26;
      ctx.fillStyle = '#1c2333';
      roundRect(ctx, playerPillX, playerPillY, playerPillW, playerPillH, 6, true, false);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1;
      roundRect(ctx, playerPillX, playerPillY, playerPillW, playerPillH, 6, false, true);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('👥 玩家手牌与决胜状态', playerPillX + playerPillW / 2, playerPillY + playerPillH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      let curY = 172;
      (props.players || []).forEach((p) => {
        const isW = p.id === winner.value?.id || p.isWinner;
        ctx.fillStyle = isW ? 'rgba(234, 179, 8, 0.12)' : '#171c28';
        roundRect(ctx, 24, curY, width - 48, 46, 6, true, false);
        ctx.strokeStyle = isW ? '#eab308' : '#2b3347';
        ctx.lineWidth = 1;
        roundRect(ctx, 24, curY, width - 48, 46, 6, false, true);

        // 头像与姓名
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${p.avatar || '🤠'} ${p.name}`, 36, curY + 28);

        // 身份印章 (冠军/吞枪阵亡)
        if (isW) {
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('🏆 冠军', 155, curY + 28);
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('💀 吞枪阵亡', 155, curY + 28);
        }

        // 手牌绘制 (全量展示，恶魔/百搭/花色牌面)
        const pCards = p.cards || [];
        const startX = 226;
        if (pCards.length > 0) {
          const cardW = 24;
          const cardH = 34;
          const cardGap = 5;
          pCards.forEach((c, cIdx) => {
            drawDeckCardOnCanvas(ctx, c, startX + cIdx * (cardW + cardGap), curY + 6, cardW, cardH);
          });
        } else if (p.hasClearedCards) {
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('✨ 手牌全部出清', startX, curY + 28);
        } else {
          ctx.fillStyle = '#64748b';
          ctx.font = '12px sans-serif';
          ctx.fillText('手牌已清空', startX, curY + 28);
        }

        // 右侧扣枪生还状态
        const shots = p.shotsFired || p.bulletsFired || 0;
        ctx.textAlign = 'right';
        ctx.font = '11px sans-serif';
        ctx.fillStyle = !p.isAlive ? '#ef4444' : '#10b981';
        ctx.fillText(`扣枪: ${shots}次`, width - 36, curY + 28);

        curY += 54;
      });

      posterImgUrl.value = canvas.toDataURL('image/png');
      return;
    }

    const pCount = Math.max(props.players?.length || 2, 2);
    const height = 300 + pCount * 54;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 深色精致酒吧背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#131826');
    bgGrad.addColorStop(1, '#0a0d15');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 金黄边框
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    roundRect(ctx, 8, 8, width - 16, height - 16, 12, false, true);

    // 2. 顶栏主标题
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    let titleStr = '🍻 骗子酒馆 · 德州生死决胜';
    let subtitleStr = '8孔左轮生死决胜';
    ctx.fillText(titleStr, width / 2, 38);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowStr = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    ctx.fillText(`对决时间：${nowStr}  ·  ${subtitleStr}`, width / 2, 56);

    // 3. 冠军幸存者展示横幅
    ctx.fillStyle = '#1e2638';
    roundRect(ctx, 24, 68, width - 48, 50, 8, true, false);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 24, 68, width - 48, 50, 8, false, true);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    const winName = winner.value?.name || '神枪手';
    const rawAv = winner.value?.avatar || '👑';
    const winAvStr = rawAv === '👑' ? '' : `${rawAv} `;
    ctx.fillText(`👑 ${winAvStr}${winName} · 唯一幸存者 / 最终胜者`, 38, 99);

    const winEval = winner.value ? getHandEval(winner.value) : null;
    if (winEval) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`[第 ${winEval.rankOrder} 大牌型: ${winEval.rankName}]`, width - 38, 99);
    }

    // 4. 公共牌展示区 (带有精致暗色药丸底框，居中对齐防遮挡)
    const commPillX = 36;
    const commPillY = 131;
    const commPillW = 160;
    const commPillH = 26;
    ctx.fillStyle = '#1c2333';
    roundRect(ctx, commPillX, commPillY, commPillW, commPillH, 6, true, false);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    roundRect(ctx, commPillX, commPillY, commPillW, commPillH, 6, false, true);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('🎴 桌心公共牌 (5张)', commPillX + commPillW / 2, commPillY + commPillH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const commCards = props.communityCards || [];
    const cardW = 34;
    const cardH = 48;
    const startX = 210;
    commCards.forEach((c, idx) => {
      drawCardOnCanvas(ctx, c, startX + idx * (cardW + 8), 124, cardW, cardH);
    });

    // 5. 分割线
    ctx.strokeStyle = '#273142';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 186);
    ctx.lineTo(width - 24, 186);
    ctx.stroke();

    // 6. 各玩家手牌与决胜牌型清单 (带有精致金色药丸底框，文本精确居中对齐框内)
    const playerPillX = 36;
    const playerPillY = 196;
    const playerPillW = 160;
    const playerPillH = 26;
    ctx.fillStyle = '#1c2333';
    roundRect(ctx, playerPillX, playerPillY, playerPillW, playerPillH, 6, true, false);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1;
    roundRect(ctx, playerPillX, playerPillY, playerPillW, playerPillH, 6, false, true);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('👥 玩家手牌与牌型', playerPillX + playerPillW / 2, playerPillY + playerPillH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let curY = 232;
    (props.players || []).forEach((p) => {
      const isW = p.id === winner.value?.id;
      // 玩家卡行底色
      ctx.fillStyle = isW ? 'rgba(234, 179, 8, 0.12)' : '#171c28';
      roundRect(ctx, 24, curY, width - 48, 44, 6, true, false);
      ctx.strokeStyle = isW ? '#eab308' : '#2b3347';
      ctx.lineWidth = 1;
      roundRect(ctx, 24, curY, width - 48, 44, 6, false, true);

      // 玩家头像与姓名
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${p.avatar || '🤠'} ${p.name}`, 36, curY + 27);

      // 身份印章 (冠军/阵亡)
      if (isW) {
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('🏆 冠军', 160, curY + 27);
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('💀 阵亡', 160, curY + 27);
      }

      // 2 张手牌
      const pCards = p.cards || [];
      if (pCards[0]) drawCardOnCanvas(ctx, pCards[0], 215, curY + 4, 24, 35);
      if (pCards[1]) drawCardOnCanvas(ctx, pCards[1], 245, curY + 4, 24, 35);

      // 牌型评级
      const pEval = getHandEval(p);
      if (pEval) {
        ctx.textAlign = 'right';
        ctx.fillStyle = isW ? '#fef08a' : '#94a3b8';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`第 ${pEval.rankOrder} 大牌型: ${pEval.rankName}`, width - 36, curY + 27);
      }

      curY += 52;
    });

    posterImgUrl.value = canvas.toDataURL('image/png');
  } catch (err) {
    console.error('生成海报图片异常:', err);
  }
}

async function savePosterImage() {
  if (!posterImgUrl.value) return;

  let localSaved = false;

  // 1. Android 原生桥梁直存 (ColorOS / 全系 Android 原生标准相册 MediaStore 插入)
  if (typeof window !== 'undefined' && window.AndroidDevice && typeof window.AndroidDevice.saveImageToGallery === 'function') {
    try {
      const ok = window.AndroidDevice.saveImageToGallery(posterImgUrl.value);
      if (ok) {
        localSaved = true;
      }
    } catch (e) {
      console.warn('Android 原生保存异常:', e);
    }
  }

  // 2. WebSocket 直连推送 (针对移动端 App WebView，直通本地 Node 写入相册)
  try {
    socketService.send('SAVE_POSTER', { dataUrl: posterImgUrl.value });
    localSaved = true;
  } catch (wsErr) {
    console.warn('WS 保存海报失败:', wsErr);
  }

  // 3. HTTP 局域网服务接口多候选兜底保存
  const candidateUrls = [
    'http://127.0.0.1:9527/api/save-poster',
    'http://localhost:9527/api/save-poster'
  ];
  if (typeof window !== 'undefined' && window.location.hostname) {
    candidateUrls.push(`http://${window.location.hostname}:9527/api/save-poster`);
  }

  for (const apiUrl of candidateUrls) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: posterImgUrl.value }),
        signal: AbortSignal.timeout(1500)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          localSaved = true;
          break;
        }
      }
    } catch (_) {}
  }

  // 4. 浏览器标准下载兜底 (方便电脑端/手机浏览器用户)
  try {
    const a = document.createElement('a');
    a.href = posterImgUrl.value;
    a.download = `骗子酒馆_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 300);
  } catch (_) {}

  // 5. 纯中式精致弹窗反馈 (彻底摒弃英文 Alert 弹窗)
  saveTipMessage.value = localSaved ? '图片已保存至手机相册！' : '图片已保存下载！';
  saveTipVisible.value = true;
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      sounds.playVictory();
    } else {
      showShareModal.value = false;
      posterImgUrl.value = '';
    }
  }
);
</script>

<style scoped>
.victory-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

.victory-card {
  position: relative;
  width: 100%;
  max-width: 540px;
  background: #141722;
  border: 2px solid #fbbf24;
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 0 40px rgba(251, 191, 36, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-height: 94vh;
  overflow-y: auto;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 2;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.crown-icon {
  font-size: 26px;
  animation: float 2s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.winner-profile {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.winner-profile .avatar {
  font-size: 24px;
}

.winner-profile .w-name {
  font-size: 15px;
  font-weight: 800;
  color: #fbbf24;
}

.final-comm-section, .all-players-recap {
  width: 100%;
}

.sec-title {
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
  margin-bottom: 5px;
  padding-left: 24px;
}

.cards-row {
  display: flex;
  gap: 6px;
  justify-content: center;
  background: #1a1f2e;
  border: 1px solid #2d364f;
  border-radius: 8px;
  padding: 6px 10px;
}

.recap-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.recap-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #171b28;
  border: 1px solid #282f42;
  border-radius: 8px;
  padding: 5px 10px;
  gap: 8px;
}

.recap-row.is-win {
  border-color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
}

.recap-row.is-dead {
  opacity: 0.7;
}

.p-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 100px;
}

.p-av {
  font-size: 18px;
}

.p-name {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
}

.p-stat {
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
}

.is-win .p-stat {
  color: #fbbf24;
}

/* 第几大牌型胶囊 */
.hand-eval-badge {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #202637;
  border-radius: 5px;
  padding: 2px 6px;
  border: 1px solid #2f384f;
}

.rank-tier {
  font-size: 9px;
  font-weight: 800;
  color: #fbbf24;
}

.rank-name {
  font-size: 11px;
  font-weight: 700;
  color: #f8fafc;
}

.p-cards {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cleared-hand-tag {
  font-size: 11px;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.p-dice-list {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: flex-end;
}

.vic-die-item {
  display: inline-flex;
}

.p-punish-text {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  margin-left: 8px;
  white-space: nowrap;
}

.vic-footer {
  width: 100%;
  margin-top: 4px;
}

.player-tip {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  margin-bottom: 8px;
}

.action-grid {
  display: grid;
  gap: 8px;
  width: 100%;
}

.host-grid {
  grid-template-columns: 1fr 1fr;
}

.player-grid {
  grid-template-columns: 1fr 1fr;
}

.btn-act {
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.btn-restart {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
}

.btn-restart:hover {
  filter: brightness(1.1);
}

.btn-lobby {
  background: #1e293b;
  border-color: #3b82f6;
  color: #60a5fa;
}

.btn-lobby:hover {
  background: #2563eb;
  color: #ffffff;
}

.btn-look {
  background: #1e293b;
  border-color: #475569;
  color: #e2e8f0;
}

.btn-look:hover {
  background: #334155;
  color: #ffffff;
}

.btn-disband {
  background: #450a0a;
  border-color: #991b1b;
  color: #fca5a5;
}

.btn-disband:hover {
  background: #dc2626;
  color: #ffffff;
}

.btn-leave {
  background: #450a0a;
  border-color: #991b1b;
  color: #fca5a5;
}

.btn-leave:hover {
  background: #dc2626;
  color: #ffffff;
}

@media (max-height: 560px), (max-width: 900px) {
  .victory-card {
    padding: 8px 14px;
    gap: 4px;
    max-height: 98vh;
  }
  .share-btn {
    top: 6px;
    left: 8px;
    padding: 2px 8px;
    font-size: 10px;
  }
  .close-btn {
    top: 6px;
    right: 8px;
    width: 24px;
    height: 24px;
    font-size: 12px;
  }
  .winner-profile .avatar {
    font-size: 20px;
  }
  .crown-icon {
    font-size: 18px;
  }
  .winner-profile .w-name {
    font-size: 13px;
  }
  .sec-title {
    font-size: 11px;
    margin-bottom: 3px;
    padding-left: 18px;
  }
  .cards-row {
    padding: 3px 6px;
    gap: 4px;
  }
  .cards-row :deep(.card) {
    width: 30px !important;
    height: 42px !important;
    border-radius: 4px !important;
    padding: 2px !important;
  }
  .cards-row :deep(.corner-val) {
    font-size: 9px !important;
  }
  .cards-row :deep(.corner-suit) {
    font-size: 7px !important;
  }
  .cards-row :deep(.pip-suit) {
    font-size: 13px !important;
  }
  .recap-row {
    padding: 3px 8px;
    gap: 6px;
  }
  .p-left {
    min-width: 80px;
  }
  .p-name {
    font-size: 11px;
    max-width: 60px;
  }
  .p-cards :deep(.card) {
    width: 24px !important;
    height: 35px !important;
    border-radius: 3px !important;
    padding: 1px !important;
  }
  .p-cards :deep(.corner-val) {
    font-size: 8px !important;
  }
  .p-cards :deep(.corner-suit) {
    font-size: 6px !important;
  }
  .p-cards :deep(.pip-suit) {
    font-size: 10px !important;
  }
  .hand-eval-badge {
    padding: 1px 5px;
  }
  .rank-tier {
    font-size: 8px;
  }
  .rank-name {
    font-size: 10px;
  }
  .btn-act {
    padding: 5px 8px;
    font-size: 11px;
  }
}

.share-btn {
  position: absolute;
  top: 10px;
  left: 12px;
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid #eab308;
  border-radius: 20px;
  color: #fef08a;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 2;
}

.share-btn:hover {
  background: rgba(234, 179, 8, 0.3);
  transform: scale(1.05);
}

/* 分享海报弹窗 */
.share-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  animation: fadeIn 0.2s ease-out;
}

.share-modal-dialog {
  width: 100%;
  max-width: 580px;
  background: #141724;
  border: 2px solid #eab308;
  border-radius: 14px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 96vh;
  box-shadow: 0 0 35px rgba(234, 179, 8, 0.35);
}

.sm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #283044;
  padding-bottom: 6px;
}

.sm-title {
  font-size: 14px;
  font-weight: 800;
  color: #fde047;
}

.sm-close {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
}

.sm-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow-y: auto;
  max-height: 65vh;
  padding: 8px 0;
}

.poster-img-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto;
}

.poster-img {
  display: block;
  margin: 0 auto;
  max-width: 95%;
  max-height: 58vh;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  object-fit: contain;
  -webkit-touch-callout: default !important;
  user-select: auto !important;
  -webkit-user-select: auto !important;
  pointer-events: auto !important;
  touch-action: pan-y !important;
}

.poster-loading {
  font-size: 13px;
  color: #fbbf24;
  padding: 40px 0;
}

.sm-footer {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.sm-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.sm-save-img {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}
.sm-save-img:hover {
  filter: brightness(1.1);
}

.sm-cancel {
  background: #1e293b;
  color: #94a3b8;
  border-color: #334155;
}

/* 保存结果精美中式弹窗 (彻底替换系统英文 Alert) */
.save-tip-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.15s ease-out;
}

.save-tip-card {
  background: linear-gradient(145deg, #181d2c 0%, #111420 100%);
  border: 2px solid #fbbf24;
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(251, 191, 36, 0.3);
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: 260px;
  max-width: 90vw;
  animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.st-icon {
  font-size: 32px;
  margin-bottom: 6px;
}

.st-title {
  font-size: 16px;
  font-weight: 800;
  color: #fbbf24;
  margin-bottom: 6px;
}

.st-msg {
  font-size: 14px;
  color: #f1f5f9;
  font-weight: 600;
  margin-bottom: 16px;
}

.st-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
  border: none;
  border-radius: 8px;
  padding: 8px 32px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  transition: transform 0.1s, filter 0.1s;
}

.st-btn:active {
  transform: scale(0.96);
  filter: brightness(0.9);
}

@keyframes popIn {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
