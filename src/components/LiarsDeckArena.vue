<template>
  <div class="game-stage liars-deck-stage">
    <!-- 左上角常驻轻量胶囊区 (纯净菜单与终局重开战报入口，以及位于菜单正下方的目标牌) -->
    <div v-if="!headerExpanded" class="top-left-dock">
      <div class="top-collapsed-bar">
        <button
          class="header-toggle-pill"
          title="展开酒馆完整菜单与规则设置"
          @click="headerExpanded = true"
        >
          <span class="icon">☰</span>
          <span class="txt">菜单</span>
        </button>

        <!-- 终局战报浮动按钮 (当战报弹窗被关闭且对局结束时常驻显示) -->
        <button
          v-if="state.status === 'GAME_OVER'"
          class="victory-reopen-pill"
          title="查看终局战报与胜负排名"
          @click="$emit('open-victory')"
        >
          🏆 战报 / 重新开局
        </button>
      </div>

      <!-- 纸牌模式目标牌：紧随菜单正下方，清晰显眼，彻底不遮挡左侧玩家与牌桌 -->
      <div class="target-card-spotlight under-menu-target">
        <div class="spotlight-badge">👑 目标牌</div>
        <div v-if="state.status !== 'LOBBY' && state.tableCard" class="target-card-val">
          <span class="target-icon">{{ state.tableCard?.symbol || '👑' }}</span>
          <span class="target-label">{{ state.tableCard?.label }}</span>
        </div>
        <div v-else class="target-card-val waiting-lobby">
          <span class="target-label lobby-hint-txt">待公布</span>
        </div>
      </div>
    </div>

    <!-- 右上角观战提示胶囊 (常驻右上角，文字极简，只显示观战谁) -->
    <div v-if="isDeadSpectator && spectatingPlayer" class="top-spectator-badge">
      <span class="spec-badge-eye">👀</span>
      <span class="spec-badge-text">观战中: <strong class="target-name">【{{ spectatingPlayer.name }}】</strong></span>
    </div>

    <!-- 展开菜单时的点击其他区域收起透明遮罩 -->
    <div
      v-if="headerExpanded"
      class="header-click-outside-backdrop"
      @click="headerExpanded = false"
    ></div>

    <!-- 顶部状态栏与工具区 -->
    <header v-show="headerExpanded" class="game-header" @click.stop>
      <div class="brand-zone">
        <span class="logo">😈</span>
        <div class="title-wrap">
          <h2>
            骗子纸牌 · 恶魔模式
            <span v-if="isHost" class="host-pill">房主</span>
          </h2>
        </div>
      </div>

      <div class="header-actions">
        <!-- 终局战报入口 -->
        <button
          v-if="state.status === 'GAME_OVER'"
          class="icon-tool-btn victory-header-btn"
          title="查看终局战报与胜负排名"
          @click="$emit('open-victory')"
        >
          🏆 终局战报
        </button>

        <!-- 联机链接胶囊 -->
        <div class="lan-pill" title="查看并复制联机加入链接" @click="showLinkModal = true">
          <span class="dot"></span>
          <span class="ip-txt">🔗 联机链接: {{ displayShortUrl }}</span>
          <span class="copy-icon">📋</span>
        </div>

        <button class="icon-tool-btn" title="查看恶魔模式官方规则" @click="showDevilRules = true">
          📜 恶魔规则
        </button>

        <!-- 房主专用：规则定制 -->
        <button
          v-if="isHost && state.status === 'LOBBY'"
          class="icon-tool-btn"
          title="房间规则定制"
          @click="showSettingsModal = true"
        >
          ⚙️ 规则设置
        </button>

        <!-- 房主专用：取消/解散房间 -->
        <button
          v-if="isHost"
          class="cancel-room-btn"
          title="随时解散当前骗子酒馆房间"
          @click="$emit('cancel-room')"
        >
          🚫 取消房间
        </button>

        <!-- 玩家专用：退出酒馆 -->
        <button
          v-else
          class="leave-room-btn"
          title="退出当前酒馆返回大厅"
          @click="$emit('leave-room')"
        >
          🚪 退出酒馆
        </button>

        <!-- 收起菜单按钮 -->
        <button class="icon-tool-btn collapse-btn" title="收起菜单栏" @click="headerExpanded = false">
          ▲ 收起
        </button>
      </div>
    </header>

    <!-- 牌桌主体核心区 (美式复古酒馆深邃台面) -->
    <main class="table-container">
      <div class="poker-felt devil-felt">
        <!-- 牌桌中心核心区域 -->
        <div class="center-stage">
          <!-- 质疑验牌现场 (直接在牌桌中心展示，绝不用弹窗) -->
          <div v-if="state.status === 'CHALLENGE_REVEAL' && state.revealEvent" class="table-reveal-stage">
            <!-- 阶段 1：悬念等待阶段 (等一会再给出结果) -->
            <div v-if="state.revealEvent.phase === 'SUSPENSE'" class="reveal-suspense-box">
              <div class="suspense-title">
                <span class="pulse-warning">⚠️</span>
                <span>【{{ state.revealEvent.challenger?.name }}】质疑【{{ state.revealEvent.liar?.name }}】！</span>
              </div>
              <div class="suspense-cards-row">
                <div v-for="i in (state.revealEvent.cardsCount || 1)" :key="i" class="suspense-card-back"></div>
              </div>
              <div class="suspense-sub">正在翻开桌上暗牌...</div>
            </div>

            <!-- 阶段 2：结果揭晓阶段 (在桌面上直接翻开) -->
            <div v-else class="reveal-result-box" :class="`type-${state.revealEvent.type}`">
              <div class="result-badge-line">
                <span class="result-badge" :class="`badge-${state.revealEvent.type}`">
                  {{ getResultBadgeText(state.revealEvent.type) }}
                </span>
                <span class="result-headline">{{ state.revealEvent.message }}</span>
              </div>

              <!-- 桌面翻开验证的卡牌 -->
              <div class="revealed-cards-inline">
                <PokerCard
                  v-for="(c, idx) in state.revealEvent.cards"
                  :key="idx"
                  :card="c"
                  size="sm"
                />
              </div>
            </div>
          </div>

          <!-- 阶段 0：大厅等待开局 -->
          <div v-else-if="state.status === 'LOBBY'" class="deck-lobby-center">
            <div class="lobby-badge">🃏 恶魔纸牌大厅 · 准备中</div>
            <div class="lobby-sub">当前在座：{{ (state.players || []).length }} / {{ (state.config && state.config.maxPlayers) || 4 }} 人</div>
          </div>

          <!-- 非验牌阶段展示常规桌面牌堆与声明 -->
          <template v-else>
            <!-- 桌面暗牌堆 (Table Pile) -->
            <div class="table-pile-wrapper">
              <div class="pile-cards-visual">
                <div
                  v-for="i in Math.min(6, state.tableCardsCount || 0)"
                  :key="i"
                  class="pile-card-layer"
                  :style="{ transform: `rotate(${(i - 3) * 6}deg) translateY(-${i * 2}px)` }"
                >
                  <div class="mini-card-back"></div>
                </div>
                <div v-if="!state.tableCardsCount" class="empty-pile-placeholder">
                  <span class="empty-icon">📭</span>
                  <span class="empty-txt">暂无出牌</span>
                </div>
              </div>

              <div class="pile-counter-pill">
                <span class="pile-icon">🗂️</span>
                <span class="pile-num">暗牌: <strong>{{ state.tableCardsCount || 0 }}</strong> 张</span>
              </div>
            </div>

            <!-- 上一位玩家出牌声明 -->
            <div v-if="state.lastPlay" class="last-play-statement">
              <div class="statement-avatar">{{ state.lastPlay.avatar || '🤠' }}</div>
              <div class="statement-content">
                <div class="statement-title">
                  <strong>【{{ state.lastPlay.playerName }}】</strong> 声明打出：
                </div>
                <div class="statement-claim">
                  <span class="claim-count">{{ state.lastPlay.count }} 张</span>
                  <span class="claim-rank">{{ state.lastPlay.claimedRank }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 回合行动倒计时与当前行动者 -->
          <div v-if="state.status === 'PLAYING'" class="turn-status-banner">
            <span class="acting-name">
              {{ isMyTurn ? '🔥 您的回合' : `⏳ 等待【${currentTurnPlayer?.name || '对手'}】` }}
            </span>
            <span
              v-if="!state.config?.disableTurnTimer"
              class="acting-timer"
              :class="{ 'timer-urgent': remainingSeconds <= 5 }"
            >
              {{ remainingSeconds }}s
            </span>
          </div>
        </div>

        <!-- 四周玩家席位环形布局 (Top, Left, Right, Bottom/Me) -->
        <div class="players-ring">
          <div
            v-for="(player, seatIdx) in positionedPlayers"
            :key="player.id"
            class="player-seat"
            :class="[
              `seat-pos-${player.position}`,
              {
                'is-turn': state.currentTurnPlayerId === player.id && state.status === 'PLAYING',
                'is-dead': isPlayerDead(player),
                'is-me': player.id === myId,
                'is-safe': player.hasClearedCards,
                'is-spectating': isDeadSpectator && player.id === effectiveViewerId,
                'can-click-spectate': isDeadSpectator && player.isAlive && player.id !== effectiveViewerId
              }
            ]"
            :title="isDeadSpectator && player.isAlive ? '点击切换为此观战视角' : ''"
            @click="onSeatClick(player)"
          >
            <!-- 席位头部：头像、状态、轮盘 Overlay -->
            <div class="seat-top">
              <!-- 头顶开枪浮层 (俄罗斯轮盘赌) -->
              <HeadShooterOverlay
                v-if="state.rouletteEvent && (state.rouletteEvent.playerId === player.id || state.rouletteEvent.player?.id === player.id)"
                :event="state.rouletteEvent"
                :is-spinning="headShooting"
                :is-revealed="headRevealed"
              />

              <!-- 头顶开枪看板 (开枪数量与存活概率) -->
              <div
                v-if="player.isAlive"
                class="seat-gun-bar"
                :title="`已扣动 ${player.shotsFired || 0} 枪，存活率: ${player.surviveChance || '5/6'} (${player.survivePercent ?? 83}%)`"
              >
                <span class="gun-ico">🔫</span>
                <span class="gun-shots">已开{{ player.shotsFired || 0 }}枪</span>
                <span class="gun-divider">·</span>
                <span class="gun-survive">{{ player.surviveChance || '5/6' }}存活</span>
                <div class="mini-cyl-dots">
                  <span
                    v-for="c in 6"
                    :key="c"
                    class="cyl-dot"
                    :class="{
                      'dot-fired': c <= (player.shotsFired || 0),
                      'dot-danger': c === (player.shotsFired || 0) + 1,
                      'dot-empty': c > (player.shotsFired || 0) + 1
                    }"
                  ></span>
                </div>
              </div>

              <div class="avatar-box" :class="{ 'is-offline': player.isOffline }">
                <span class="avatar">{{ player.avatar }}</span>
                <span v-if="player.isHost && player.avatar !== '👑'" class="host-crown" title="房主">👑</span>
                <span v-if="player.isOffline" class="offline-badge" title="玩家已断线，AI托管中">🔌 离线</span>
                <span v-else-if="player.isBot" class="bot-badge">AI</span>
                <span v-if="player.id === myId" class="me-badge">我</span>
                <span v-if="isDeadSpectator && player.id === effectiveViewerId" class="spec-badge">观战</span>
              </div>

              <div class="seat-user">
                <div class="uname">
                  {{ player.name }}
                  <span v-if="player.isBot && player.personality && !player.isOffline" class="bot-style-tag">[{{ player.personality }}]</span>
                  <span v-else-if="player.isOffline" class="offline-tag">[AI代打]</span>
                  <span v-if="player.id === myId" class="me-tag">(本人)</span>
                  <span v-else-if="isDeadSpectator && player.id === effectiveViewerId" class="spec-tag">(观战视角)</span>
                </div>
                <div v-if="getSeatStatusText(player)" class="status-tag" :class="getSeatStatusClass(player)">
                  {{ getSeatStatusText(player) }}
                </div>
              </div>
            </div>

            <!-- 玩家手牌数量或暗牌展示 (非主视角展示牌背数量；阵亡透视下全景展示明牌) -->
            <div v-if="player.id !== effectiveViewerId" class="opponent-hand-cards">
              <!-- 阵亡全景透视：在席位直接透视明牌 (仅当未开启观战无透视时展示) -->
              <div v-if="isDeadSpectator && !state.config?.disableSpectatorXray && player.isAlive && (player.cards || []).length > 0" class="spectator-opponent-cards">
                <PokerCard
                  v-for="(card, cIdx) in player.cards"
                  :key="card.id || cIdx"
                  :card="card"
                  size="xs"
                  :face-down="false"
                />
              </div>
              <div v-else-if="player.isAlive && !player.hasClearedCards" class="card-count-badge">
                <span class="c-icon">🃏</span>
                <span class="c-num">{{ player.cardCount || player.cards?.length || 0 }} 张手牌</span>
              </div>
              <div v-else-if="player.hasClearedCards" class="cleared-badge">
                🎉 手牌已清空
              </div>
              <div v-else class="dead-badge">
                💀 中弹阵亡
              </div>
            </div>

            <!-- 大厅阶段踢人按钮 -->
            <button
              v-if="isHost && state.status === 'LOBBY' && !player.isHost"
              class="kick-btn"
              title="请出酒馆"
              @click="$emit('remove-player', player.id)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部操作与决策控制台 (仿照德州扑克紧凑单栏架构) -->
    <footer class="deck-control-footer">
      <!-- 战报流水 (整齐收纳于左侧，点击展开对局历史) -->
      <div
        class="log-ticker"
        title="点击查看历史对局记录"
        @click="showDrawer = true"
      >
        <span class="ticker-icon">📜</span>
        <span class="ticker-text">{{ latestLog || '恶魔纸牌生死局 · 准备就绪' }}</span>
        <span class="ticker-more">历史 ❯</span>
      </div>

      <!-- 中间与右侧：手牌与操作按钮聚合区 (手牌居中，质疑与出牌紧贴在手牌右侧) -->
      <div class="deck-bottom-center-cluster">
        <!-- 存活玩家手牌或阵亡透视选手手牌 (对决全程清晰呈现) -->
        <div
          v-if="state.status !== 'LOBBY' && displayedHandCards.length > 0"
          class="my-hand-compact"
          :class="{ 'spectating-hand-box': isDeadSpectator }"
        >
          <div class="hand-meta">
            <span class="hand-title">
              {{ isDeadSpectator ? `👁️ 正在观战【${spectatingPlayer?.name || '观战选手'}】` : '🎴 手牌' }} ({{ displayedHandCards.length }}张)
            </span>
            <span v-if="!isDeadSpectator && selectedCardIds.length > 0" class="hand-selected-count">
              已选 {{ selectedCardIds.length }} 张
            </span>
          </div>

          <div class="my-cards-row">
            <PokerCard
              v-for="card in displayedHandCards"
              :key="card.id || card.label"
              :card="card"
              size="sm"
              :face-down="isDeadSpectator && !!state.config?.disableSpectatorXray"
              :selected="!isDeadSpectator && selectedCardIds.includes(card.id)"
              @click="onCardClick(card)"
            />
          </div>
        </div>

        <!-- 主体操作区 (质疑与出牌置于牌的右侧；终局战报与重开操作亦常驻于此) -->
        <div class="deck-actions-area">
          <!-- 0. 终局战报与重开操作 (GAME_OVER，弹窗叉掉后仍可随时重新开局) -->
          <div v-if="state.status === 'GAME_OVER'" class="game-over-bar">
            <button class="f-btn victory-btn" @click="$emit('open-victory')">
              🏆 查看终局战报
            </button>
            <template v-if="isHost">
              <button class="f-btn start-btn" @click="$emit('start-game')">
                🔥 开启新一轮
              </button>
              <button class="f-btn reset-btn" @click="$emit('reset-lobby')">
                🔄 返回备战大厅
              </button>
            </template>
            <div v-else class="waiting-host-hint">
              🏆 对决已决出胜利者！等待房主重新开局...
            </div>
          </div>

          <!-- 1. 大厅阶段房主开局栏 -->
          <div v-else-if="state.status === 'LOBBY'" class="lobby-controls-bar">
          <template v-if="isHost">
            <button
              v-if="state.players.length < (state.config.maxPlayers || 4)"
              class="f-btn bot-btn"
              @click="$emit('add-bot')"
            >
              🤖 + 邀请电脑 AI
            </button>
            <button
              class="f-btn start-btn"
              :disabled="state.players.length < 2"
              @click="$emit('start-game')"
            >
              🔥 开始牌局 ({{ state.players.length }}/{{ state.config.maxPlayers || 4 }}人)
            </button>
          </template>
          <div v-else class="waiting-host-hint">
            ⏳ 等待房主开启牌局... ({{ state.players.length }}/{{ state.config.maxPlayers || 4 }}人已就座)
          </div>
        </div>

        <!-- 2. 淘汰玩家观战操作栏 -->
        <div v-else-if="state.status === 'PLAYING' && isDeadSpectator" class="spectator-controls-bar">
          <span class="spec-tip-click">💡 点击席位可切换观战视角</span>
          <button class="f-btn leave-btn" title="离开当前房间" @click="$emit('leave-room')">
            🚪 离开房间
          </button>
        </div>

        <!-- 3. 存活玩家操作动作组 (置于右侧) -->
        <div v-else-if="state.status === 'PLAYING'" class="gaming-actions-bar">
          <!-- 动作交互按钮组 -->
          <div v-if="isMyTurn" class="action-buttons-group">
            <!-- 终局强制质疑 -->
            <template v-if="isMustChallenge">
              <button
                class="act-btn challenge-btn must-challenge-btn"
                @click="handleChallenge"
              >
                ⚠️ 必须质疑
              </button>
            </template>

            <!-- 常规行动按钮 -->
            <template v-else>
              <!-- 1. 质疑按钮 -->
              <button
                v-if="state.tableCardsCount > 0"
                class="act-btn challenge-btn"
                @click="handleChallenge"
              >
                ⚠️ 质疑
              </button>

              <!-- 2. 出牌按钮 -->
              <button
                class="act-btn play-btn"
                :disabled="selectedCardIds.length === 0 || selectedCardIds.length > 3"
                @click="handlePlayCards"
              >
                🃏 {{ selectedCardIds.length > 0 ? `出牌 (${selectedCardIds.length}张)` : '出牌' }}
              </button>

              <!-- 3. 恶魔契约 -->
              <button
                v-if="state.config.enableDevilsDeal && state.tableCardsCount >= 4"
                class="act-btn devils-deal-btn"
                @click="handleDevilsDeal"
              >
                📜 恶魔契约
              </button>
            </template>
          </div>

          <!-- 非自己回合提示 -->
          <div v-else class="not-my-turn-bar">
            <span class="turn-spinner">⏳</span>
            <span class="wait-msg">
              等待【{{ currentTurnPlayer?.name || '对手' }}】行动<template v-if="!state.config?.disableTurnTimer"> ({{ remainingSeconds }}s)</template>
            </span>
          </div>
        </div>

        <!-- 4. 小局结算过渡阶段 -->
        <div v-else-if="state.status === 'ROUND_OVER'" class="round-over-bar">
          <span class="round-over-msg">🏁 本副手牌结束！即将重新洗牌发牌...</span>
          <button
            v-if="isHost"
            class="f-btn start-btn"
            @click="$emit('start-next-hand')"
          >
            ⏩ 立即发下一手牌
          </button>
        </div>
      </div>
    </div>
    </footer>

    <!-- 左侧对局记录侧边抽屉 -->
    <div
      v-if="showDrawer"
      class="drawer-backdrop"
      @click.self="showDrawer = false"
    >
      <div class="drawer-panel">
        <div class="drawer-header">
          <div class="drawer-title-wrap">
            <span class="d-icon">📜</span>
            <span class="d-title">酒馆对局流水记录</span>
          </div>
          <button class="drawer-close-btn" title="关闭记录" @click="showDrawer = false">✕</button>
        </div>

        <div class="drawer-content">
          <div v-if="!state.logs || state.logs.length === 0" class="empty-logs">
            暂无对局记录
          </div>
          <div
            v-for="(log, idx) in state.logs"
            :key="idx"
            class="drawer-log-item"
            :class="{ 'latest': idx === 0 }"
          >
            <span class="log-bullet">•</span>
            <span class="log-str">{{ log }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 房主规则设置弹窗 -->
    <div v-if="showSettingsModal" class="modal-mask" @click.self="showSettingsModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>⚙️ 骗子纸牌 · 恶魔模式房间规则设置</h3>
          <button class="close-x" @click="showSettingsModal = false">✕</button>
        </div>
        <div class="modal-body">
          <label class="setting-row">
            <input type="checkbox" v-model="settingsForm.enableDevilCard" />
            <div class="setting-text">
              <span class="st-name">😈 包含恶魔卡 (Devil Card)</span>
              <span class="st-sub">被质疑翻开时出牌者豁免，全场其他玩家各开一枪轮盘赌</span>
            </div>
          </label>

          <label class="setting-row">
            <input type="checkbox" v-model="settingsForm.enableDevilsDeal" />
            <div class="setting-text">
              <span class="st-name">📜 恶魔契约 (Devil's Deal)</span>
              <span class="st-sub">台面累计≥4张牌可发起；4张全假他人受罚，有真牌则自己受罚</span>
            </div>
          </label>

          <label class="setting-row">
            <input type="checkbox" v-model="settingsForm.disableSpectatorXray" />
            <div class="setting-text">
              <span class="st-name">🙈 观战无透视</span>
              <span class="st-sub">开启后淘汰选手观战时无法透视其他存活玩家手牌</span>
            </div>
          </label>
        </div>
        <div class="modal-footer">
          <button class="modal-btn confirm-btn" @click="saveSettings">保存规则</button>
        </div>
      </div>
    </div>

    <!-- 局域网联机加入链接与二维码弹窗 -->
    <div v-if="showLinkModal" class="modal-mask" @click.self="showLinkModal = false">
      <div class="modal-card link-modal-card">
        <div class="modal-header">
          <h3>🔗 邀请好友加入本房间</h3>
          <button class="close-x" @click="showLinkModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-tip">好友连接同一 WiFi 或您的手机热点后，可通过以下方式入座：</p>
          <div class="link-input-group">
            <input type="text" :value="fullJoinUrl" readonly class="link-input" />
            <button class="copy-btn" @click="copyJoinUrl">{{ copySuccess ? '✅ 已复制！' : '复制链接' }}</button>
          </div>
          <div class="app-join-tip">
            💡 <strong>免安装即玩</strong>：用手机自带浏览器直接打开上方链接<br>
            📲 <strong>独立 App 联机</strong>：打开上方网页后可点击顶部下载 App，在 App 填入房主 IP <code>{{ displayShortUrl }}</code> 即可跨机联机！
          </div>
        </div>
      </div>
    </div>

    <!-- 恶魔模式官方规则指南弹窗 -->
    <LiarsDeckGuide :visible="showDevilRules" @close="showDevilRules = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import PokerCard from './PokerCard.vue';
import HeadShooterOverlay from './HeadShooterOverlay.vue';
import LiarsDeckGuide from './LiarsDeckGuide.vue';
import { sounds } from '../utils/audio';

const props = defineProps({
  isHost: { type: Boolean, default: false },
  state: { type: Object, required: true },
  serverInfo: { type: Object, default: null },
  myId: { type: String, default: '' }
});

const emit = defineEmits([
  'update-config',
  'add-bot',
  'remove-player',
  'start-game',
  'start-next-hand',
  'reset-lobby',
  'open-victory',
  'cancel-room',
  'leave-room',
  'action'
]);

// 菜单与弹窗状态
const headerExpanded = ref(false);
const showDevilRules = ref(false);
const showSettingsModal = ref(false);
const showLinkModal = ref(false);
const showDrawer = ref(false);

// 轮盘射击动效状态控制
const headShooting = ref(false);
const headRevealed = ref(false);

// 选中打出的卡牌 ID 列表 (1~3张)
const selectedCardIds = ref([]);

// 倒计时动态定时器 (避免倒计时数字不动)
const nowTime = ref(Date.now());
let timerInterval = null;

onMounted(() => {
  timerInterval = setInterval(() => {
    nowTime.value = Date.now();
  }, 250);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const remainingSeconds = computed(() => {
  if (props.state?.config?.disableTurnTimer) return null;
  if (!props.state?.turnDeadline || props.state?.status !== 'PLAYING') return 0;
  const rem = Math.ceil((props.state.turnDeadline - nowTime.value) / 1000);
  return Math.max(0, rem);
});

// 核心规则：当在场其他所有人都没牌时，出牌阶段强制替换为质疑
const isMustChallenge = computed(() => {
  if (!isMyTurn.value || props.state?.tableCardsCount === 0) return false;
  if (props.state?.mustChallenge) return true;
  const opponents = props.state?.players?.filter(p => p.id !== props.myId && p.isAlive && p.connected) || [];
  return opponents.length > 0 && opponents.every(p => (p.cardCount || p.cards?.length || 0) === 0);
});

function getResultBadgeText(type) {
  switch (type) {
    case 'DEVIL_TRIGGERED': return '😈 恶魔降临';
    case 'BLUFF_CAUGHT': return '🚨 质疑成功';
    case 'TRUTH_FAILED': return '🛡️ 质疑失败';
    case 'DEVIL_DEAL_SUCCESS': return '🔥 契约达成';
    case 'DEVIL_DEAL_FAIL': return '⚡ 契约反噬';
    default: return '📢 验牌结果';
  }
}

// 房主设置表单
const settingsForm = ref({
  enableDevilCard: props.state?.config?.enableDevilCard !== false,
  enableDevilsDeal: !!props.state?.config?.enableDevilsDeal,
  disableSpectatorXray: !!props.state?.config?.disableSpectatorXray
});

// 监听 state 中 config 的变化
watch(
  () => props.state?.config,
  (cfg) => {
    if (cfg) {
      settingsForm.value.enableDevilCard = cfg.enableDevilCard !== false;
      settingsForm.value.enableDevilsDeal = !!cfg.enableDevilsDeal;
      settingsForm.value.disableSpectatorXray = !!cfg.disableSpectatorXray;
    }
  },
  { immediate: true, deep: true }
);

// 监听轮盘赌事件以播放动效与音效 (阶段1瞄准扣动，阶段2实弹击发/空枪)
watch(
  () => props.state?.rouletteEvent,
  (evt) => {
    if (evt) {
      if (evt.pending === true) {
        headShooting.value = true;
        headRevealed.value = false;
        try {
          sounds.play('chip'); // 弹巢转动与准星锁定
        } catch (_) {}
      } else if (evt.pending === false || evt.result) {
        headShooting.value = false;
        headRevealed.value = true;
        try {
          if (evt.result?.isBang) {
            sounds.play('lose');
          } else {
            sounds.play('win');
          }
        } catch (_) {}
      } else {
        headShooting.value = true;
        headRevealed.value = false;
        try {
          sounds.play('chip');
        } catch (_) {}
        setTimeout(() => {
          headShooting.value = false;
          headRevealed.value = true;
          try {
            if (evt.result?.isBang) {
              sounds.play('lose');
            } else {
              sounds.play('win');
            }
          } catch (_) {}
        }, 1600);
      }
    } else {
      headShooting.value = false;
      headRevealed.value = false;
    }
  },
  { deep: true }
);

// 监听揭示事件以播放音效
watch(
  () => props.state?.revealEvent,
  (rev) => {
    if (rev) {
      try {
        if (rev.type === 'DEVIL_TRIGGERED') {
          sounds.play('allin');
        } else if (rev.type === 'BLUFF_CAUGHT') {
          sounds.play('fold');
        } else {
          sounds.play('check');
        }
      } catch (_) {}
    }
  }
);

// 当前玩家手牌
const myPlayer = computed(() => {
  return props.state?.players?.find(p => p.id === props.myId);
});

const myCards = computed(() => {
  return myPlayer.value?.cards || [];
});

const isMyTurn = computed(() => {
  return props.state?.currentTurnPlayerId === props.myId && props.state?.status === 'PLAYING';
});

// 观战视角与存活玩家统计
const isDeadSpectator = computed(() => {
  return !!myPlayer.value && !myPlayer.value.isAlive;
});
const isEliminated = isDeadSpectator;

const spectatingPlayerId = ref(null);

watch(
  () => [isDeadSpectator.value, props.state?.players],
  ([dead, players]) => {
    if (dead && players) {
      if (!spectatingPlayerId.value || !players.some(p => p.id === spectatingPlayerId.value && p.isAlive)) {
        const firstAlive = players.find(p => p.isAlive);
        if (firstAlive) {
          spectatingPlayerId.value = firstAlive.id;
        }
      }
    }
  },
  { immediate: true, deep: true }
);

// 基准第一视角 ID (未阵亡为本人，阵亡后切为所选观战选手)
const effectiveViewerId = computed(() => {
  if (isDeadSpectator.value && spectatingPlayerId.value) {
    return spectatingPlayerId.value;
  }
  if (myPlayer.value) {
    return myPlayer.value.id;
  }
  if (props.isHost) {
    const host = props.state.players?.find(p => p.isHost);
    if (host) return host.id;
  }
  return props.state.players?.[0]?.id || '';
});

// 当前观战的选手
const spectatingPlayer = computed(() => {
  if (!props.state?.players) return null;
  return props.state.players.find(p => p.id === effectiveViewerId.value) || null;
});

// 底部手牌区展示的手牌 (本人未阵亡展示本人手牌，阵亡后透视当前观战选手的手牌)
const displayedHandCards = computed(() => {
  if (isDeadSpectator.value) {
    return spectatingPlayer.value?.cards || [];
  }
  return myCards.value;
});

function onSeatClick(player) {
  if (isDeadSpectator.value && player.isAlive) {
    spectatingPlayerId.value = player.id;
  }
}

const aliveCount = computed(() => {
  return props.state?.players?.filter(p => p.isAlive).length || 0;
});

const currentTurnPlayer = computed(() => {
  return props.state?.players?.find(p => p.id === props.state?.currentTurnPlayerId);
});

const selectedDevilCard = computed(() => {
  return myCards.value.some(c => selectedCardIds.value.includes(c.id) && c.type === 'DEVIL');
});

// 点击选择/反选手牌
function onCardClick(card) {
  if (!isMyTurn.value) return;

  const idx = selectedCardIds.value.indexOf(card.id);
  if (idx !== -1) {
    selectedCardIds.value.splice(idx, 1);
    return;
  }

  // 若点击的是恶魔卡，根据独占规则强制单选
  if (card.type === 'DEVIL') {
    selectedCardIds.value = [card.id];
    return;
  }

  // 若当前已选了恶魔卡，又选其它普通卡，则取消恶魔卡
  if (selectedDevilCard.value) {
    selectedCardIds.value = [card.id];
    return;
  }

  // 最多选择 3 张
  if (selectedCardIds.value.length < 3) {
    selectedCardIds.value.push(card.id);
  }
}

// 行动：声明出牌
function handlePlayCards() {
  if (selectedCardIds.value.length === 0 || selectedCardIds.value.length > 3) return;
  emit('action', {
    action: 'PLAY_CARDS',
    cardIds: [...selectedCardIds.value]
  });
  selectedCardIds.value = [];
}

// 行动：质疑揭穿 (Liar!)
function handleChallenge() {
  emit('action', {
    action: 'CHALLENGE'
  });
  selectedCardIds.value = [];
}

// 行动：恶魔契约 (Devil's Deal)
function handleDevilsDeal() {
  emit('action', {
    action: 'DEVILS_DEAL'
  });
  selectedCardIds.value = [];
}

// 席位相对视角计算 (观战选手或本人始终旋转至底部 bottom，其余玩家顺畅排布)
const positionedPlayers = computed(() => {
  const list = props.state?.players || [];
  if (list.length === 0) return [];

  const viewerId = effectiveViewerId.value;
  const viewerIdx = list.findIndex(p => p.id === viewerId);
  const baseIdx = viewerIdx !== -1 ? viewerIdx : 0;
  const n = list.length;

  return list.map((p, i) => {
    const rel = (i - baseIdx + n) % n;
    let position = 'bottom';
    if (n === 2) {
      position = (rel === 0) ? 'bottom' : 'top';
    } else if (n === 3) {
      position = (rel === 0) ? 'bottom' : (rel === 1 ? 'right' : 'left');
    } else {
      const positions = ['bottom', 'right', 'top', 'left'];
      position = positions[rel] || 'top';
    }
    return {
      ...p,
      position
    };
  });
});

// 判断玩家是否在视图中展示阵亡状态 (若正在经历未揭晓的开枪过程，暂不展示阵亡，避免剧透)
function isPlayerDead(player) {
  if (player.isAlive) return false;
  if (props.state?.rouletteEvent &&
      (props.state.rouletteEvent.playerId === player.id || props.state.rouletteEvent.player?.id === player.id) &&
      !headRevealed.value) {
    return false;
  }
  return true;
}

// 席位状态文本与样式
function getSeatStatusClass(player) {
  if (props.state?.rouletteEvent &&
      (props.state.rouletteEvent.playerId === player.id || props.state.rouletteEvent.player?.id === player.id)) {
    if (!headRevealed.value) return 'tag-acting';
    if (props.state.rouletteEvent.result?.isBang) return 'tag-dead';
    return 'tag-safe';
  }
  if (!player.isAlive) return 'tag-dead';
  if (player.isOffline) return 'tag-offline';
  if (player.hasClearedCards) return 'tag-cleared';
  if (props.state.status === 'LOBBY') return 'tag-lobby';
  if (props.state.currentTurnPlayerId === player.id && props.state.status === 'PLAYING') return 'tag-turn';
  return 'tag-normal';
}

function getSeatStatusText(player) {
  if (props.state?.rouletteEvent &&
      (props.state.rouletteEvent.playerId === player.id || props.state.rouletteEvent.player?.id === player.id)) {
    if (!headRevealed.value) return '🔫 扣动扳机中...';
    if (props.state.rouletteEvent.result?.isBang) return '💥 淘汰中弹';
    return '🛡️ 空枪脱险';
  }
  if (!player.isAlive) return '💀 淘汰中弹';
  if (player.isOffline) return '🔌 离线·AI代打';
  if (player.hasClearedCards) return '🎉 安全脱险';
  if (props.state.status === 'LOBBY') return '⌛ 准备就绪';
  if (props.state.currentTurnPlayerId === player.id && props.state.status === 'PLAYING') return '🔥 行动中...';
  return '';
}

// 联机链接显示
const displayShortUrl = computed(() => {
  const ip = props.serverInfo?.lanIp || '127.0.0.1';
  const port = props.serverInfo?.port || 9527;
  return `${ip}:${port}`;
});

const fullJoinUrl = computed(() => {
  const ip = props.serverInfo?.lanIp || '127.0.0.1';
  const port = props.serverInfo?.port || 9527;
  return `http://${ip}:${port}`;
});

const copySuccess = ref(false);
function copyJoinUrl() {
  try {
    navigator.clipboard?.writeText(fullJoinUrl.value);
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);
  } catch (_) {}
}

// 最新日志
const latestLog = computed(() => {
  return props.state?.logs?.[0] || '';
});

// 保存规则设置
function saveSettings() {
  emit('update-config', {
    enableDevilCard: settingsForm.value.enableDevilCard,
    enableDevilsDeal: settingsForm.value.enableDevilsDeal,
    disableSpectatorXray: settingsForm.value.disableSpectatorXray
  });
  showSettingsModal.value = false;
}
</script>

<style scoped>
/* 整个恶魔纸牌舞台 */
.liars-deck-stage {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at 50% 25%, #181a24 0%, #0d0f15 55%, #050608 100%);
  color: #f1f5f9;
  user-select: none;
  overflow: hidden;
}

/* 顶部左上角常驻停靠区 (菜单 + 菜单下方的目标牌) */
.top-left-dock {
  position: absolute;
  top: 8px;
  left: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  z-index: 60;
}

.top-collapsed-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.under-menu-target {
  background: rgba(18, 22, 31, 0.94);
  border: 1.5px solid rgba(245, 158, 11, 0.7);
  border-radius: 12px;
  padding: 3px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  min-width: 64px;
}
.under-menu-target .spotlight-badge {
  font-size: 9.5px;
  font-weight: 800;
  color: #fbbf24;
}
.under-menu-target .target-card-val {
  font-size: 14px;
  font-weight: 900;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-toggle-pill, .lan-mini-pill, .devil-mode-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(217, 119, 6, 0.4);
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 12px;
  color: #fde68a;
  cursor: pointer;
}

.devil-mode-indicator {
  border-color: #ef4444;
  background: rgba(69, 10, 10, 0.85);
  color: #fef08a;
  font-weight: 700;
  cursor: default;
}

/* 展开顶部栏 */
.game-header {
  position: relative;
  height: 52px;
  background: rgba(10, 14, 20, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(217, 119, 6, 0.35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 95;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-zone .logo { font-size: 22px; }
.brand-zone h2 {
  font-size: 15px;
  font-weight: 800;
  color: #fde68a;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.host-pill {
  font-size: 10px;
  background: #b45309;
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lan-pill, .icon-tool-btn, .cancel-room-btn, .leave-room-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(217, 119, 6, 0.4);
  color: #fde68a;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.cancel-room-btn { background: #7f1d1d; color: #fee2e2; border-color: #ef4444; }
.leave-room-btn { background: #334155; color: #f1f5f9; border-color: #475569; }

/* 牌桌区域 */
.table-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  position: relative;
  overflow: hidden;
}

.devil-felt {
  width: 76%;
  max-width: 760px;
  height: 74%;
  max-height: 400px;
  background: radial-gradient(ellipse at center, #15272a 0%, #0c1a1d 60%, #061012 95%);
  border: 10px solid #23160e;
  border-radius: 9999px;
  box-shadow:
    inset 0 0 70px rgba(0, 0, 0, 0.95),
    0 0 0 2px rgba(217, 119, 6, 0.4),
    0 16px 50px rgba(0, 0, 0, 0.85);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 牌桌中心舞台 */
.center-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 10;
}

/* 左上方目标牌 Spotlight (独立于桌心) */
.target-card-spotlight.top-left-target {
  position: absolute;
  top: 18px;
  left: 24px;
  z-index: 25;
  background: rgba(10, 15, 20, 0.9);
  border: 1.5px solid #d97706;
  box-shadow: 0 0 16px rgba(217, 119, 6, 0.35);
  border-radius: 12px;
  padding: 6px 14px;
  text-align: center;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}
.target-card-spotlight.top-left-target .spotlight-badge {
  font-size: 10px;
  font-weight: 800;
  color: #fbbf24;
  letter-spacing: 0.5px;
}
.target-card-spotlight.top-left-target .target-card-val {
  font-size: 20px;
  font-weight: 900;
  color: #fef08a;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 1px 0;
}
.target-card-spotlight.top-left-target .waiting-lobby {
  opacity: 0.65;
}
.target-card-spotlight.top-left-target .lobby-hint-txt {
  font-size: 12px !important;
  color: #94a3b8 !important;
  font-weight: 600 !important;
}

/* 大厅等待牌桌中心提示 */
.deck-lobby-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 12px;
  padding: 6px 18px;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
.deck-lobby-center .lobby-badge {
  font-size: 13px;
  font-weight: 800;
  color: #fca5a5;
  letter-spacing: 0.5px;
}
.deck-lobby-center .lobby-sub {
  font-size: 11px;
  color: #94a3b8;
}
.center-lobby-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

/* 牌堆 */
.table-pile-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.pile-cards-visual {
  width: 70px;
  height: 90px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pile-card-layer {
  position: absolute;
  width: 50px;
  height: 70px;
  transition: transform 0.3s;
}
.mini-card-back {
  width: 100%;
  height: 100%;
  background: #7f1d1d;
  border: 1.5px solid #ffffff;
  border-radius: 5px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
}
.empty-pile-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #64748b;
  font-size: 11px;
}

.pile-counter-pill {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(217, 119, 6, 0.35);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 12px;
  color: #fde68a;
}
.pile-counter-pill strong { color: #fef08a; }

/* 上家出牌声明 */
.last-play-statement {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #b45309;
  border-radius: 12px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 12px rgba(217, 119, 6, 0.25);
}
.statement-avatar { font-size: 24px; }
.statement-title { font-size: 11px; color: #cbd5e1; }
.statement-claim {
  font-size: 14px;
  font-weight: 900;
  color: #fef08a;
}
.initial-turn-hint {
  font-size: 12px;
  color: #94a3b8;
}

/* 回合状态横幅 */
.turn-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid #f59e0b;
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 12px;
  color: #fef2f2;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}
.acting-timer {
  background: #b45309;
  color: #fef08a;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 800;
}
.acting-timer.timer-urgent {
  background: #dc2626;
  color: #ffffff;
  animation: pulse 1s infinite;
}

/* 玩家席位四向环绕 */
.players-ring {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.player-seat {
  position: absolute;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.3s;
}

/* 展开菜单时的点击其他区域收起透明遮罩 */
.header-click-outside-backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: transparent;
}

.seat-pos-bottom {
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%) translateY(100%);
  z-index: 15;
}
.seat-pos-top {
  top: -8px;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  z-index: 14;
}
.seat-pos-left {
  left: -14px;
  top: 50%;
  transform: translateX(-100%) translateY(-50%);
  z-index: 14;
}
.seat-pos-right {
  right: -14px;
  top: 50%;
  transform: translateX(100%) translateY(-50%);
  z-index: 14;
}

.seat-top {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 头顶开枪看板 (开枪数与存活概率) */
.seat-gun-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: 12px;
  padding: 2px 7px;
  font-size: 10px;
  margin-bottom: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}
.gun-ico { font-size: 11px; }
.gun-shots {
  font-weight: 700;
  color: #cbd5e1;
}
.gun-divider {
  color: #64748b;
  font-size: 9px;
  margin: 0 1px;
}
.gun-survive {
  font-weight: 800;
  color: #34d399; /* 存活率高亮生机绿 */
}
.mini-cyl-dots {
  display: flex;
  align-items: center;
  gap: 2.5px;
  margin-left: 2px;
}
.cyl-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  transition: all 0.2s;
}
.cyl-dot.dot-fired {
  background: #334155;
  border: 1px solid #475569;
  opacity: 0.45;
}
.cyl-dot.dot-danger {
  background: #ef4444;
  border: 1px solid #fca5a5;
  box-shadow: 0 0 5px #ef4444;
  animation: dangerPulse 0.8s infinite alternate;
}
.cyl-dot.dot-empty {
  background: #0f172a;
  border: 1px solid #334155;
}
@keyframes dangerPulse {
  from { transform: scale(0.9); opacity: 0.8; }
  to { transform: scale(1.35); opacity: 1; }
}

.avatar-box {
  width: 48px;
  height: 48px;
  background: rgba(10, 15, 22, 0.85);
  border: 2px solid #b45309;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
}
.avatar-box.is-offline {
  filter: grayscale(0.7) opacity(0.8);
  border-color: #64748b;
}
.player-seat.is-turn .avatar-box {
  border-color: #fef08a;
  box-shadow: 0 0 16px rgba(254, 240, 138, 0.85);
}
.player-seat.is-dead .avatar-box {
  filter: grayscale(100%);
  opacity: 0.5;
}

.host-crown, .bot-badge, .me-badge, .offline-badge {
  position: absolute;
  font-size: 10px;
  font-weight: 800;
  border-radius: 4px;
  padding: 1px 3px;
}
.host-crown { top: -6px; right: -4px; font-size: 14px; }
.bot-badge { bottom: -4px; right: -4px; background: #9333ea; color: #ffffff; }
.me-badge { bottom: -4px; left: -4px; background: #16a34a; color: #ffffff; }
.offline-badge {
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  background: #475569;
  color: #f1f5f9;
  border: 1px solid #64748b;
  font-size: 9px;
  white-space: nowrap;
}

.seat-user {
  text-align: center;
  margin-top: 2px;
}
.uname {
  font-size: 11px;
  font-weight: 700;
  color: #f1f5f9;
}
.offline-tag {
  color: #94a3b8;
  font-size: 9px;
  font-weight: normal;
  margin-left: 2px;
}
.status-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-top: 1px;
}
.tag-dead { background: #334155; color: #94a3b8; }
.tag-offline { background: rgba(71, 85, 105, 0.5); color: #cbd5e1; border: 1px solid #64748b; }
.tag-cleared { background: #15803d; color: #dcfce7; }
.tag-lobby { background: #475569; color: #cbd5e1; }
.tag-turn { background: #b45309; color: #fef08a; font-weight: 800; }
.tag-normal { background: rgba(0,0,0,0.5); color: #cbd5e1; }

.card-count-badge {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(217, 119, 6, 0.35);
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 10px;
  color: #fde68a;
}

.kick-btn {
  position: absolute;
  top: -4px;
  right: -10px;
  background: #ef4444;
  border: none;
  color: white;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
}

/* 底部操作与控制台 */
.deck-control-footer {
  min-height: 52px;
  position: relative;
  z-index: 50;
  background: #11121a;
  border-top: 1px solid #232736;
  padding: 4px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.log-ticker {
  max-width: 32%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 16px;
  padding: 3px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #e2e8f0;
  cursor: pointer;
  flex-shrink: 0;
}
.log-ticker:hover {
  border-color: #ef4444;
}
.ticker-icon { font-size: 12px; }
.ticker-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ticker-more {
  color: #fca5a5;
  font-size: 10px;
  white-space: nowrap;
}

.deck-bottom-center-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 0 auto;
}

.victory-reopen-pill {
  padding: 4px 12px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #1e1b4b;
  font-weight: 800;
  font-size: 12px;
  border-radius: 9999px;
  border: 1px solid #fef08a;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
  transition: all 0.2s;
}
.victory-reopen-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.6);
}

.game-over-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.f-btn.victory-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #1e1b4b;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
}
.f-btn.reset-btn {
  background: #334155;
  color: #f1f5f9;
}

.deck-actions-area {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 大厅阶段操作 */
.lobby-controls-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.f-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
}
.f-btn.bot-btn {
  background: #334155;
  color: #f1f5f9;
}
.f-btn.bot-btn:hover {
  background: #475569;
}
.f-btn.start-btn {
  background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}
.f-btn.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.waiting-host-hint {
  font-size: 12px;
  color: #94a3b8;
}

/* 淘汰观战者底部控制台 */
.spectator-controls-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.spec-info-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spec-pill {
  font-size: 11px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 2px 6px;
}
.spec-pill.spec-tag {
  background: #7f1d1d;
  color: #fecaca;
  border-color: #ef4444;
  font-weight: 800;
}
.spec-tip-click {
  font-size: 11px;
  color: #94a3b8;
  margin: 0 4px;
}
.leave-btn {
  background: #334155;
  color: #f1f5f9;
}

.top-spectator-badge {
  position: absolute;
  top: 10px;
  right: 14px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(88, 28, 135, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(168, 85, 247, 0.6);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px rgba(168, 85, 247, 0.3);
  padding: 4px 12px;
  border-radius: 9999px;
  color: #f1f5f9;
  font-size: 11.5px;
  pointer-events: none;
}

.top-spectator-badge .spec-badge-eye {
  font-size: 13px;
}

.top-spectator-badge .spec-badge-text {
  font-weight: 600;
  color: #e2e8f0;
}

.top-spectator-badge .target-name {
  color: #fde047;
  font-weight: 800;
}

.player-seat.can-click-spectate {
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.player-seat.can-click-spectate:hover {
  transform: scale(1.04);
}

.player-seat.can-click-spectate .avatar-box {
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.6);
}

.player-seat.is-spectating .avatar-box {
  border-color: #a855f7 !important;
  box-shadow: 0 0 18px rgba(168, 85, 247, 0.85) !important;
}

.spec-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  font-size: 8.5px;
  background: #a855f7;
  color: #ffffff;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 800;
}

.spec-tag {
  color: #c084fc;
  font-size: 9.5px;
  margin-left: 2px;
}

.spectator-opponent-cards {
  display: flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  margin-top: 3px;
}

.spectating-hand-box {
  border: 1px dashed rgba(168, 85, 247, 0.6);
  border-radius: 10px;
  padding: 2px 8px;
  background: rgba(88, 28, 135, 0.15);
}

/* 正常对决阶段操作栏 */
.gaming-actions-bar,
.gaming-controls-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.my-hand-compact {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hand-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  flex-shrink: 0;
}
.hand-title {
  font-size: 11px;
  font-weight: 800;
  color: #fef08a;
  white-space: nowrap;
}
.hand-selected-count {
  font-size: 10px;
  font-weight: 700;
  color: #4ade80;
  white-space: nowrap;
}

.my-cards-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 动作按钮 */
.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.act-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  white-space: nowrap;
}
.act-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.play-btn {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.35);
}
.challenge-btn {
  background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}
.devils-deal-btn {
  background: linear-gradient(135deg, #7e22ce 0%, #581c87 100%);
  color: #f3e8ff;
  border: 1px solid #c084fc;
  box-shadow: 0 4px 12px rgba(126, 34, 206, 0.4);
}

.not-my-turn-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.6);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* 小局过渡阶段 */
.round-over-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.round-over-msg {
  font-size: 12px;
  color: #fde68a;
}

/* 牌桌内嵌验牌现场 (直接在牌桌上展示，无弹窗) */
.table-reveal-stage {
  background: rgba(15, 23, 42, 0.92);
  border: 1.5px solid #ef4444;
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.45);
  border-radius: 12px;
  padding: 8px 16px 14px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: 320px;
  animation: fadeIn 0.3s ease-out;
}

/* 阶段 1：悬念等待 */
.reveal-suspense-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.suspense-title {
  font-size: 14px;
  font-weight: 800;
  color: #fef08a;
  display: flex;
  align-items: center;
  gap: 6px;
}
.pulse-warning {
  animation: pulse 0.7s infinite;
}
.suspense-cards-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin: 4px 0;
}
.suspense-card-back {
  width: 46px;
  height: 64px;
  background: #7f1d1d;
  border: 1.5px solid #ffffff;
  border-radius: 6px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
  animation: cardWiggle 1s infinite ease-in-out;
}
.suspense-sub {
  font-size: 11px;
  color: #fca5a5;
  letter-spacing: 0.5px;
}

/* 阶段 2：结果揭晓 */
.reveal-result-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.result-badge-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.result-badge {
  font-size: 11px;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 4px;
}
.badge-DEVIL_TRIGGERED { background: #dc2626; color: #fef08a; animation: pulse 0.8s infinite; }
.badge-BLUFF_CAUGHT { background: #dc2626; color: #ffffff; }
.badge-TRUTH_FAILED { background: #2563eb; color: #ffffff; }
.badge-DEVIL_DEAL_SUCCESS { background: #9333ea; color: #fef08a; }
.badge-DEVIL_DEAL_FAIL { background: #475569; color: #ffffff; }

.result-headline {
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
}
.revealed-cards-inline {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin: 4px 0;
}
.devil-warning-sub {
  font-size: 11px;
  color: #fca5a5;
  background: rgba(127, 29, 29, 0.5);
  border: 1px solid #dc2626;
  border-radius: 6px;
  padding: 3px 10px;
}

/* 强制质疑按钮样式 */
.must-challenge-btn {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%) !important;
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.8), 0 4px 12px rgba(0, 0, 0, 0.5) !important;
  animation: pulse 0.9s infinite;
}

@keyframes cardWiggle {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-4px) rotate(2deg); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

/* 历史抽屉 */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 110;
}
.drawer-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 320px;
  background: #120305;
  border-right: 1px solid #7f1d1d;
  display: flex;
  flex-direction: column;
}
.drawer-header {
  padding: 14px 16px;
  border-bottom: 1px solid #7f1d1d;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 800;
  color: #fecaca;
}
.drawer-close-btn {
  background: transparent;
  border: none;
  color: #cbd5e1;
  font-size: 16px;
  cursor: pointer;
}
.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drawer-log-item {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.5;
}
.drawer-log-item.latest {
  color: #fef08a;
  font-weight: 700;
}

/* 模态框通用 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
}
.modal-card {
  width: 90%;
  max-width: 460px;
  background: #1c0508;
  border: 1px solid #7f1d1d;
  border-radius: 14px;
  padding: 18px;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.modal-header h3 { margin: 0; font-size: 15px; color: #fecaca; }
.close-x { background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  cursor: pointer;
}
.setting-text { display: flex; flex-direction: column; gap: 2px; }
.st-name { font-size: 13px; font-weight: 700; color: #f1f5f9; }
.st-sub { font-size: 11px; color: #94a3b8; }
.modal-footer { display: flex; justify-content: flex-end; margin-top: 14px; }
.modal-btn {
  padding: 8px 18px;
  border-radius: 8px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  background: #dc2626;
  color: #ffffff;
}

.link-input-group {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.link-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid #7f1d1d;
  color: #f1f5f9;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.copy-btn {
  background: #dc2626;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 12px;
}

.app-join-tip {
  margin-top: 10px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.6;
}

.app-join-tip strong {
  color: #38bdf8;
}

.app-join-tip code {
  color: #fde047;
  font-weight: 800;
  background: rgba(0, 0, 0, 0.4);
  padding: 1px 4px;
  border-radius: 4px;
}

/* 动效 */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.04); }
}

/* 大厅操作 */
.lobby-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.lobby-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #cbd5e1;
}
.feat-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
.feat-tag.devil { background: #7f1d1d; color: #fecaca; }
.feat-tag.deal { background: #581c87; color: #f3e8ff; }
.lobby-actions {
  display: flex;
  gap: 12px;
}
.tool-btn, .primary-btn {
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  border: none;
}
.add-bot-btn {
  background: #334155;
  color: #f1f5f9;
}
.start-game-btn {
  background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4);
}
.waiting-host-hint {
  font-size: 13px;
  color: #94a3b8;
  padding: 10px;
}

/* 移动端横屏适配 (参照德州扑克紧凑黄金比例) */
@media (max-height: 560px), (max-width: 900px) {
  .game-header {
    height: 40px;
    min-height: 40px;
    padding: 0 12px;
  }
  .brand-zone .logo { font-size: 18px; }
  .brand-zone h2 { font-size: 15px; }
  .lan-pill, .icon-tool-btn, .cancel-room-btn, .leave-room-btn {
    padding: 3px 8px;
    font-size: 11px;
  }
  .table-container {
    padding: 0 10px;
    overflow: visible;
    min-height: 0;
  }
  .devil-felt {
    border-radius: 9999px;
    border: 6px solid #23160e;
    width: min(68vw, 440px);
    height: min(48vh, 146px);
    aspect-ratio: auto;
    max-width: 72%;
    margin: auto;
  }
  .seat-pos-bottom {
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    z-index: 15;
  }
  .seat-pos-bottom .seat-top {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  .seat-pos-top {
    top: -8px;
    left: 50%;
    transform: translateX(-50%) translateY(-100%);
    z-index: 14;
  }
  .seat-pos-top .seat-top {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  .seat-pos-left {
    left: -14px;
    top: 50%;
    transform: translateX(-100%) translateY(-50%);
    z-index: 14;
  }
  .seat-pos-right {
    right: -14px;
    top: 50%;
    transform: translateX(100%) translateY(-50%);
    z-index: 14;
  }
  .player-seat .avatar-box {
    width: 22px;
    height: 22px;
    font-size: 13px;
  }
  .player-seat .uname {
    font-size: 10px;
    line-height: 1.1;
  }
  .player-seat .seat-gun-bar {
    font-size: 8.5px;
    padding: 1px 4px;
    gap: 2px;
  }
  .player-seat .mini-cyl-dots {
    display: none;
  }
  .target-card-spotlight.top-left-target {
    top: 8px;
    left: 12px;
    padding: 2px 8px;
  }
  .target-card-spotlight.top-left-target .spotlight-badge {
    font-size: 9px;
  }
  .target-card-spotlight.top-left-target .target-card-val {
    font-size: 14px;
  }
  .center-stage {
    gap: 3px;
    transform: scale(0.88);
  }
  .turn-status-banner {
    display: none;
  }
  .deck-lobby-center {
    padding: 3px 12px;
    gap: 2px;
  }
  .deck-lobby-center .lobby-badge {
    font-size: 11px;
  }
  .deck-lobby-center .lobby-sub {
    font-size: 9.5px;
  }
  .pile-cards-visual {
    width: 40px;
    height: 52px;
  }
  .pile-counter-pill {
    padding: 1px 6px;
    font-size: 9.5px;
  }
  .last-play-statement {
    padding: 2px 8px;
    gap: 6px;
  }
  .statement-avatar {
    font-size: 18px;
  }
  .statement-title {
    font-size: 9.5px;
  }
  .statement-claim {
    font-size: 11px;
  }
  .table-reveal-stage {
    padding: 6px 14px 10px 14px;
    max-width: 290px;
    gap: 4px;
    border-radius: 8px;
    border-width: 1.5px;
  }
  .result-badge {
    font-size: 9px;
    padding: 1px 6px;
  }
  .result-headline {
    font-size: 11px;
    line-height: 1.2;
  }
  .revealed-cards-inline {
    gap: 6px;
    margin: 3px 0 2px 0;
  }
  .revealed-cards-inline :deep(.real-poker-card) {
    width: 34px !important;
    height: 50px !important;
    padding: 2px !important;
  }
  .revealed-cards-inline :deep(.corner-val) {
    font-size: 9.5px !important;
    font-weight: 900 !important;
    line-height: 1 !important;
  }
  .revealed-cards-inline :deep(.corner-suit) {
    font-size: 7.5px !important;
    line-height: 1 !important;
    margin-top: 0.5px !important;
  }
  .revealed-cards-inline :deep(.pip-suit) {
    font-size: 12px !important;
  }
  .revealed-cards-inline :deep(.devil-huge-icon) {
    font-size: 18px !important;
  }
  .revealed-cards-inline :deep(.joker-huge-icon) {
    font-size: 16px !important;
  }
  .revealed-cards-inline :deep(.joker-txt) {
    font-size: 6px !important;
  }
  .suspense-card-back {
    width: 28px;
    height: 40px;
  }
  .suspense-title {
    font-size: 11px;
  }
  .deck-control-footer {
    min-height: 52px;
    max-height: 74px;
    padding: 3px 10px;
    flex-shrink: 0;
    overflow: visible;
    position: relative;
  }
  .deck-control-footer .log-ticker {
    max-width: 90px;
    font-size: 10px;
    padding: 2px 6px;
    gap: 4px;
    flex-shrink: 0;
  }
  .deck-control-footer .log-ticker .ticker-text {
    display: none;
  }
  .deck-control-footer .log-ticker::after {
    content: '战报';
    font-size: 11px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
  }
  .deck-bottom-center-cluster {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0 auto;
    position: static;
    transform: none;
  }
  .my-hand-compact {
    position: static;
    transform: none;
    gap: 4px;
    z-index: 10;
  }
  .my-hand-compact .hand-meta {
    display: none;
  }
  .my-cards-row {
    gap: 4px;
  }
  .my-cards-row .real-poker-card {
    width: 48px !important;
    height: 68px !important;
    padding: 3px !important;
    border-radius: 6px !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7) !important;
  }
  .my-cards-row .corner-val {
    font-size: 15px !important;
    font-weight: 900 !important;
  }
  .my-cards-row .corner-suit {
    font-size: 12px !important;
  }
  .my-cards-row .center-watermark {
    font-size: 22px !important;
  }
  .deck-actions-area {
    margin-left: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .act-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
  .f-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
}
</style>
