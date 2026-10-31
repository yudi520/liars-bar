<template>
  <div class="game-stage">
    <!-- 左上角常驻轻量胶囊区 (纯净菜单与终局战报入口) -->
    <div v-if="!headerExpanded" class="top-collapsed-bar">
      <button
        class="header-toggle-pill"
        title="展开酒馆完整菜单与规则设置"
        @click="headerExpanded = true"
      >
        <span class="icon">☰</span>
        <span class="txt">菜单</span>
      </button>

      <!-- 终局战报浮动按钮 (当战局结算弹窗被关闭后可随时再次展开) -->
      <button
        v-if="state.status === 'GAME_OVER'"
        class="victory-reopen-pill"
        title="查看终局战报与胜负排名"
        @click="$emit('open-victory')"
      >
        🏆 战报
      </button>

      <!-- 比牌决胜浮动入口：只要本手牌有比牌结果且弹窗被叉掉了，常驻显示可随时重新打开 -->
      <button
        v-if="state.showdownResult?.evaluatedList?.length && dismissShowdown && state.status !== 'LOBBY' && state.status !== 'GAME_OVER'"
        class="showdown-reopen-pill"
        title="查看比牌决胜详情"
        @click.stop="dismissShowdown = false"
      >
        🃏 查看比牌
      </button>
    </div>

    <!-- 右上角观战提示胶囊 (常驻右上角，文字极简，只显示观战谁) -->
    <div v-if="isDeadSpectator && spectatingPlayer" class="top-spectator-badge">
      <span class="spec-badge-eye">👀</span>
      <span class="spec-badge-text">观战中: <strong class="target-name">【{{ spectatingPlayer.name }}】</strong></span>
    </div>

    <!-- 点击外部收起菜单的透明遮罩 -->
    <div
      v-if="headerExpanded"
      class="header-click-outside-backdrop"
      @click="headerExpanded = false"
    ></div>

    <!-- 顶部状态栏与工具区 (支持随时展开/收起) -->
    <header v-show="headerExpanded" class="game-header" @click.stop>
      <div class="brand-zone">
        <span class="logo">🍻</span>
        <div class="title-wrap">
          <h2>
            骗子酒馆
            <span v-if="isHost" class="host-pill">房主</span>
          </h2>
        </div>
      </div>

      <div class="header-actions">
        <!-- 好友联机加入链接胶囊 -->
        <div class="lan-pill" title="查看并复制联机加入链接" @click="openLinkModal">
          <span class="dot"></span>
          <span class="ip-txt">🔗 联机链接: {{ displayShortUrl }}</span>
          <span class="copy-icon">📋</span>
        </div>

        <button class="icon-tool-btn" title="查看牌型规则" @click="showRules = true">
          📜 规则
        </button>

        <!-- 房主专用：规则定制 -->
        <button
          v-if="isHost"
          class="icon-tool-btn"
          title="房间规则定制"
          @click="showSettings = true"
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

        <!-- 终局战报入口 (游戏结束时可随时再次查看战报) -->
        <button
          v-if="state.status === 'GAME_OVER'"
          class="victory-reopen-btn"
          title="查看终局战报与胜负排名"
          @click="$emit('open-victory')"
        >
          🏆 战报
        </button>

        <!-- 收起菜单按钮 -->
        <button class="icon-tool-btn collapse-btn" title="收起菜单栏" @click="headerExpanded = false">
          ▲ 收起
        </button>
      </div>
    </header>

    <!-- 终局战报浮动胶囊 (当顶部菜单收起且处于战局结束时显示) -->
    <button
      v-if="state.status === 'GAME_OVER' && !headerExpanded"
      class="victory-floating-pill"
      title="查看终局战报与胜负排名"
      @click="$emit('open-victory')"
    >
      🏆 终局战报
    </button>

    <!-- 牌桌主体核心区 (全员视角统一) -->
    <main class="table-container">
      <div class="poker-table">
        <!-- 桌心公共牌 (仅展示公共牌，无多余文字干扰) -->
        <div class="community-zone">
          <div v-if="state.status === 'LOBBY'" class="texas-lobby-center">
            <div class="lobby-badge">🎰 德州扑克大厅 · 准备中</div>
            <div class="lobby-sub">当前就座：{{ (state.players || []).length }} / {{ (state.config && state.config.maxPlayers) || 4 }} 人</div>
          </div>
          <div v-else class="cards-felt">
            <PokerCard
              v-for="(card, idx) in state.communityCards"
              :key="idx"
              :card="card"
              size="felt"
              :face-down="card.hidden"
            />
          </div>

          <!-- 全局浮动广播通知 (换牌提醒置于公共牌下方，绝不遮挡上方玩家) -->
          <transition name="toast-fade">
            <div v-if="showSwitchToast && state.lastAction && state.lastAction.action === 'SWITCH'" class="action-broadcast-toast">
              {{ state.lastAction.text }}
            </div>
          </transition>
        </div>

        <!-- 围绕牌桌就坐的 2~4 名玩家席位 (本人始终固定在最下方，阵亡支持点击任意玩家主视角观战) -->
        <div class="seats-ring">
          <div
            v-for="player in positionedPlayers"
            :key="player.id"
            class="seat-card"
            :class="[
              `seat-slot-${player.slot}`,
              {
                'is-turn': state.currentTurnPlayerId === player.id,
                'is-dead': isPlayerVisuallyDead(player),
                'is-allin': player.isAllIn,
                'is-me': player.id === myPlayer?.id,
                'is-spectating': isDeadSpectator && player.id === effectiveViewerId,
                'can-click-spectate': isDeadSpectator && player.isAlive && player.id !== effectiveViewerId
              }
            ]"
            :title="isDeadSpectator && player.isAlive ? '点击以该玩家主视角观战并查看底牌' : ''"
            @click="onSeatClick(player)"
          >
            <!-- 醒目玩家决策动作气泡 (跟注、弃牌、ALL-IN、换牌) -->
            <transition name="action-bubble-pop">
              <div
                v-if="player.lastAction && state.status !== 'LOBBY'"
                class="seat-action-bubble"
                :class="`bubble-${player.lastAction.type?.toLowerCase()}`"
              >
                {{ player.lastAction.text }}
              </div>
            </transition>

            <!-- 席位头部：头像、昵称、身份标识 -->
            <div class="seat-top">
              <!-- 头顶开枪浮层 (开枪显示在各个玩家头上，包括开枪玩家，不用弹窗显示) -->
              <HeadShooterOverlay
                v-if="state.rouletteEvent && state.rouletteEvent.player && state.rouletteEvent.player.id === player.id"
                :event="state.rouletteEvent"
                :is-spinning="headShooting"
                :is-revealed="headRevealed"
              />

              <div class="avatar-box">
                <span class="avatar">{{ player.avatar }}</span>
                <span v-if="player.isHost && player.avatar !== '👑'" class="host-crown" title="房主">👑</span>
                <span v-if="player.isBot" class="bot-badge">AI</span>
                <span v-if="player.id === myPlayer?.id" class="me-badge">我</span>
                <span v-if="isDeadSpectator && player.id === effectiveViewerId" class="spec-badge">观战</span>
              </div>
              <div class="seat-user">
                <div class="uname">
                  {{ player.name }}
                  <span v-if="player.isBot && player.personality" class="bot-style-tag">[{{ player.personality }}]</span>
                  <span v-if="player.id === myPlayer?.id" class="me-tag">(本人)</span>
                  <span v-else-if="isDeadSpectator && player.id === effectiveViewerId" class="spec-tag">(观战视角)</span>
                </div>
                <div class="status-tag" :class="getStatusClass(player)">
                  <!-- 开枪期间不提前显示淘汰文字，等待开枪动画判定结束后同步显示 -->
                  <span v-if="state.rouletteEvent && state.rouletteEvent.player && state.rouletteEvent.player.id === player.id && !headRevealed" class="tag-acting">
                    🔫 直面枪口中...
                  </span>
                  <span v-else-if="state.status !== 'LOBBY' && !isPlayerVisuallyDead(player) && !player.inHand" class="tag-folded">🏳️ 已弃牌</span>
                  <span v-else-if="state.status === 'LOBBY'" class="tag-normal">⌛ 准备就绪</span>
                  <span v-else-if="isPlayerVisuallyDead(player) && player.id === myPlayer?.id" class="tag-loser-shout">💥 你输了 (中弹)</span>
                  <span v-else-if="isPlayerVisuallyDead(player)" class="tag-dead">💀 阵亡淘汰</span>
                  <span v-else-if="player.isWinner || isPlayerHandWinner(player)" class="tag-winner">
                    {{ player.id === myPlayer?.id ? '🏆 你赢了！' : '🏆 胜者' }}
                  </span>
                  <span v-else-if="player.isLoser && player.id === myPlayer?.id" class="tag-loser-shout">⚡ 比牌落败</span>
                  <span v-else-if="player.isLoser" class="tag-loser-shout">⚡ 败者</span>
                  <span v-else>{{ getStatusText(player) }}</span>
                </div>
              </div>
            </div>

            <!-- 玩家席位手牌 (本人/公开牌/阵亡观战视角均正面展示，其余暗面显示) -->
            <div class="player-cards">
              <PokerCard
                v-for="(card, cIdx) in (player.cards || [])"
                :key="cIdx"
                :card="card"
                size="sm"
                :face-down="card.hidden"
              />
            </div>

            <!-- 核心：玩家手枪 8 弹孔左轮弹膛装弹指示器 (严谨无风险池) -->
            <div class="cylinder-gun-bar">
              <div class="cyl-info">
                <div class="cyl-left">
                  <span class="gun-icon">🔫</span>
                  <span class="gun-lbl">左轮弹膛:</span>
                </div>
                <strong class="gun-val" :class="{ 'is-allin': player.isAllIn }">
                  {{ state.status === 'LOBBY' ? '0 / 8 发' : `${player.bulletsBet || 1} / 8 发` }}
                </strong>
              </div>

              <!-- 8 个独立弹孔槽位 -->
              <div class="cylinder-slots">
                <div
                  v-for="ch in 8"
                  :key="ch"
                  class="chamber-hole"
                  :class="{
                    'loaded': state.status !== 'LOBBY' && ch <= (player.bulletsBet || 1),
                    'allin-flame': state.status !== 'LOBBY' && player.isAllIn
                  }"
                  :title="state.status !== 'LOBBY' && ch <= (player.bulletsBet || 1) ? `第 ${ch} 弹巢已装填实弹` : `第 ${ch} 弹巢为空`"
                >
                  <span v-if="state.status !== 'LOBBY' && ch <= (player.bulletsBet || 1)" class="brass-bullet-dot"></span>
                </div>
              </div>
            </div>

            <!-- 大厅阶段房主移除踢人按钮 -->
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

    <!-- 底部控制栏与对决决策操作台 (房主与玩家统一展示本人操作台) -->
    <footer class="game-footer">
      <!-- 战报流水 (点击可展开左侧对局历史记录窗口) -->
      <div
        class="log-ticker"
        @click="showLogDrawer = true"
        title="点击展开左侧对局历史记录"
      >
        <span class="log-icon">📢</span>
        <span class="log-text">
          {{ formatLogText(state.logs && state.logs[0]) }}
        </span>
        <span class="log-hint-tag">📜 历史</span>
        <button
          v-if="state.showdownResult?.evaluatedList?.length && dismissShowdown && (state.status === 'SHOWDOWN' || state.status === 'HAND_SUMMARY')"
          class="reopen-showdown-btn"
          @click.stop="dismissShowdown = false"
        >
          🃏 查看比牌榜
        </button>
      </div>

      <!-- 操作与决策控制台 -->
      <div class="control-actions">
        <!-- 1. 开局大厅阶段 -->
        <template v-if="state.status === 'LOBBY'">
          <template v-if="isHost">
            <button
              class="c-btn bot-btn"
              :disabled="state.players.length >= (state.config.maxPlayers || 4)"
              @click="handleAddBot"
            >
              🤖 邀请电脑 AI
            </button>
            <button
              class="c-btn start-btn"
              :disabled="state.players.length < 2"
              @click="$emit('start-game')"
            >
              🔥 开始生死局 ({{ state.players.length }}/{{ state.config.maxPlayers || 4 }} 人就绪)
            </button>
          </template>
          <div v-else class="player-waiting-tip">
            ⏳ 正在等待房主开启生死局... (当前 {{ state.players.length }}/{{ state.config.maxPlayers || 4 }} 人已就座)
          </div>
        </template>

        <!-- 2. 小局总结阶段 -->
        <template v-else-if="state.status === 'HAND_SUMMARY'">
          <button
            v-if="state.showdownResult?.evaluatedList?.length && dismissShowdown"
            class="c-btn showdown-reopen-c-btn"
            @click.stop="dismissShowdown = false"
          >
            🃏 查看比牌
          </button>
          <button v-if="isHost" class="c-btn next-btn" @click="$emit('start-next-hand')">
            ⏭️ 进入下一手牌 (5秒后自动开启)
          </button>
          <div v-else class="player-waiting-tip">
            ⏳ 本副牌结算完成，5 秒后将自动发牌开启下一轮...
          </div>
        </template>

        <!-- 3. 终局结算 -->
        <template v-else-if="state.status === 'GAME_OVER'">
          <template v-if="isHost">
            <button class="c-btn start-btn" @click="$emit('start-game')">
              🔥 开启新一轮
            </button>
            <button class="c-btn bot-btn" @click="$emit('reset-lobby')">
              🔄 返回房间备战
            </button>
          </template>
          <div v-else class="player-waiting-tip">
            🏆 生死对决已决出唯一幸存者！等待房主开始新局...
          </div>
        </template>

        <!-- 4. 正在对决阶段 (BETTING)：统一呈现本人的私密手牌与决策按钮群 -->
        <div v-else class="gaming-action-deck">
          <!-- 阵亡观战状态提示 (右上角已常驻精简胶囊展示观战对象) -->
          <div v-if="isDeadSpectator" class="spectator-bottom-placeholder">
            <button
              v-if="state.showdownResult?.evaluatedList?.length && dismissShowdown"
              class="c-btn showdown-reopen-c-btn"
              @click.stop="dismissShowdown = false"
            >
              🃏 查看比牌
            </button>
            <span class="spectator-bottom-tip">💡 点击牌桌上任意存活选手席位可切换观战视角</span>
          </div>

          <!-- 存活玩家本人操作台 -->
          <template v-else>
            <!-- 决策行动按钮组 -->
            <div class="action-buttons-group">
              <!-- 跟注：每次加装 1 颗子弹，若场上有人 ALL-IN 则跟注 8 颗子弹 -->
              <button
                class="act-btn call-btn"
                :class="{ pulse: isMyTurn }"
                :disabled="!canAct"
                @click="$emit('action', 'CALL')"
              >
                {{ state.allInTriggered ? '🔥 跟注 (8 发子弹)' : `➕ 跟注 (装填至 ${nextBulletTarget} 弹)` }}
              </button>

              <!-- 弃牌：第 1 轮隐藏（由懦夫弃牌替代），第 2/3/4 轮显示 -->
              <button
                v-if="state.roundIndex > 1"
                class="act-btn fold-btn"
                :disabled="!canAct"
                @click="$emit('action', 'FOLD')"
              >
                🏳️ 弃牌 (面对 {{ myPlayer?.bulletsBet || 1 }} 弹)
              </button>

              <!-- 懦夫弃牌：仅首轮可用并显示，后续回合不再显示！面对 ALL-IN 禁用 -->
              <button
                v-if="state.roundIndex === 1"
                class="act-btn coward-btn"
                :disabled="!canAct || myPlayer?.hasUsedCowardFold || state.allInTriggered"
                title="首轮保命特权：仅需装填 1 颗子弹赌命逃跑"
                @click="$emit('action', 'COWARD_FOLD')"
              >
                🏃 懦夫弃牌 (1弹)
              </button>

              <!-- 换牌 Switch (面对 ALL-IN 禁用) -->
              <button
                v-if="state.config?.enableSwitch"
                class="act-btn switch-btn"
                :disabled="!canAct || myPlayer?.hasUsedSwitch || state.allInTriggered"
                title="置换 1 张手牌，本轮无法 ALL-IN"
                @click="requestSwitchCandidates"
              >
                🔄 换牌
              </button>

              <!-- ALL-IN 孤注一掷：牌库未显示 3 张牌前禁止 ALL-IN -->
              <button
                class="act-btn allin-btn"
                :disabled="!canAct || myPlayer?.switchedThisTurn || (state.communityRevealedCount || 0) < 3 || state.allInTriggered"
                :title="(state.communityRevealedCount || 0) < 3 ? '牌库未翻开 3 张公共牌前无法 ALL-IN' : '手枪装满 8 颗子弹！享 5% 奇迹生还'"
                @click="$emit('action', 'ALL_IN')"
              >
                🔥 ALL-IN
              </button>
            </div>

            <!-- 回合与决策反馈看板 (开枪期间不剧透输赢，仅在开枪判定揭晓后才显示) -->
            <div
              class="turn-status-banner"
              :class="{
                'is-my-turn': isMyTurn,
                'is-my-loser': isVisuallyMyPlayerDead,
                'is-my-winner': isMyWinner
              }"
            >
              <span v-if="isVisuallyMyPlayerDead" class="loser-shout">💥 你输了！中弹淘汰！</span>
              <span v-else-if="state.rouletteEvent && state.rouletteEvent.player && state.rouletteEvent.player.id === myPlayer?.id && !headRevealed">
                🔫 直面枪口... 扣动扳机中...
              </span>
              <span v-else-if="state.status !== 'LOBBY' && !myPlayer?.inHand">🏳️ 您已弃牌退出本手，等待下一副牌...</span>
              <span v-else-if="state.status === 'LOBBY'">⏳ 等待房主开始生死局...</span>
              <span v-else-if="isMyLoser" class="loser-shout">⚡ 比牌落败！手枪装填实弹，准备面对枪口！</span>
              <span v-else-if="isMyWinner" class="winner-shout">🏆 其他玩家已全部弃牌，你赢了！等待下一副牌...</span>
              <span v-else-if="state.allInTriggered && isMyTurn">🔥 【{{ state.allInPlayerName || '有玩家' }}】已发起 ALL-IN！请<template v-if="!state.config?.disableTurnTimer">在 <strong class="timer-num" :class="{ urgent: turnRemainingSeconds <= 5 }">{{ turnRemainingSeconds }}s</strong> 内</template>选择【跟注 8 弹】或【弃牌】！</span>
              <span v-else-if="state.allInTriggered">🔥 【{{ state.allInPlayerName || '有玩家' }}】发起 ALL-IN！等待 <strong>{{ currentTurnName }}</strong> 决策<template v-if="!state.config?.disableTurnTimer"> (<strong class="timer-num">{{ turnRemainingSeconds }}s</strong>)</template>...</span>
              <span v-else-if="isMyTurn">⚡ 轮到您决策！<template v-if="!state.config?.disableTurnTimer">请在 <strong class="timer-num" :class="{ urgent: turnRemainingSeconds <= 5 }">{{ turnRemainingSeconds }}s</strong> 内抉择行动！</template><template v-else>请抉择行动！</template></span>
              <span v-else-if="state.currentTurnPlayerId && currentTurnName">⏳ 等待 <strong>{{ currentTurnName }}</strong> 决策<template v-if="!state.config?.disableTurnTimer"> (<strong class="timer-num">{{ turnRemainingSeconds }}s</strong>)</template>...</span>
              <span v-else>⏳ 正在等待局势推进...</span>
            </div>
          </template>
        </div>
      </div>
    </footer>

    <!-- 好友联机加入链接弹窗 (无二维码，纯净复制与 IP 修改) -->
    <div v-if="showLinkModal" class="link-modal-mask" @click.self="showLinkModal = false">
      <div class="link-modal-card">
        <div class="modal-h">
          <div class="modal-title-box">
            <span class="m-icon">🔗</span>
            <h3>好友联机加入链接</h3>
          </div>
          <button class="close-x" title="关闭" @click="showLinkModal = false">✕</button>
        </div>

        <p class="modal-tip">
          同一 WiFi 或手机热点下的其他玩家，在手机浏览器中打开此链接即可入座：
        </p>

        <!-- 纯净直观的链接展示框 (点击亦可快速复制) -->
        <div class="link-display-section" @click="copyAndClose" title="点击即可复制并关闭">
          <div class="url-badge-box">
            <span class="url-text">{{ effectiveLanUrl }}</span>
          </div>
        </div>

        <div class="app-join-tip">
          💡 <strong>免安装即玩</strong>：用手机自带浏览器直接打开上方链接<br>
          📲 <strong>独立 App 联机</strong>：打开上方网页后可点击顶部下载 App，在 App 填入房主 IP <code>{{ displayShortUrl }}</code> 即可跨机联机！
        </div>

        <div class="modal-footer-actions">
          <button class="modal-btn-confirm" @click="copyAndClose">
            {{ copySuccess ? '✓ 已复制！' : '📋 复制并关闭' }}
          </button>
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

        <!-- 房间人数限制 (2 ~ 4 人) -->
        <div class="config-item">
          <div class="c-info">
            <span class="c-title">房间人数限制 (2 ~ 4 人)</span>
            <span class="c-desc">当前设置：{{ state.config?.maxPlayers || 4 }} 人局（最少2人，最多4人）</span>
          </div>
          <div class="num-selector">
            <button
              v-for="n in [2, 3, 4]"
              :key="n"
              class="num-choice-btn"
              :class="{ active: (state.config?.maxPlayers || 4) === n }"
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
              :checked="state.config?.enableSwitch"
              :disabled="state.status !== 'LOBBY'"
              @change="toggleSwitchRule"
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="config-item">
          <div class="c-info">
            <span class="c-title">比牌淘汰机制</span>
            <span class="c-desc">
              {{ state.config?.eliminateAllLosers ? '【默认】淘汰所有落败者直面枪口' : '【可选】仅淘汰最后一名最弱者' }}
            </span>
          </div>
          <button
            class="rule-toggle-btn"
            :disabled="state.status !== 'LOBBY'"
            @click="toggleEliminateRule"
          >
            {{ state.config?.eliminateAllLosers ? '默认：淘汰所有败者' : '温和：仅淘汰最弱者' }}
          </button>
        </div>

        <div class="config-item">
          <div class="c-info">
            <span class="c-title">观战无透视</span>
            <span class="c-desc">
              {{ state.config?.disableSpectatorXray ? '【开启】淘汰选手观战时无法透视他人底牌' : '【默认】淘汰选手可全景透视存活者手牌' }}
            </span>
          </div>
          <button
            class="rule-toggle-btn"
            :disabled="state.status !== 'LOBBY'"
            @click="toggleSpectatorXrayRule"
          >
            {{ state.config?.disableSpectatorXray ? '🙈 观战无透视' : '👁️ 观战全景透视' }}
          </button>
        </div>

        <div v-if="state.status !== 'LOBBY'" class="settings-warn">
          ⚠️ 游戏进行中无法更改规则，需在开局大厅设置。
        </div>
      </div>
    </div>

    <!-- 换牌底部栏 (不可取消，紧凑单行无遮挡) -->
    <SwitchDrawer
      :visible="showSwitchDrawer"
      :my-cards="myPlayer?.cards || []"
      :candidates="switchCandidates"
      :remaining-seconds="turnRemainingSeconds"
      @confirm="onSwitchConfirm"
      @update-choice="onSwitchChoiceUpdate"
    />

    <!-- 牌型指南 -->
    <HandRankGuide :visible="showRules" @close="showRules = false" />

    <!-- 摊牌比牌结算弹窗 (告知谁输谁赢，牌是第几大小) -->
    <ShowdownModal
      :visible="isShowdownModalVisible"
      :result="state.showdownResult"
      :community-cards="state.communityCards"
      :my-id="myId"
      :my-player="myPlayer"
      :is-host="isHost"
      @start-next-hand="onStartNextHandWithDismiss"
      @close="dismissShowdown = true"
    />

    <!-- 左侧滑出的历史对局战报记录窗口 (Drawer) -->
    <div
      v-if="showLogDrawer"
      class="log-drawer-mask"
      @click.self="showLogDrawer = false"
    >
      <div class="log-drawer-panel">
        <div class="ld-header">
          <div class="ld-title">
            <span class="ld-icon">📜</span>
            <span>对局战报历史记录</span>
            <span class="ld-count">({{ state.logs?.length || 0 }})</span>
          </div>
          <button class="ld-close-btn" @click="showLogDrawer = false" title="关闭窗口">✕</button>
        </div>

        <div class="ld-body">
          <div v-if="!state.logs || state.logs.length === 0" class="ld-empty">
            📭 暂无对局记录，请就座开局
          </div>
          <div
            v-for="(log, idx) in state.logs"
            :key="idx"
            class="ld-item"
            :class="getLogItemClass(log)"
          >
            <div class="ld-item-top">
              <span class="ld-item-time">{{ getLogTime(log) }}</span>
              <span class="ld-item-seq">#{{ state.logs.length - idx }}</span>
            </div>
            <div class="ld-item-msg">
              {{ getLogContent(log) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import HeadShooterOverlay from './HeadShooterOverlay.vue';
import HandRankGuide from './HandRankGuide.vue';
import SwitchDrawer from './SwitchDrawer.vue';
import PokerCard from './PokerCard.vue';
import ShowdownModal from './ShowdownModal.vue';
import { socketService } from '../api/socketService';
import { sounds } from '../utils/audio';

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
  },
  isHost: {
    type: Boolean,
    default: false
  }
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

const showLinkModal = ref(false);
const showRules = ref(false);
const showSettings = ref(false);
const showSwitchDrawer = ref(false);
const showLogDrawer = ref(false);
const switchCandidates = ref([]);
const dismissShowdown = ref(false);
const spectatingPlayerId = ref(null);
const headerExpanded = ref(false); // 默认收起顶部栏，留出最大视野避免遮挡上方选手

function handleAddBot() {
  console.log('[GameArena] handleAddBot triggered, emitting add-bot');
  emit('add-bot');
}

// 战报时间过滤（去除时区字样如 GMT+8、CST，仅保留清晰具体时间）
function formatLogText(log) {
  if (!log) return '欢迎来到骗子酒馆，请就座准备...';
  return log.replace(/\[\s*(?:GMT\+8|GMT\+08:00|CST|UTC|中国标准时间)?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:GMT\+8|GMT\+08:00|CST|UTC|中国标准时间)?\s*\]/gi, '[$1]');
}

function getLogTime(log) {
  if (!log) return '';
  const cleaned = formatLogText(log);
  const match = cleaned.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
  return match ? match[1] : '';
}

function getLogContent(log) {
  if (!log) return '';
  const cleaned = formatLogText(log);
  return cleaned.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '');
}

function getLogItemClass(log) {
  if (!log) return '';
  if (log.includes('砰') || log.includes('枪火吞噬') || log.includes('💀')) return 'is-bang';
  if (log.includes('咔嗒') || log.includes('空枪生还') || log.includes('💨')) return 'is-click';
  if (log.includes('胜负终局') || log.includes('唯一幸存者') || log.includes('👑')) return 'is-win';
  if (log.includes('ALL-IN') || log.includes('孤注一掷') || log.includes('🔥')) return 'is-allin';
  if (log.includes('换牌') || log.includes('🔄')) return 'is-switch';
  return '';
}

// 自定义/手动 WiFi IP 处理
const customIp = ref(localStorage.getItem('liarsbar_custom_lan_ip') || '');
const customIpInput = ref(customIp.value);
const showCustomIp = ref(false);
const copySuccess = ref(false);
let copyTimer = null;

// 从 Android 原生接口直接读取手机当前的真实 WiFi IP
function getNativeAndroidIp() {
  try {
    if (window.AndroidDevice && typeof window.AndroidDevice.getDeviceIp === 'function') {
      const ip = window.AndroidDevice.getDeviceIp();
      if (ip && ip !== '127.0.0.1' && ip !== '0.0.0.0') {
        return ip;
      }
    }
  } catch (e) {}
  return null;
}

// 判断当前展示的 IP 是否为 localhost 或 127.0.0.1
const isLocalhostOrLoopback = computed(() => {
  if (customIp.value) return false;
  if (getNativeAndroidIp()) return false;
  const ip = props.serverInfo?.lanIp || '';
  const url = props.serverInfo?.lanUrl || '';
  return !ip || ip === '127.0.0.1' || ip === 'localhost' || url.includes('localhost') || url.includes('127.0.0.1');
});

// 计算最终有效的联机 URL
const effectiveLanUrl = computed(() => {
  const port = props.serverInfo?.port || 9527;
  // 1. 若用户手动修改了 IP，以手动为准
  if (customIp.value) {
    return `http://${customIp.value}:${port}`;
  }
  // 2. 优先从 Android 原生系统 API 读取手机真实 WiFi IP！
  const nativeIp = getNativeAndroidIp();
  if (nativeIp) {
    return `http://${nativeIp}:${port}`;
  }
  // 3. 读取 Node.js 服务端网络探测到的真实局域网 IP
  if (props.serverInfo?.lanIp && props.serverInfo.lanIp !== '127.0.0.1' && props.serverInfo.lanIp !== 'localhost') {
    return `http://${props.serverInfo.lanIp}:${port}`;
  }
  if (props.serverInfo?.lanUrl && !props.serverInfo.lanUrl.includes('localhost') && !props.serverInfo.lanUrl.includes('127.0.0.1')) {
    return props.serverInfo.lanUrl;
  }
  return `http://${props.serverInfo?.lanIp || 'localhost'}:${port}`;
});

const displayShortUrl = computed(() => {
  return effectiveLanUrl.value.replace(/^https?:\/\//, '');
});

function openLinkModal() {
  copySuccess.value = false;
  showLinkModal.value = true;
}

function saveCustomIp() {
  const clean = customIpInput.value.trim().replace(/^https?:\/\//, '').replace(/:\d+.*$/, '');
  customIp.value = clean;
  if (clean) {
    localStorage.setItem('liarsbar_custom_lan_ip', clean);
  } else {
    localStorage.removeItem('liarsbar_custom_lan_ip');
  }
}

function resetCustomIp() {
  customIp.value = '';
  customIpInput.value = '';
  localStorage.removeItem('liarsbar_custom_lan_ip');
}

async function copyLink() {
  const url = effectiveLanUrl.value;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    copySuccess.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copySuccess.value = false;
    }, 2500);
  } catch (err) {
    console.error('复制失败:', err);
    alert(`请长按选中复制链接:\n${url}`);
  }
}

function copyAndClose() {
  copyLink();
  setTimeout(() => {
    showLinkModal.value = false;
  }, 400);
}

// 头部开枪状态管理
const headShooting = ref(false);
const headRevealed = ref(false);
const isViewingOwnDeathRoulette = ref(false); // 关键：本人正在第一视角面对枪口开枪，禁止提前切到他人观战视角
let deathRouletteTimer = null;

// 换牌行动广播显示（弹出一会后自动消失）
const showSwitchToast = ref(false);
let switchToastTimer = null;

watch(
  () => props.state.lastAction,
  (action) => {
    if (action && action.action === 'SWITCH') {
      showSwitchToast.value = true;
      if (switchToastTimer) clearTimeout(switchToastTimer);
      switchToastTimer = setTimeout(() => {
        showSwitchToast.value = false;
      }, 3500); // 3.5秒后自动淡出消失
    }
  },
  { deep: true }
);

watch(
  () => props.state.rouletteEvent,
  (newEv) => {
    if (newEv) {
      dismissShowdown.value = true; // 触发开枪动画时立即关闭比牌弹窗，绝不重复弹窗遮挡动画
      headShooting.value = true;
      headRevealed.value = false;

      // 如果当前受枪决的是本人，锁定本视角在正下方，禁止提前切至他人观战
      if (myPlayer.value && newEv.player && newEv.player.id === myPlayer.value.id) {
        isViewingOwnDeathRoulette.value = true;
        if (deathRouletteTimer) clearTimeout(deathRouletteTimer);
      }

      sounds.playCockHammer();
      sounds.playCylinderSpin();
      sounds.playHeartbeat();

      setTimeout(() => {
        headShooting.value = false;
        headRevealed.value = true;
        if (newEv.result?.isBang) {
          sounds.playGunshot();
        } else {
          sounds.playClick();
          if (newEv.result?.miracleSaved) {
            sounds.playVictory();
          }
        }

        // 开枪判定击发后，给玩家留出 2.8 秒清晰凝视自己主视角中弹/生还画面的时间，之后方可允许转入观战视角
        if (isViewingOwnDeathRoulette.value) {
          deathRouletteTimer = setTimeout(() => {
            isViewingOwnDeathRoulette.value = false;
          }, 2800);
        }
      }, 2400);
    } else {
      headShooting.value = false;
      headRevealed.value = false;
      if (deathRouletteTimer) clearTimeout(deathRouletteTimer);
      isViewingOwnDeathRoulette.value = false;
    }
  },
  { deep: true }
);

watch(
  () => [props.state?.status, props.state?.handNumber],
  ([newStatus, newHand], [oldStatus, oldHand]) => {
    // 只有在进入新的一手牌，或者由非比牌状态首次切入 SHOWDOWN 时，才自动开启比牌窗口
    if (newHand !== oldHand || (newStatus === 'SHOWDOWN' && oldStatus !== 'SHOWDOWN')) {
      dismissShowdown.value = false;
    }
    // 进入开枪动画阶段时，主动关闭比牌弹窗，确保玩家畅快观赏开枪动画
    if (newStatus === 'ROULETTE') {
      dismissShowdown.value = true;
    }
    if (newStatus === 'BETTING') {
      isViewingOwnDeathRoulette.value = false;
    }
  }
);

// 获取当前客户端所代表的本人选手对象
const myPlayer = computed(() => {
  if (!props.state || !props.state.players) return null;
  const self = props.state.players.find(p => p.id === props.myId);
  if (self) return self;
  if (props.isHost) {
    return props.state.players.find(p => p.isHost) || null;
  }
  return null;
});

// 本人是否已不幸阵亡处于观战状态 (若当前正处于自己的主视角开枪中弹流程，绝不提前切走视角)
const isDeadSpectator = computed(() => {
  if (isViewingOwnDeathRoulette.value) return false;
  return Boolean(myPlayer.value && !myPlayer.value.isAlive);
});

// 阵亡观战时默认选中第一个存活玩家
watch(
  () => [isDeadSpectator.value, props.state.players],
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

// 基准第一视角 ID (正常为自己，开枪动画期间恒定为自己，动画结束且阵亡后方切为所选观战选手)
const effectiveViewerId = computed(() => {
  if (isViewingOwnDeathRoulette.value && myPlayer.value) {
    return myPlayer.value.id;
  }
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

// 当前主视角/观战视角选手
const spectatingPlayer = computed(() => {
  if (!props.state?.players) return null;
  return props.state.players.find(p => p.id === effectiveViewerId.value) || null;
});

// 动态逆时针旋转玩家席位：主视角恒定在正下方 (bottom)，界面上严格按逆时针环绕：下 ➔ 右 ➔ 上 ➔ 左
const positionedPlayers = computed(() => {
  const players = props.state?.players || [];
  if (players.length === 0) return [];

  const viewerId = effectiveViewerId.value;
  const viewerIdx = players.findIndex(p => p.id === viewerId);
  const baseIdx = viewerIdx !== -1 ? viewerIdx : 0;
  const n = players.length;

  const result = [];
  for (let i = 0; i < n; i++) {
    const p = players[(baseIdx + i) % n];
    let slot = 'bottom';
    if (n === 2) {
      slot = (i === 0) ? 'bottom' : 'top';
    } else if (n === 3) {
      // 逆时针：0->下 (bottom), 1->右 (right), 2->左 (left)
      slot = (i === 0) ? 'bottom' : (i === 1 ? 'right' : 'left');
    } else {
      // 4人局逆时针：0->下 (bottom), 1->右 (right), 2->上 (top), 3->左 (left)
      slot = (i === 0) ? 'bottom' : (i === 1 ? 'right' : (i === 2 ? 'top' : 'left'));
    }

    result.push({
      ...p,
      slot
    });
  }
  return result;
});

function onSeatClick(player) {
  if (isDeadSpectator.value && player.isAlive) {
    spectatingPlayerId.value = player.id;
  }
}

// 本人是否输掉了当前比牌对决
const isMyLoser = computed(() => {
  if (!myPlayer.value) return false;
  if (myPlayer.value.isLoser) return true;
  if (props.state?.showdownResult?.punishedPlayers) {
    return props.state.showdownResult.punishedPlayers.some(p => p.id === myPlayer.value.id);
  }
  return false;
});

// 判定指定玩家是否为本手牌的胜利者
function isPlayerHandWinner(player) {
  if (!player) return false;
  if (player.isWinner) return true;
  if (props.state?.showdownResult?.winners?.some(w => w.id === player.id)) return true;
  // 如果当前对局中仅剩此一人在手存活，他直接胜出
  if (
    props.state.status !== 'LOBBY' &&
    props.state.status !== 'GAME_OVER' &&
    player.isAlive &&
    player.inHand
  ) {
    const aliveInHand = (props.state.players || []).filter(p => p.isAlive && p.inHand);
    if (aliveInHand.length === 1 && aliveInHand[0].id === player.id) {
      return true;
    }
  }
  return false;
}

// 本人是否赢得了当前比牌对决
const isMyWinner = computed(() => {
  if (!myPlayer.value) return false;
  return isPlayerHandWinner(myPlayer.value);
});

function onStartNextHandWithDismiss() {
  dismissShowdown.value = true;
  emit('start-next-hand');
}

// 视觉层本人是否中弹阵亡（如果在开枪中且动画未揭晓判定结果，绝不提前显示“你输了/中弹淘汰”）
const isVisuallyMyPlayerDead = computed(() => {
  if (!myPlayer.value || myPlayer.value.isAlive) return false;
  if (
    props.state?.rouletteEvent &&
    props.state.rouletteEvent.player &&
    props.state.rouletteEvent.player.id === myPlayer.value.id &&
    !headRevealed.value
  ) {
    return false;
  }
  return true;
});

// 摊牌比牌结算弹窗是否展示 (SHOWDOWN 与 HAND_SUMMARY 阶段默认展示；ROULETTE 开枪动画阶段严禁自动弹窗遮挡)
const isShowdownModalVisible = computed(() => {
  if (dismissShowdown.value) return false;
  if (props.state?.status === 'ROULETTE') return false; // 严禁在开枪阶段遮挡动画
  if (!props.state?.showdownResult?.evaluatedList || props.state.showdownResult.evaluatedList.length === 0) {
    return false;
  }
  return ['SHOWDOWN', 'HAND_SUMMARY'].includes(props.state.status);
});

// 是否轮到本人决策
const isMyTurn = computed(() => {
  return (
    props.state.status === 'BETTING' &&
    !isMyWinner.value &&
    myPlayer.value &&
    props.state.currentTurnPlayerId === myPlayer.value.id
  );
});

// 本人是否可以执行行动
const canAct = computed(() => {
  return (
    isMyTurn.value &&
    !isMyWinner.value &&
    props.state.status === 'BETTING' &&
    myPlayer.value &&
    myPlayer.value.isAlive &&
    myPlayer.value.inHand
  );
});

// 下一步跟注装填的子弹数 (最多8发)
const nextBulletTarget = computed(() => {
  const current = myPlayer.value?.bulletsBet || 1;
  return Math.min(8, current + 1);
});

// 当前行动者姓名
const currentTurnName = computed(() => {
  if (!props.state || !props.state.players) return '';
  const p = props.state.players.find(x => x.id === props.state.currentTurnPlayerId);
  return p ? p.name : '';
});

// 轮次名称
function getRoundPhaseName(roundIndex, commCount) {
  if (roundIndex === 1) return '第 1 轮：翻牌前 Pre-Flop (公共牌 0/5)';
  if (roundIndex === 2) return '第 2 轮：翻牌圈 Flop (已开 3 张)';
  if (roundIndex === 3) return '第 3 轮：转牌圈 Turn (已开 4 张)';
  if (roundIndex === 4) return '第 4 轮：河牌圈 River (全部翻开 5 张)';
  return '⚡ 终局摊牌时刻 (Showdown)';
}

// 轮次推进提示
function getRoundBulletHint(roundIndex) {
  if (roundIndex === 1) return '全员手枪装填至 2 发 (牌库未开3张前禁止 ALL-IN)';
  if (roundIndex === 2) return '全员手枪装填至 3 发 (现已允许 ALL-IN)';
  if (roundIndex === 3) return '全员手枪装填至 4 发';
  if (roundIndex === 4) return '全员手枪装填至 5 发 · 准备摊牌决胜';
  return '比对最佳 7 选 5 牌型 · 败者承受 5/8 概率实弹射击';
}

// 视觉层判定玩家是否阵亡：若该玩家正在直面枪口开枪或动画仍在进行，则保持生动头像
function isPlayerVisuallyDead(player) {
  if (player.isAlive) return false;
  // 如果此人正是当前正在接受开枪裁决的受罚者，且尚未完成开枪全流程，则保持生动头像
  if (
    props.state.rouletteEvent &&
    props.state.rouletteEvent.player &&
    props.state.rouletteEvent.player.id === player.id &&
    (!headRevealed.value || (player.id === myPlayer.value?.id && isViewingOwnDeathRoulette.value))
  ) {
    return false;
  }
  return true;
}

function getStatusText(player) {
  if (props.state.status === 'LOBBY') return '⌛ 准备就绪';
  if (!player.isAlive) return '💀 阵亡淘汰';
  if (!player.inHand) return '🏳️ 已弃牌';
  if (player.isWinner || isPlayerHandWinner(player)) return '🏆 胜者';
  if (player.isAllIn) return '🔥 ALL-IN';
  if (props.state.status === 'BETTING' && props.state.currentTurnPlayerId === player.id) {
    return `⏳ 决策中 (${turnRemainingSeconds.value}s)`;
  }
  if (player.hasActedInRound) return '🔒 已跟注';
  return '⌛ 候场中';
}

function getStatusClass(player) {
  if (props.state.status === 'LOBBY') return 'tag-normal';
  if (!player.isAlive) return 'tag-dead';
  if (!player.inHand) return 'tag-folded';
  if (player.isWinner || isPlayerHandWinner(player)) return 'tag-winner';
  if (player.isAllIn) return 'tag-allin';
  if (props.state.status === 'BETTING' && props.state.currentTurnPlayerId === player.id) return 'tag-acting';
  return 'tag-normal';
}

function setMaxPlayers(num) {
  emit('update-config', { maxPlayers: num });
}

function toggleSwitchRule() {
  emit('update-config', { enableSwitch: !props.state.config.enableSwitch });
}

function toggleEliminateRule() {
  emit('update-config', { eliminateAllLosers: !props.state.config.eliminateAllLosers });
}

function toggleSpectatorXrayRule() {
  emit('update-config', { disableSpectatorXray: !props.state.config.disableSpectatorXray });
}

// 20秒决策倒计时计算与更新驱动
const turnRemainingSeconds = ref(20);
let turnTimerInterval = null;

function updateCountdown() {
  if (props.state?.status === 'BETTING' && props.state?.turnDeadline) {
    const diff = Math.max(0, Math.ceil((props.state.turnDeadline - Date.now()) / 1000));
    turnRemainingSeconds.value = Math.min(20, diff);
  } else {
    turnRemainingSeconds.value = 20;
  }
}

watch(
  () => [props.state?.currentTurnPlayerId, props.state?.turnDeadline, props.state?.status],
  () => {
    updateCountdown();
    // 若不再轮到本人或不在投注阶段，自动关闭换牌栏
    if (props.state?.status !== 'BETTING' || props.state?.currentTurnPlayerId !== myPlayer.value?.id) {
      showSwitchDrawer.value = false;
    }
  }
);

onMounted(() => {
  turnTimerInterval = setInterval(updateCountdown, 250);
  // 单次监听换牌候选牌响应
  socketService.on('switch_candidates', (candidates) => {
    if (candidates && candidates.length > 0) {
      switchCandidates.value = candidates;
      showSwitchDrawer.value = true;
    }
  });
});

onUnmounted(() => {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
});

function requestSwitchCandidates() {
  socketService.send('REQUEST_SWITCH_CANDIDATES');
}

function onSwitchChoiceUpdate(payload) {
  socketService.send('SELECT_SWITCH_CHOICE', payload);
}

function onSwitchConfirm({ discardIndex, newCard }) {
  showSwitchDrawer.value = false;
  emit('action', 'SWITCH', {
    discardCardIndex: discardIndex,
    newCard
  });
}
</script>

<style scoped>
.game-stage {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: radial-gradient(circle at 50% 30%, #161824 0%, #0a0b10 100%);
  overflow: hidden;
  color: #f8fafc;
  position: relative;
}

/* 左上角轻量常驻浮动控制区 (默认收起状态下提供菜单展开与联机链接) */
.top-collapsed-bar {
  position: absolute;
  top: 8px;
  left: 10px;
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}

.header-toggle-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  color: #f1f5f9;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
  transition: all 0.2s;
}

.header-toggle-pill:hover {
  background: #1e293b;
  border-color: #38bdf8;
  color: #38bdf8;
}

.lan-mini-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid #1e293b;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  transition: all 0.2s;
}

.lan-mini-pill:hover {
  background: #1e293b;
  border-color: #22c55e;
  color: #4ade80;
}

.victory-floating-pill {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 95;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
  border: none;
  border-radius: 9999px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
  animation: pulse-glow 2s infinite;
}

.showdown-reopen-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  border: 1px solid #818cf8;
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
  transition: all 0.2s;
}

.showdown-reopen-pill:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  transform: scale(1.04);
}

.showdown-reopen-c-btn {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  color: #ffffff !important;
  border-color: #818cf8 !important;
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

.spectator-bottom-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
}

.spectator-bottom-tip {
  font-size: 11px;
  color: #94a3b8;
}

.collapse-btn {
  background: #1e293b !important;
  border-color: #475569 !important;
  color: #94a3b8 !important;
}

.collapse-btn:hover {
  background: #334155 !important;
  color: #ffffff !important;
}

.header-click-outside-backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: transparent;
}

/* 顶部状态栏 */
.game-header {
  position: relative;
  z-index: 95;
  height: 60px;
  background: #11121a;
  border-bottom: 1px solid #232736;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.logo {
  font-size: 24px;
}

.title-wrap h2 {
  font-size: 16px;
  font-weight: 800;
  color: #fbbf24;
  letter-spacing: 0.5px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.host-pill {
  font-size: 11px;
  font-weight: 800;
  color: #0f172a;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  padding: 1px 6px;
  border-radius: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.lan-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #1e2230;
  border: 1px solid #333b52;
  padding: 4px 8px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 11px;
  color: #38bdf8;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.lan-pill:hover {
  border-color: #38bdf8;
  background: #252b3d;
}

.lan-pill .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  flex-shrink: 0;
}

.lan-pill .ip-txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}

.icon-tool-btn,
.cancel-room-btn,
.leave-room-btn {
  white-space: nowrap; /* 核心：绝不允许折行变成两行！ */
  word-break: keep-all;
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-tool-btn {
  background: #202434;
  border: 1px solid #333b52;
  color: #e2e8f0;
}

.icon-tool-btn:hover {
  background: #2d334a;
  color: #fbbf24;
}

.cancel-room-btn {
  background: #450a0a;
  border: 1px solid #991b1b;
  color: #fca5a5;
}

.cancel-room-btn:hover {
  background: #dc2626;
  color: #ffffff;
}

.leave-room-btn {
  background: #1e293b;
  border: 1px solid #475569;
  color: #cbd5e1;
}

.leave-room-btn:hover {
  background: #334155;
  color: #ffffff;
}

/* 牌桌主体核心区 */
.table-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 32px;
  position: relative;
  overflow: visible;
}

.poker-table {
  width: 76%;
  max-width: 760px;
  height: 74%;
  max-height: 400px;
  background: radial-gradient(ellipse at center, #0e3d2f 30%, #062119 85%);
  border: 10px solid #2b1810;
  border-radius: 9999px;
  box-shadow: inset 0 0 50px #000, 0 12px 36px rgba(0, 0, 0, 0.85);
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
  position: relative;
  z-index: 35;
}

.texas-lobby-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  padding: 6px 16px;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
.texas-lobby-center .lobby-badge {
  font-size: 13px;
  font-weight: 800;
  color: #38bdf8;
}
.texas-lobby-center .lobby-sub {
  font-size: 11px;
  color: #94a3b8;
}
.texas-lobby-center .center-lobby-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.action-broadcast-toast {
  position: absolute;
  bottom: -34px; /* 置于公共牌下方，绝不遮挡上方玩家，同时保持高层级 */
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 27, 75, 0.96);
  border: 1.5px solid #818cf8;
  color: #c7d2fe;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 14px;
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.7);
  white-space: nowrap;
  animation: pulseGlow 1.5s infinite alternate;
  z-index: 100;
  pointer-events: none;
}

@keyframes pulseGlow {
  from { box-shadow: 0 0 10px rgba(99, 102, 241, 0.4); }
  to { box-shadow: 0 0 20px rgba(99, 102, 241, 0.8); }
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.cards-felt {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
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
  width: 156px;
  background: #171822;
  border: 2px solid #2e3549;
  border-radius: 12px;
  padding: 6px 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
  transition: all 0.25s;
}

/* 玩家决策动作气泡 (高可见度) */
.seat-action-bubble {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  z-index: 25;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.5px;
  pointer-events: none;
}

.seat-action-bubble.bubble-call {
  background: linear-gradient(135deg, #059669, #10b981);
  color: #ffffff;
  border: 1px solid #34d399;
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.5);
}

.seat-action-bubble.bubble-fold {
  background: linear-gradient(135deg, #475569, #334155);
  color: #f1f5f9;
  border: 1px solid #64748b;
}

.seat-action-bubble.bubble-coward_fold {
  background: linear-gradient(135deg, #d97706, #b45309);
  color: #ffffff;
  border: 1px solid #f59e0b;
  box-shadow: 0 3px 10px rgba(217, 119, 6, 0.5);
}

.seat-action-bubble.bubble-all_in {
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  color: #fef08a;
  border: 1.5px solid #fef08a;
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.8), 0 2px 8px rgba(0, 0, 0, 0.8);
  animation: allInPulse 1.2s infinite alternate;
}

.seat-action-bubble.bubble-switch {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #ffffff;
  border: 1px solid #a78bfa;
  box-shadow: 0 3px 10px rgba(99, 102, 241, 0.5);
}

.action-bubble-pop-enter-active {
  animation: bubblePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.action-bubble-pop-leave-active {
  transition: all 0.2s ease-in;
}

.action-bubble-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px) scale(0.85);
}

@keyframes bubblePop {
  0% { transform: translate(-50%, 6px) scale(0.7); opacity: 0; }
  100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
}

@keyframes allInPulse {
  0% { transform: translateX(-50%) scale(1); box-shadow: 0 0 10px rgba(239, 68, 68, 0.6); }
  100% { transform: translateX(-50%) scale(1.06); box-shadow: 0 0 20px rgba(239, 68, 68, 0.9), 0 0 8px #fef08a; }
}

.seat-card.is-me {
  border-color: #38bdf8;
  background: #161c28;
}

.seat-card.is-turn {
  border-color: #fbbf24;
  box-shadow: 0 0 24px rgba(251, 191, 36, 0.7);
}

.seat-card.is-dead {
  opacity: 0.45;
  filter: grayscale(80%);
}

.seat-card.is-allin {
  border-color: #ef4444;
  box-shadow: 0 0 24px rgba(239, 68, 68, 0.7);
}

/* 第一视角动态绝对定位：放置在桌子外侧黑底空间，避免与桌心公共牌/转盘冲突 */
.seat-slot-bottom {
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%) translateY(100%);
  z-index: 15;
}

.seat-slot-left {
  left: -14px;
  top: 50%;
  transform: translateX(-100%) translateY(-50%);
  z-index: 14;
}

.seat-slot-top {
  top: 14px;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  z-index: 14;
}

.seat-slot-right {
  right: -14px;
  top: 50%;
  transform: translateX(100%) translateY(-50%);
  z-index: 14;
}

.victory-reopen-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
  animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
  50% { box-shadow: 0 0 16px rgba(245, 158, 11, 0.85); transform: scale(1.04); }
}

.seat-card.can-click-spectate {
  cursor: pointer;
}

.seat-card.can-click-spectate:hover {
  border-color: #38bdf8;
  transform: scale(1.03);
}

.seat-card.is-spectating {
  border-color: #a855f7;
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.6);
}

.spec-badge {
  position: absolute;
  top: -8px;
  left: -6px;
  font-size: 9px;
  background: #a855f7;
  color: #fff;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 800;
}

.spec-tag {
  color: #c084fc;
  font-size: 10px;
  margin-left: 2px;
}

.spectator-view-strip {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(88, 28, 135, 0.25);
  border: 1px solid #a855f7;
  padding: 6px 14px;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(168, 85, 247, 0.2);
  flex-wrap: wrap;
}

.spectator-info-box {
  display: flex;
  flex-direction: column;
}

.spec-eye {
  font-size: 11px;
  font-weight: 800;
  color: #c084fc;
}

.spec-target {
  font-size: 13px;
  color: #f1f5f9;
}

.spec-target strong {
  color: #fde047;
}

.spec-tip {
  font-size: 10px;
  color: #94a3b8;
}

.spectator-cards-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spec-cards-lbl {
  font-size: 11px;
  font-weight: 800;
  color: #c084fc;
}

.spec-cards-row {
  display: flex;
  gap: 4px;
}

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

.me-badge {
  position: absolute;
  bottom: -4px;
  left: -4px;
  font-size: 9px;
  background: #10b981;
  color: #fff;
  padding: 1px 3px;
  border-radius: 4px;
  font-weight: 800;
}

.seat-user {
  flex: 1;
  min-width: 0;
}

.seat-user .uname {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-tag {
  color: #38bdf8;
  font-size: 10px;
  margin-left: 2px;
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
  margin-top: 1px;
}

.tag-acting { color: #fbbf24; }
.tag-folded { color: #94a3b8; }
.tag-allin { color: #ef4444; }
.tag-dead { color: #64748b; }
.tag-normal { color: #22c55e; }
.tag-winner { color: #f59e0b; font-weight: 800; text-shadow: 0 0 8px rgba(245, 158, 11, 0.5); }

.player-cards {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: center;
}

/* 核心：8孔左轮弹膛装弹条 */
.cylinder-gun-bar {
  margin-top: 6px;
  background: #0f1118;
  border: 1px solid #232738;
  border-radius: 8px;
  padding: 4px 6px;
}

.cyl-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.cyl-left {
  display: flex;
  align-items: center;
  gap: 3px;
}

.gun-icon {
  font-size: 11px;
}

.gun-val {
  color: #f59e0b;
  font-weight: 800;
  font-size: 11px;
}

.gun-val.is-allin {
  color: #ef4444;
}

.cylinder-slots {
  display: flex;
  gap: 3px;
  justify-content: space-between;
  align-items: center;
}

.chamber-hole {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #090a0f;
  border: 1.5px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
}

.chamber-hole.loaded {
  border-color: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
  background: radial-gradient(circle, #78350f 20%, #451a03 100%);
}

.brass-bullet-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fef08a 0%, #f59e0b 60%, #b45309 100%);
  box-shadow: inset 0 0 1px #000, 0 0 3px #fbbf24;
}

.chamber-hole.allin-flame {
  border-color: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.8);
  background: radial-gradient(circle, #991b1b 20%, #450a0a 100%);
}

.chamber-hole.allin-flame .brass-bullet-dot {
  background: radial-gradient(circle at 35% 35%, #fecaca 0%, #ef4444 60%, #991b1b 100%);
  box-shadow: 0 0 5px #ef4444;
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

/* 底部操作与控制台 */
.game-footer {
  min-height: 56px;
  position: relative; /* 核心：激活定位层级，确保按钮层级最高 */
  z-index: 50;
  background: #11121a;
  border-top: 1px solid #232736;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  gap: 10px;
  flex-shrink: 0;
}

.log-ticker {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.18);
  transition: all 0.2s ease;
  user-select: none;
}

.log-ticker:hover, .log-ticker:active {
  background: rgba(30, 41, 59, 0.85);
  border-color: #38bdf8;
  color: #f8fafc;
  transform: translateY(-1px);
}

.log-hint-tag {
  font-size: 10px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* 左侧滑出历史战报抽屉 (Drawer) */
.log-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 1060;
  display: flex;
  justify-content: flex-start;
  animation: logDrawerFadeIn 0.2s ease-out;
}

@keyframes logDrawerFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.log-drawer-panel {
  width: 400px;
  max-width: 82vw;
  height: 100%;
  background: #0f172a;
  border-right: 2px solid #334155;
  box-shadow: 10px 0 30px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  animation: logDrawerSlideLeft 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes logDrawerSlideLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.ld-header {
  padding: 12px 16px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.ld-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: #fbbf24;
}

.ld-icon {
  font-size: 18px;
}

.ld-count {
  font-size: 12px;
  color: #94a3b8;
  font-weight: normal;
}

.ld-close-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #475569;
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.ld-close-btn:hover, .ld-close-btn:active {
  background: #ef4444;
  border-color: #ef4444;
  color: #fff;
}

.ld-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #090d16;
}

.ld-empty {
  text-align: center;
  color: #64748b;
  font-size: 13px;
  padding: 40px 10px;
}

.ld-item {
  padding: 8px 10px;
  border-radius: 8px;
  background: #1e293b;
  border: 1px solid #334155;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.15s ease;
}

.ld-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.ld-item-time {
  color: #38bdf8;
  font-weight: 700;
  font-family: monospace;
}

.ld-item-seq {
  color: #64748b;
  font-size: 10px;
}

.ld-item-msg {
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.45;
  word-break: break-word;
}

/* 各类型高亮状态 */
.ld-item.is-bang {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.4);
}
.ld-item.is-bang .ld-item-msg {
  color: #fca5a5;
  font-weight: 600;
}

.ld-item.is-click {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.35);
}
.ld-item.is-click .ld-item-msg {
  color: #86efac;
}

.ld-item.is-allin {
  background: rgba(249, 115, 22, 0.1);
  border-color: rgba(249, 115, 22, 0.4);
}
.ld-item.is-allin .ld-item-msg {
  color: #fdba74;
  font-weight: 600;
}

.ld-item.is-win {
  background: rgba(234, 179, 8, 0.12);
  border-color: rgba(234, 179, 8, 0.45);
}
.ld-item.is-win .ld-item-msg {
  color: #fef08a;
  font-weight: bold;
}

.ld-item.is-switch {
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.35);
}
.ld-item.is-switch .ld-item-msg {
  color: #d8b4fe;
}

.reopen-showdown-btn {
  background: #3b2805;
  border: 1px solid #f59e0b;
  color: #fef08a;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
}

.reopen-showdown-btn:hover {
  background: #78350f;
  color: #fff;
}

.control-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  position: relative;
  z-index: 51;
}

.player-waiting-tip {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
  padding: 6px 12px;
  background: #1a1d28;
  border-radius: 8px;
  border: 1px solid #2e3549;
  white-space: nowrap;
}

.c-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  position: relative;
  z-index: 52;
}

.c-btn:active {
  transform: scale(0.96);
}

.c-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(40%);
  transform: none;
}

.bot-btn {
  background: #1f2937;
  color: #38bdf8;
  border: 1px solid #0284c7;
}

.bot-btn:hover:not(:disabled) {
  background: #0369a1;
  color: #fff;
}

.start-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
}

.start-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #fbbf24 0%, #ea580c 100%);
}

.next-btn {
  background: #10b981;
  color: #ffffff;
}

.reset-btn {
  background: #6366f1;
  color: #ffffff;
}

/* 对决阶段统一行动台 */
.gaming-action-deck {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.act-btn {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.act-btn:disabled {
  opacity: 0.35;
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

.coward-btn {
  background: #451a03;
  color: #fb923c;
  border: 1px solid #9a3412;
}

.switch-btn {
  background: #1e1b4b;
  color: #818cf8;
  border: 1px solid #4338ca;
}

.allin-btn {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: #ffffff;
  font-weight: 900;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.turn-status-banner {
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  background: #1e293b;
  color: #94a3b8;
}

.turn-status-banner.is-my-turn {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid #f59e0b;
}

.turn-status-banner.is-my-loser {
  background: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  border: 2px solid #ef4444;
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
  animation: losePulse 1s infinite alternate;
}

.turn-status-banner.is-my-winner {
  background: rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
  border: 2px solid #10b981;
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
}

.timer-num {
  color: #fbbf24;
  font-weight: 800;
  display: inline-block;
  padding: 0 2px;
}

.timer-num.urgent {
  color: #ef4444;
  text-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
}

.loser-shout {
  color: #fca5a5;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 0.5px;
}

.winner-shout {
  color: #6ee7b7;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 0.5px;
}

.tag-loser-shout {
  color: #ef4444;
  font-weight: 900;
  animation: losePulse 1s infinite alternate;
}

@keyframes losePulse {
  from { opacity: 0.8; }
  to { opacity: 1; transform: scale(1.02); }
}

/* 模态弹窗通用 */
.link-modal-mask, .settings-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.link-modal-card, .settings-card {
  width: 100%;
  max-width: 460px;
  background: #171822;
  border: 2px solid #3b4256;
  border-radius: 16px;
  padding: 18px 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #282f42;
  padding-bottom: 10px;
}

.modal-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-title-box .m-icon {
  font-size: 18px;
}

.modal-h h3 {
  font-size: 16px;
  font-weight: 800;
  color: #fbbf24;
  margin: 0;
}

.close-x {
  background: #232838;
  border: none;
  color: #94a3b8;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-x:hover {
  background: #334155;
  color: #fff;
}

.modal-tip {
  font-size: 12px;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.5;
}

/* 核心：链接展示与快速点击复制 */
.link-display-section {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.url-badge-box {
  background: #0d0f17;
  border: 1.5px solid #2563eb;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 0 16px rgba(37, 99, 235, 0.25);
  text-align: center;
  transition: all 0.2s;
}

.url-badge-box:hover {
  border-color: #38bdf8;
  background: #111522;
}

.url-text {
  font-size: 16px;
  font-weight: 800;
  color: #38bdf8;
  letter-spacing: 0.5px;
  user-select: all;
  word-break: break-all;
}

.copy-action-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #0f172a;
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.copy-action-btn.copied {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.copy-action-btn:active {
  transform: scale(0.97);
}

/* 智能 IP 检测与手动修改 */
.ip-helper-box {
  background: #12141e;
  border: 1px solid #232736;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ip-status-warn {
  display: flex;
  gap: 8px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 8px 10px;
  border-radius: 8px;
}

.warn-icon {
  font-size: 16px;
}

.warn-content strong {
  display: block;
  font-size: 12px;
  color: #f87171;
  margin-bottom: 2px;
}

.warn-content p {
  font-size: 11px;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.4;
}

.manual-ip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.manual-ip-row .label {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  white-space: nowrap;
}

.input-wrap {
  display: flex;
  align-items: center;
  background: #1e2230;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 2px 8px;
  flex: 1;
  min-width: 180px;
}

.input-wrap .prefix,
.input-wrap .suffix {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

.ip-input {
  background: transparent;
  border: none;
  color: #f1f5f9;
  font-size: 12px;
  font-weight: 700;
  outline: none;
  width: 100%;
  padding: 3px 4px;
}

.clear-ip-btn {
  background: #334155;
  border: none;
  color: #cbd5e1;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
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
  text-align: left;
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

.modal-footer-actions {
  display: flex;
  justify-content: flex-end;
}

.modal-btn-confirm {
  background: #1e293b;
  border: 1px solid #475569;
  color: #f1f5f9;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn-confirm:hover {
  background: #334155;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #232734;
}

.c-info .c-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
}

.c-info .c-desc {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.num-selector {
  display: flex;
  gap: 6px;
}

.num-choice-btn {
  background: #252836;
  border: 1px solid #3b4256;
  color: #94a3b8;
  padding: 5px 10px;
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

.rule-toggle-btn {
  background: #252836;
  border: 1px solid #3b4256;
  color: #fbbf24;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.switch-toggle {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 22px;
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
  border-radius: 22px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
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
  margin-top: 12px;
  font-size: 11px;
  color: #f87171;
  text-align: center;
}

/* 响应式微调 (横屏手机及小屏幕适配) */
@media (max-height: 560px), (max-width: 900px) {
  .game-header {
    height: 40px;
    min-height: 40px;
    padding: 0 12px;
  }

  .brand-zone .logo {
    font-size: 18px;
  }

  .brand-zone h2 {
    font-size: 15px;
  }

  .lan-pill {
    padding: 3px 8px;
    font-size: 11px;
  }

  .icon-tool-btn,
  .cancel-room-btn,
  .leave-room-btn {
    padding: 3px 8px;
    font-size: 11px;
  }

  .table-container {
    padding: 0 10px;
    overflow: visible;
  }

  .poker-table {
    border-radius: 9999px;
    border: 6px solid #2b1810;
    width: min(68vw, 440px);
    height: min(48vh, 146px);
    aspect-ratio: auto;
    max-width: 72%;
    margin: auto;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .community-zone {
    transform: none;
    z-index: 35;
  }

  .cards-felt {
    gap: 3px;
    padding: 3px 6px;
    border-radius: 6px;
  }

  .seat-card {
    width: 90px;
    padding: 2px 4px;
    border-radius: 8px;
    border-width: 1.5px;
  }

  .seat-slot-bottom {
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    z-index: 15;
  }

  .seat-slot-top {
    top: 14px;
    left: 50%;
    transform: translateX(-50%) translateY(-100%);
    z-index: 14;
  }

  .seat-slot-left {
    left: -14px;
    top: 50%;
    transform: translateX(-100%) translateY(-50%);
    z-index: 14;
  }

  .seat-slot-right {
    right: -14px;
    top: 50%;
    transform: translateX(100%) translateY(-50%);
    z-index: 14;
  }

  .avatar-box {
    width: 20px;
    height: 20px;
    font-size: 12px;
  }

  .seat-user .uname {
    font-size: 10px;
    line-height: 1.1;
  }

  .seat-user .status-tag {
    font-size: 8.5px;
  }

  .player-cards {
    margin-top: 2px;
    gap: 3px;
  }

  .player-cards .real-poker-card {
    width: 30px !important;
    height: 42px !important;
    padding: 1.5px !important;
    border-radius: 4px !important;
  }

  .player-cards .corner-val {
    font-size: 9px !important;
    font-weight: 800 !important;
  }

  .player-cards .corner-suit {
    font-size: 7.5px !important;
  }

  .player-cards .center-watermark {
    font-size: 13px !important;
  }

  .cylinder-gun-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
    padding: 1px 4px;
    border-radius: 5px;
    gap: 2px;
  }

  .cyl-info {
    display: flex;
    align-items: center;
    margin-bottom: 0;
    font-size: 8.5px;
    gap: 2px;
  }

  .gun-lbl {
    display: none;
  }

  .gun-val {
    font-size: 8.5px;
    white-space: nowrap;
  }

  .cylinder-slots {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  .chamber-hole {
    width: 6.5px;
    height: 6.5px;
    border-width: 1px;
  }

  .brass-bullet-dot {
    width: 3px;
    height: 3px;
  }

  .game-footer {
    min-height: 44px;
    padding: 3px 10px;
    justify-content: space-between;
  }

  .log-ticker {
    max-width: 38%;
    font-size: 11px;
  }

  .c-btn {
    padding: 5px 10px;
    font-size: 11px;
  }
}
</style>
