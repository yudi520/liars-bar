<template>
  <div class="dice-arena-container">
    <!-- 左上角常驻轻量胶囊区 (纯净菜单与终局重开战报入口) -->
    <div v-if="!headerExpanded" class="top-collapsed-bar">
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

    <!-- 点击外部收起菜单的透明遮罩 -->
    <div
      v-if="headerExpanded"
      class="header-click-outside-backdrop"
      @click="headerExpanded = false"
    ></div>

    <!-- 顶部状态栏 (支持展开与收起) -->
    <header v-show="headerExpanded" class="top-nav" @click.stop>
      <div class="nav-left">
        <span class="room-title">🎲 骗子酒馆 · 骗子骰子</span>
        <span class="room-capacity">👥 {{ state.players.length }} / {{ state.config.maxPlayers || 4 }} 人</span>
        <span class="mode-tag" :class="state.config.punishType === 'POISON' ? 'poison' : 'gun'">
          {{ state.config.punishType === 'POISON' ? '🧪 毒药模式' : '🔫 轮盘模式' }}
        </span>
        <span class="extra-tag dice-count-tag">🎲 {{ state.config.dicePerPlayer || 5 }}颗/人</span>
        <span v-if="state.config.enableLockOne" class="extra-tag lock1">🔒 叫1锁1</span>
        <span v-if="state.config.enableSpotOn" class="extra-tag spot">🎯 精确命中</span>
      </div>

      <div class="nav-right">
        <!-- 终局战报入口 -->
        <button
          v-if="state.status === 'GAME_OVER'"
          class="nav-btn victory-header-btn"
          title="查看终局战报与胜负排名"
          @click="$emit('open-victory')"
        >
          🏆 战报
        </button>
        <button class="nav-btn invite-btn" @click="showLinkModal = true">🔗 邀请好友</button>
        <!-- 上方栏目的记录不用显示，因为左下角已经有记录了 -->
        <button class="nav-btn rules-btn" @click="showRulesModal = true">📖 规则</button>
        <button v-if="isHost" class="nav-btn cancel-btn" @click="$emit('cancel-room')">🚪 解散房间</button>
        <button v-else class="nav-btn leave-btn" @click="$emit('leave-room')">🚪 离开房间</button>
        <button class="nav-btn collapse-btn" title="收起顶部栏" @click="headerExpanded = false">▲ 收起</button>
      </div>
    </header>

    <!-- 核心圆桌竞技场 -->
    <div class="dice-table">
      <!-- 桌周各玩家席位 (环形分布) -->
      <div
        v-for="(player, idx) in seatPlayers"
        :key="player.id"
        class="seat-wrapper"
        :class="[
          `seat-pos-${player.seatSlot !== undefined ? player.seatSlot : idx}`,
          { 'is-turn': player.isTurn && state.status === 'BIDDING' },
          { 'is-dead': !player.isAlive },
          { 'is-self': player.id === myId }
        ]"
      >
        <!-- 席位卡片 -->
        <div class="player-card">
          <!-- 席位头部：头像、昵称、离线/人机标识 -->
          <div class="avatar-ring">
            <span class="avatar-emoji">{{ player.avatar }}</span>
            <span v-if="player.isHost && player.avatar !== '👑'" class="badge-tag host-tag">👑</span>
            <span v-else-if="player.isBot" class="badge-tag bot-tag">🤖</span>
            <span v-if="player.isOffline" class="badge-tag offline-tag">📶 离线</span>
            <!-- 思考倒计时波纹 -->
            <div v-if="player.isTurn && state.status === 'BIDDING'" class="turn-pulse"></div>
          </div>

          <div class="player-info">
            <div class="name-line">
              <span class="p-name">{{ player.name }}</span>
              <span v-if="player.id === myId" class="self-tag">(我)</span>
            </div>

            <!-- 生命状态显示 (毒药瓶 或 轮盘子弹) -->
            <div class="life-status">
              <template v-if="state.config.punishType === 'POISON'">
                <div class="poison-bottles" title="每喝2瓶毒药暴毙">
                  <span class="bottle-item" :class="{ drunk: player.poisonDrunk >= 1 }">🧪</span>
                  <span class="bottle-item" :class="{ drunk: player.poisonDrunk >= 2 }">🧪</span>
                  <span class="life-text" :class="{ danger: player.poisonDrunk === 1, dead: !player.isAlive }">
                    {{ player.isAlive ? (player.poisonDrunk === 0 ? '全满' : '剩1瓶') : '暴毙' }}
                  </span>
                </div>
              </template>
              <template v-else>
                <div class="revolver-status">
                  <span class="gun-icon">🔫</span>
                  <span class="gun-chance">{{ player.surviveChance || `${Math.max(0, 5 - (player.bulletsFired || 0))}/${Math.max(1, 6 - (player.bulletsFired || 0))}` }}存活</span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- 席位翻开的骰子 (验骰阶段其他玩家展示；若超过5颗同样分上下两排半尺寸展示) -->
        <div v-if="player.id !== myId && shouldShowPlayerDice(player)" class="seat-cup-area">
          <div class="dice-revealed-tray" :class="{ 'is-double-row': player.dice && player.dice.length > 5 }">
            <template v-if="player.dice && player.dice.length > 5">
              <div class="seat-dice-row upper-row">
                <RealDice
                  v-for="(val, dIdx) in player.dice.slice(0, 5)"
                  :key="'seat-up-' + dIdx"
                  :value="val"
                  size="tiny"
                  :highlight="isDiceHighlighted(val)"
                  :wild="isDiceWild(val)"
                  :dimmed="isDiceDimmed(val)"
                />
              </div>
              <div class="seat-dice-row lower-row">
                <RealDice
                  v-for="(val, dIdx) in player.dice.slice(5)"
                  :key="'seat-low-' + dIdx"
                  :value="val"
                  size="tiny"
                  :highlight="isDiceHighlighted(val)"
                  :wild="isDiceWild(val)"
                  :dimmed="isDiceDimmed(val)"
                />
              </div>
            </template>
            <template v-else>
              <RealDice
                v-for="(val, dIdx) in player.dice"
                :key="dIdx"
                :value="val"
                size="mini"
                :highlight="isDiceHighlighted(val)"
                :wild="isDiceWild(val)"
                :dimmed="isDiceDimmed(val)"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- 中央桌心控制台 / 状态板 -->
      <div class="table-center-board">
        <!-- 1. 大厅备战状态 (LOBBY) -->
        <div v-if="state.status === 'LOBBY'" class="center-lobby">
          <div class="lobby-badge">🎲 骰子酒馆大厅 · 准备中</div>
          <div class="lobby-info">
            <span>当前存活准备：{{ (state.players || []).length }} / {{ (state.config && state.config.maxPlayers) || 4 }} 人</span>
          </div>
        </div>

        <!-- 2. 摇盅暗骰中 (ROLLING) -->
        <div v-else-if="state.status === 'ROLLING'" class="center-rolling">
          <div class="shake-anim-icon">🎲 🪘 🎲</div>
          <div class="rolling-text">全员疯狂摇盅中... 骰子已落定！</div>
        </div>

        <!-- 3. 叫点与博弈中 (BIDDING) -->
        <div v-else-if="state.status === 'BIDDING'" class="center-bidding">
          <div class="bid-hero-box">
            <div class="bid-header-line">
              <span class="bid-label">全场当前最高叫点</span>
            </div>

            <div v-if="state.currentBid" class="bid-showcase">
              <span class="bid-caller">【{{ state.currentBid.playerName }}】</span>
              <span class="bid-verb">喊出：</span>
              <div class="bid-tight-badge">
                <span class="tight-qty">{{ state.currentBid.quantity }}</span>
                <span class="tight-unit">个</span>
                <RealDice :value="state.currentBid.faceValue" size="small" class="tight-die" />
                <span class="tight-face">{{ state.currentBid.faceValue }}点</span>
              </div>
            </div>
            <div v-else class="bid-empty">
              等待首发玩家【{{ currentTurnPlayerName }}】发起起叫...
            </div>

            <div class="turn-status-sub">
              <span class="active-arrow">👉</span>
              <span>轮到【<strong>{{ currentTurnPlayerName }}</strong>】报数 / 质疑</span>
              <span
                v-if="!state.config?.disableTurnTimer"
                class="countdown-tag"
                :class="{ urgent: currentTurnSeconds <= 5 }"
              >⏱️ {{ currentTurnSeconds }}s</span>
            </div>
          </div>
        </div>

        <!-- 4. 掀盅验骰展示 (REVEAL / PUNISHMENT) 紧凑精简排版，彻底杜绝重叠拥挤 -->
        <div v-else-if="state.status === 'REVEAL' || state.status === 'PUNISHMENT' || state.status === 'ROUND_SUMMARY'" class="center-reveal">
          <div class="reveal-banner" :class="state.revealEvent?.isBidderSuccessful ? 'bidder-win' : 'bidder-lose'">
            <div class="reveal-title">
              🔍 开盅验点 · 目标【{{ state.revealEvent?.bid?.quantity }}个{{ state.revealEvent?.targetFace }}点】
            </div>
            <div class="reveal-count-line">
              <span class="count-prefix">全场实有</span>
              <strong class="count-big">{{ state.revealEvent?.totalMatching }}</strong>
              <span class="count-unit">个</span>
              <RealDice :value="state.revealEvent?.targetFace" size="mini" class="reveal-target-die" />
              <span class="reveal-face-text">{{ state.revealEvent?.targetFace }}点</span>
              <span v-if="state.revealEvent?.wildActive && state.revealEvent?.targetFace !== 1" class="wild-sub-text">
                (含{{ state.revealEvent?.wildCount }}赖子)
              </span>
            </div>
            <div class="reveal-result-badge">
              <span v-if="state.revealEvent?.action === 'SPOT_ON'">
                {{ state.revealEvent?.isExactMatch ? '🎯 精确命中成功！全员受罚！' : '💥 精确命中失败！发起者受罚！' }}
              </span>
              <span v-else>
                {{ state.revealEvent?.isBidderSuccessful ? '🛡️ 报数成立！质疑者受罚！' : '🚨 吹牛被抓包！叫点者受罚！' }}
              </span>
            </div>
            <div v-if="state.punishEvent" class="punish-log-text">
              {{ state.punishEvent.message }}
            </div>
          </div>
        </div>

        <!-- 5. 终局胜出 (GAME_OVER) -->
        <div v-else-if="state.status === 'GAME_OVER'" class="center-gameover">
          <div class="trophy-icon">🏆</div>
          <div class="over-title">对决终结 · 骰王诞生！</div>
          <div class="winner-name">获胜者：【{{ winnerPlayer?.name || '无人生还' }}】</div>
          <div class="gameover-acts">
            <button class="c-btn poster-btn-lg" @click="openShareModal">
              📸 分享战局图
            </button>
            <button v-if="isHost" class="c-btn restart-btn" @click="$emit('start-game')">
              🔥 再来一局
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- 底部控制栏与对决决策操作台 (仿照德州扑克紧凑单栏架构) -->
    <footer class="dice-footer">
      <!-- 1. 左侧区：战报流水 (记录) + 自己的骰子 (紧随记录靠右) -->
      <div class="footer-left-zone">
        <div
          class="log-ticker"
          title="点击展开酒馆战报与喊点记录"
          @click="showDrawer = true"
        >
          <span class="ticker-icon">📜</span>
          <span class="ticker-text">{{ latestLog || '骗子骰子生死局 · 准备就绪' }}</span>
          <span class="ticker-more">记录 ❯</span>
        </div>

        <!-- 自己的手骰展示 (超过5颗时尺寸变小一半并分上下两排：上半5颗，下半多出的部分) -->
        <div v-if="state.status !== 'LOBBY' && myPlayer && myPlayer.isAlive" class="my-dice-strip" :class="{ 'has-many-dice': isManyDice }">
          <!-- 超过5颗骰子：上下两排分置展示 -->
          <div v-if="isManyDice" class="my-dice-two-rows">
            <div class="my-dice-row upper-row">
              <RealDice
                v-for="(val, idx) in myUpperDice"
                :key="'up-' + idx"
                :value="val"
                size="tiny"
                :wild="val === 1 && state.isWildActive"
              />
            </div>
            <div class="my-dice-row lower-row">
              <RealDice
                v-for="(val, idx) in myLowerDice"
                :key="'low-' + idx"
                :value="val"
                size="tiny"
                :wild="val === 1 && state.isWildActive"
              />
            </div>
          </div>
          <!-- 5颗或以下骰子：原规格单行居中展示 -->
          <div v-else class="my-dice-row single-row">
            <RealDice
              v-for="(val, idx) in (myPlayer.dice || [])"
              :key="idx"
              :value="val"
              size="small"
              :wild="val === 1 && state.isWildActive"
            />
          </div>

          <div v-if="myDiceSummaryList.length > 0" class="dice-mini-summary" :class="{ 'compact-summary': isManyDice }">
            <span
              v-for="item in myDiceSummaryList"
              :key="item.face"
              class="sum-mini-badge"
              :class="{ 'is-wild': item.isWild, 'face-1': item.face === 1 }"
            >
              {{ item.face }}点×{{ item.count }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2. 中间区：操作骰子群 (步进器 + 6颗选点骰 + 叫点/质疑动作按钮，100% 绝对居中) -->
      <div v-if="state.status !== 'LOBBY' && myPlayer && myPlayer.isAlive" class="footer-center-controls">
        <!-- 轮到自己叫点 -->
        <template v-if="canAct && state.status === 'BIDDING'">
          <div class="act-controls-row" :class="{ 'max-bid-reached': isBidMaxReached }">
            <template v-if="isBidMaxReached">
              <div class="bid-cap-tip">
                ⚠️ 已达极限量！
              </div>
              <button class="c-act-btn challenge-btn-primary" @click="handleSendChallenge">
                🚨 质疑开盅
              </button>
              <button v-if="state.config.enableSpotOn" class="c-act-btn spoton-btn" @click="handleSendSpotOn">
                🎯 精确
              </button>
            </template>
            <template v-else>
              <!-- 数量步进器 -->
              <div class="stepper-compact">
                <button class="step-btn" :disabled="selectedQty <= minAllowedQty" @click="selectedQty--">-</button>
                <span class="step-val">{{ selectedQty }}个</span>
                <button class="step-btn" :disabled="selectedQty >= maxAllowedQty" @click="selectedQty++">+</button>
              </div>

              <!-- 点数 1~6 选择器 -->
              <div class="face-picker-compact">
                <button
                  v-for="f in [1, 2, 3, 4, 5, 6]"
                  :key="f"
                  class="face-btn-mini"
                  :class="{ selected: selectedFace === f, disabled: !isFaceValid(f) }"
                  :disabled="!isFaceValid(f)"
                  @click="selectedFace = f"
                >
                  <RealDice :value="f" size="mini" />
                </button>
              </div>

              <!-- 叫点与开盅按钮 -->
              <div class="bid-action-btns">
                <button class="c-act-btn bid-confirm-btn" :disabled="!isCurrentSelectionValid" @click="handleSendBid">
                  🗣️ 叫点 ({{ selectedQty }}个{{ selectedFace }}点)
                </button>
                <button v-if="state.currentBid" class="c-act-btn challenge-btn" @click="handleSendChallenge">
                  🚨 质疑开盅
                </button>
                <button v-if="state.config.enableSpotOn && state.currentBid" class="c-act-btn spoton-btn" @click="handleSendSpotOn">
                  🎯 精确
                </button>
              </div>
            </template>
          </div>
        </template>

        <!-- 非自己行动回合 -->
        <div v-else class="not-turn-dock">
          <span v-if="state.status === 'ROLLING'">🎲 摇盅中...</span>
          <span v-else-if="state.status === 'REVEAL' || state.status === 'PUNISHMENT'">🔍 正在清点受罚...</span>
          <span v-else-if="state.status === 'ROUND_SUMMARY'">🏁 本轮清算中...</span>
          <span v-else-if="state.status === 'GAME_OVER'">🏆 对局已结算</span>
          <span v-else>⏳ 等待【{{ currentTurnPlayerName }}】叫点...</span>
        </div>
      </div>

      <!-- 3. 右侧区：大厅阶段房主开局操作 或 终局重开 或 观战退出 -->
      <div class="dice-actions-area">
        <!-- 0. 终局战报与重开操作 (GAME_OVER，弹窗叉掉后仍可随时重新开局) -->
        <div v-if="state.status === 'GAME_OVER'" class="footer-gameover-actions">
          <button class="c-btn victory-btn" @click="$emit('open-victory')">
            🏆 查看终局战报
          </button>
          <template v-if="isHost">
            <button class="c-btn start-game-btn" @click="$emit('start-game')">
              🔥 开启新一轮
            </button>
            <button class="c-btn reset-btn" @click="$emit('reset-lobby')">
              🔄 返回备战大厅
            </button>
          </template>
          <div v-else class="lobby-guest-tip">
            🏆 对决已决出最后幸存者！等待房主重新开局...
          </div>
        </div>

        <!-- 1. 开局大厅阶段 (LOBBY) -->
        <div v-else-if="state.status === 'LOBBY'" class="footer-lobby-actions">
          <template v-if="isHost">
            <button
              class="c-btn add-bot-btn"
              :disabled="state.players.length >= (state.config.maxPlayers || 4)"
              @click="$emit('add-bot')"
            >
              🤖 添加人机
            </button>
            <button
              class="c-btn start-game-btn"
              :disabled="state.players.length < 2"
              @click="$emit('start-game')"
            >
              🚀 开始对局 ({{ state.players.length }}/{{ state.config.maxPlayers || 4 }}人)
            </button>
          </template>
          <div v-else class="lobby-guest-tip">
            ⏳ 等待房主开启对局... ({{ state.players.length }}/{{ state.config.maxPlayers || 4 }}人已就绪)
          </div>
        </div>

        <!-- 2. 淘汰玩家观战 -->
        <div v-else-if="!myPlayer || !myPlayer.isAlive" class="footer-spectator-dock">
          <span class="spec-tag">👁️ 阵亡观战</span>
          <span class="spec-desc">当前叫点: <strong>{{ state.currentBid ? `${state.currentBid.quantity}个${state.currentBid.faceValue}点` : '尚未起叫' }}</strong> · 全场暗骰: <strong>{{ state.totalDiceRemaining || 0 }}颗</strong> (每人{{ state.config?.dicePerPlayer || 5 }}颗)</span>
          <button class="c-btn s-leave-btn" @click="$emit('leave-room')">🚪 离开</button>
        </div>
      </div>
    </footer>

    <!-- 酒馆战报与喊点历史抽屉 -->
    <div v-if="showDrawer" class="drawer-backdrop" @click.self="showDrawer = false">
      <div class="drawer-panel">
        <div class="drawer-header">
          <div class="drawer-title-wrap">
            <span class="d-icon">📜</span>
            <span class="d-title">酒馆战报与喊点记录</span>
          </div>
          <button class="drawer-close-btn" title="关闭记录" @click="showDrawer = false">✕</button>
        </div>

        <div class="drawer-content">
          <!-- 本手喊点轨迹 -->
          <div class="drawer-section">
            <div class="section-title">
              <span>🎲 本手喊点轨迹</span>
              <span class="section-count">共 {{ (state.roundBids || []).length }} 次报数</span>
            </div>
            <div v-if="!state.roundBids || state.roundBids.length === 0" class="empty-sub-tip">
              本手暂无玩家喊点
            </div>
            <div v-else class="bids-timeline">
              <div
                v-for="(b, bIdx) in state.roundBids"
                :key="bIdx"
                class="bid-step-item"
              >
                <span class="step-num">#{{ bIdx + 1 }}</span>
                <span class="step-avatar">{{ b.avatar || '🤠' }}</span>
                <span class="step-player">{{ b.playerName }}</span>
                <span class="step-arrow">➔</span>
                <div class="step-bid-pill">
                  <span class="s-qty">{{ b.quantity }}个</span>
                  <RealDice :value="b.faceValue" size="mini" />
                  <span class="s-face">{{ b.faceValue }}点</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 历史事件流水日志 -->
          <div class="drawer-section">
            <div class="section-title">
              <span>📋 详细事件流水</span>
            </div>
            <div v-if="!state.logs || state.logs.length === 0" class="empty-sub-tip">
              暂无事件日志
            </div>
            <div v-else class="logs-list">
              <div
                v-for="(log, lIdx) in state.logs"
                :key="lIdx"
                class="log-row"
                :class="{
                  'log-challenge': log.includes('质疑') || log.includes('开盅'),
                  'log-punish': log.includes('毒药') || log.includes('中枪') || log.includes('受罚') || log.includes('暴毙'),
                  'log-bid': log.includes('叫点')
                }"
              >
                {{ log }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 局域网联机加入与分享弹窗 -->
    <div v-if="showLinkModal" class="modal-mask" @click.self="showLinkModal = false">
      <div class="modal-card link-modal-card">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="m-icon">🔗</span>
            <span class="m-title">邀请好友加入骗子骰子</span>
          </div>
          <button class="close-x" @click="showLinkModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="share-badge-card">
            <div class="room-summary-chip">
              <span>🎲 骗子骰子 · 吹牛模式</span>
              <span>👥 {{ state.players.length }}/{{ state.config.maxPlayers || 4 }}人</span>
              <span>{{ state.config.punishType === 'POISON' ? '🧪 毒药模式' : '🔫 轮盘模式' }}</span>
            </div>
            <p class="share-tip">好友在同一 WiFi / 手机热点 / 局域网下，在浏览器中打开下方链接即可直接进入房间并肩对决：</p>
            <div class="link-input-group">
              <input type="text" :value="fullJoinUrl" readonly class="link-input" />
              <button class="copy-btn" @click="copyJoinUrl">
                {{ copySuccess ? '✅ 已复制' : '📋 复制链接' }}
              </button>
            </div>
            <div class="app-join-tip">
              💡 <strong>免安装即玩</strong>：用手机自带浏览器直接打开上方链接<br>
              📲 <strong>独立 App 联机</strong>：打开上方网页后可点击顶部下载 App，在 App 填入房主 IP <code>{{ displayShortUrl }}</code> 即可跨机联机！
            </div>
            <div v-if="copySuccess" class="copy-toast-tip">
              ✨ 链接已复制到剪贴板，快发给好友加入吧！
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 牌局决胜 · 一图全览海报分享弹窗 (如图一) -->
    <div v-if="showPosterModal" class="share-modal-mask" @click.self="showPosterModal = false">
      <div class="share-modal-dialog">
        <div class="sm-header">
          <div class="sm-title">📸 牌局决胜 · 一图全览</div>
          <button class="sm-close" @click="showPosterModal = false">✕</button>
        </div>

        <div class="sm-body">
          <div v-if="posterImgUrl" class="poster-img-wrap">
            <img :src="posterImgUrl" alt="牌局海报" class="poster-img" />
          </div>
          <div v-else class="poster-loading">
            ⏳ 正在绘制高清战绩海报...
          </div>
        </div>

        <div class="sm-footer">
          <button class="sm-btn sm-save-img" @click="savePosterImage">
            💾 保存图片
          </button>
          <button class="sm-btn sm-cancel" @click="showPosterModal = false">
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- 规则弹窗 -->
    <LiarsDiceGuide :visible="showRulesModal" @close="showRulesModal = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import RealDice from './RealDice.vue';
import LiarsDiceGuide from './LiarsDiceGuide.vue';
import { sounds } from '../utils/audio';

const props = defineProps({
  isHost: { type: Boolean, default: false },
  state: { type: Object, required: true },
  serverInfo: { type: Object, default: null },
  myId: { type: String, default: '' }
});

const emit = defineEmits([
  'start-game',
  'start-next-hand',
  'add-bot',
  'remove-player',
  'cancel-room',
  'leave-room',
  'action'
]);

// 弹窗与抽屉控制
const headerExpanded = ref(false);
const showRulesModal = ref(false);
const showLinkModal = ref(false);
const showDrawer = ref(false);
const showPosterModal = ref(false);
const posterImgUrl = ref('');
const copySuccess = ref(false);

// 简短联机 IP:Port 标签
const displayShortUrl = computed(() => {
  const ip = props.serverInfo?.lanIp || (typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1');
  const port = props.serverInfo?.port || (typeof window !== 'undefined' ? window.location.port : 9527);
  return `${ip}:${port}`;
});

// 倒计时响应式系统
const nowTime = ref(Date.now());
let timerInterval = null;

onMounted(() => {
  timerInterval = setInterval(() => {
    nowTime.value = Date.now();
  }, 200);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// 计算当前行动者剩余倒计时秒数
const currentTurnSeconds = computed(() => {
  if (props.state.config?.disableTurnTimer) return null;
  if (props.state.status !== 'BIDDING' || !props.state.turnDeadline) {
    return props.state.turnRemainingSeconds || 20;
  }
  return Math.max(0, Math.ceil((props.state.turnDeadline - nowTime.value) / 1000));
});

// 叫点操作选择状态
const selectedQty = ref(2);
const selectedFace = ref(2);

const DICE_EMOJIS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function getDiceEmoji(val) {
  if (val >= 1 && val <= 6) return DICE_EMOJIS[val - 1];
  return '🎲';
}

const myPlayer = computed(() => {
  return props.state.players.find(p => p.id === props.myId) || null;
});

// 手骰数量超过5颗时的分排与半尺寸自适应
const isManyDice = computed(() => {
  return (myPlayer.value?.dice?.length || 0) > 5;
});

const myUpperDice = computed(() => {
  if (!myPlayer.value || !Array.isArray(myPlayer.value.dice)) return [];
  return myPlayer.value.dice.slice(0, 5);
});

const myLowerDice = computed(() => {
  if (!myPlayer.value || !Array.isArray(myPlayer.value.dice)) return [];
  return myPlayer.value.dice.slice(5);
});

const canAct = computed(() => {
  return props.state.status === 'BIDDING' && props.state.currentTurnPlayerId === props.myId;
});

const currentTurnPlayer = computed(() => {
  return props.state.players.find(p => p.id === props.state.currentTurnPlayerId);
});

const currentTurnPlayerName = computed(() => {
  return currentTurnPlayer.value ? currentTurnPlayer.value.name : '未知玩家';
});

const winnerPlayer = computed(() => {
  return props.state.players.find(p => p.isWinner || p.isAlive);
});

// 计算所有座位并按本人置底智能排布 (2人正对12点/6点，3人下/右/左，4人下/右/上/左)
const seatPlayers = computed(() => {
  const list = props.state?.players ? [...props.state.players] : [];
  if (list.length === 0) return [];
  const myIdx = list.findIndex(p => p.id === props.myId);
  const baseIdx = myIdx >= 0 ? myIdx : 0;
  const n = list.length;

  return list.map((p, i) => {
    const rel = (i - baseIdx + n) % n;
    let seatSlot = 0;
    if (n === 2) {
      seatSlot = (rel === 0) ? 0 : 2; // 0=bottom, 2=top
    } else if (n === 3) {
      seatSlot = (rel === 0) ? 0 : (rel === 1 ? 3 : 1); // 0=bottom, 3=right, 1=left
    } else {
      seatSlot = (rel === 0) ? 0 : (rel === 1 ? 3 : (rel === 2 ? 2 : 1)); // 0=bottom, 3=right, 2=top, 1=left
    }
    return {
      ...p,
      seatSlot
    };
  });
});

// 自身手骰点数结构化小结 (高对比度清晰徽章渲染，杜绝系统字体Unicode方框缺字问题)
const myDiceSummaryList = computed(() => {
  if (!myPlayer.value || !Array.isArray(myPlayer.value.dice) || myPlayer.value.dice.length === 0) return [];
  const counts = {};
  for (const d of myPlayer.value.dice) {
    if (typeof d === 'number' && d >= 1 && d <= 6) {
      counts[d] = (counts[d] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([face, count]) => ({
      face: Number(face),
      count,
      isWild: Number(face) === 1 && props.state.isWildActive
    }));
});

// 纯文本备用统计
const myDiceSummaryText = computed(() => {
  return myDiceSummaryList.value.map(item => `【${item.face}点】×${item.count}`).join(' · ');
});

// 最新一条简短日志 (用于底部浮动战报条)
const latestLog = computed(() => {
  if (!props.state.logs || props.state.logs.length === 0) return '';
  return props.state.logs[0];
});

// 局域网分享加入链接
const fullJoinUrl = computed(() => {
  const ip = props.serverInfo?.lanIp || (typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1');
  const port = props.serverInfo?.port || (typeof window !== 'undefined' ? window.location.port : 9527);
  return `http://${ip}:${port}`;
});

function copyJoinUrl() {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(fullJoinUrl.value);
  } else {
    const input = document.createElement('input');
    input.value = fullJoinUrl.value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }
  copySuccess.value = true;
  setTimeout(() => {
    copySuccess.value = false;
  }, 2500);
}

// 全场暗骰极限量
const totalMaxDice = computed(() => {
  const aliveCount = props.state.players.filter(p => p.isAlive).length;
  const perPlayer = props.state.config?.dicePerPlayer || 5;
  return aliveCount * perPlayer;
});

// 当叫点已大于等于所有玩家骰子数量相加的上限，并且是6点时
const isBidMaxReached = computed(() => {
  if (!props.state.currentBid) return false;
  return props.state.currentBid.quantity >= totalMaxDice.value && props.state.currentBid.faceValue === 6;
});

// 监听叫点变动，自动同步推荐的下家起叫数值
watch(
  () => props.state.currentBid,
  (bid) => {
    if (bid) {
      const aliveCount = props.state.players.filter(p => p.isAlive).length;
      const perPlayer = props.state.config?.dicePerPlayer || 5;
      const totalMax = aliveCount * perPlayer;
      if (bid.quantity >= totalMax && bid.faceValue === 6) {
        // 核心规则要求：当叫点达到上限且是6时，不默认再添加一颗骰子
        selectedQty.value = bid.quantity;
        selectedFace.value = 6;
      } else if (bid.faceValue < 6) {
        selectedQty.value = bid.quantity;
        selectedFace.value = bid.faceValue + 1;
      } else {
        selectedQty.value = bid.quantity + 1;
        selectedFace.value = 2;
      }
    } else {
      const aliveCount = props.state.players.filter(p => p.isAlive).length;
      selectedQty.value = Math.max(1, aliveCount);
      selectedFace.value = 2;
    }
  },
  { immediate: true }
);

// 监听当前选择，实时同步给服务端 pendingSelection (以便倒计时结束自动出招)
watch([selectedQty, selectedFace], ([qty, face]) => {
  if (canAct.value && props.state.status === 'BIDDING') {
    emit('action', {
      action: 'UPDATE_SELECTION',
      quantity: qty,
      faceValue: face
    });
  }
});

// 倒计时归零时：若轮到自己，按照已选的出 (若开启不限时思考则不触发自动代打)
watch(currentTurnSeconds, (newVal) => {
  if (props.state.config?.disableTurnTimer) return;
  if (newVal === 0 && canAct.value && props.state.status === 'BIDDING') {
    if (isCurrentSelectionValid.value) {
      handleSendBid();
    } else if (props.state.currentBid) {
      handleSendChallenge();
    }
  }
});

// 监听状态变动播放拟真音效
watch(
  () => props.state.status,
  (newStatus, oldStatus) => {
    if (newStatus === 'ROLLING') {
      sounds.play('diceShake');
      setTimeout(() => sounds.play('diceRoll'), 600);
    } else if (newStatus === 'REVEAL') {
      sounds.play('cupSlam');
    } else if (newStatus === 'PUNISHMENT') {
      if (props.state.config?.punishType === 'POISON') {
        sounds.play('poison');
      } else {
        sounds.play('gunshot');
      }
    }
  }
);

// 数量与点数范围
const minAllowedQty = computed(() => {
  if (!props.state.currentBid) return 1;
  return props.state.currentBid.quantity;
});

const maxAllowedQty = computed(() => {
  return Math.max(12, totalMaxDice.value);
});

function isFaceValid(face) {
  if (!props.state.currentBid) return true;
  if (selectedQty.value > props.state.currentBid.quantity) return true;
  if (selectedQty.value === props.state.currentBid.quantity) {
    return face > props.state.currentBid.faceValue;
  }
  return false;
}

const isCurrentSelectionValid = computed(() => {
  if (!props.state.currentBid) return selectedQty.value >= 1;
  if (selectedQty.value > props.state.currentBid.quantity) return true;
  if (selectedQty.value === props.state.currentBid.quantity) {
    return selectedFace.value > props.state.currentBid.faceValue;
  }
  return false;
});

// 是否展示某名玩家的底骰
function shouldShowPlayerDice(player) {
  if (player.id === props.myId) return true;
  // 阵亡观战透视 (仅当未开启「观战无透视」时允许透视他人暗骰)，或进入清点揭晓终局阶段
  if (myPlayer.value && !myPlayer.value.isAlive && !props.state.config?.disableSpectatorXray) return true;
  const isPostBidding = props.state.status === 'REVEAL' || props.state.status === 'PUNISHMENT' || props.state.status === 'ROUND_SUMMARY' || props.state.status === 'GAME_OVER';
  return isPostBidding;
}

// 揭晓阶段高亮
function isDiceHighlighted(val) {
  if (!props.state.revealEvent) return false;
  const target = props.state.revealEvent.targetFace;
  return val === target;
}

function isDiceWild(val) {
  if (!props.state.revealEvent) return false;
  return val === 1 && props.state.revealEvent.wildActive && props.state.revealEvent.targetFace !== 1;
}

function isDiceDimmed(val) {
  if (!props.state.revealEvent) return false;
  const target = props.state.revealEvent.targetFace;
  const isWild = val === 1 && props.state.revealEvent.wildActive && target !== 1;
  return val !== target && !isWild;
}

function handleSendBid() {
  if (!isCurrentSelectionValid.value) return;
  sounds.play('click');
  emit('action', {
    action: 'BID',
    quantity: selectedQty.value,
    faceValue: selectedFace.value
  });
}

function handleSendChallenge() {
  sounds.play('slam');
  emit('action', {
    action: 'CHALLENGE_DICE'
  });
}

function handleSendSpotOn() {
  sounds.play('click');
  emit('action', {
    action: 'SPOT_ON'
  });
}

const isPostBiddingStatus = computed(() => {
  return ['REVEAL', 'PUNISHMENT', 'ROUND_SUMMARY', 'GAME_OVER'].includes(props.state.status);
});

function openShareModal() {
  showPosterModal.value = true;
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

function generatePosterImage() {
  try {
    const canvas = document.createElement('canvas');
    const dpr = 2;
    const width = 640;
    const pCount = Math.max(props.state.players?.length || 2, 2);
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

    // 金黄外边框
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
    const punishDesc = props.state.config?.punishType === 'POISON' ? '2瓶毒药生死决胜' : '6孔左轮生死决胜';
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
    const win = winnerPlayer.value || props.state.players[0] || null;
    const winName = win?.name || '骰王';
    const winAv = win?.avatar || '🤠';
    ctx.fillText(`👑 ${winAv} ${winName} · 唯一幸存者 / 最终胜者`, 38, 99);

    if (props.state.config?.punishType === 'POISON') {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`[存活毒药: 喝了${win?.poisonDrunk || 0}/2瓶]`, width - 38, 99);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`[轮盘存活: 扣动${win?.bulletsFired || 0}枪生还]`, width - 38, 99);
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
    (props.state.players || []).forEach((p) => {
      const isW = p.id === win?.id || p.isWinner;
      ctx.fillStyle = isW ? 'rgba(234, 179, 8, 0.12)' : '#171c28';
      roundRect(ctx, 24, curY, width - 48, 46, 6, true, false);
      ctx.strokeStyle = isW ? '#eab308' : '#2b3347';
      ctx.lineWidth = 1;
      roundRect(ctx, 24, curY, width - 48, 46, 6, false, true);

      // 头像与昵称
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
        const failText = props.state.config?.punishType === 'POISON' ? '💀 暴毙' : '💀 阵亡';
        ctx.fillText(failText, 160, curY + 28);
      }

      // 手骰 (支持 3 ~ 10 颗自适应间距)
      const defDiceCnt = props.state.config?.dicePerPlayer || 5;
      const pDice = (p.dice && p.dice.length > 0) ? p.dice : Array(defDiceCnt).fill('?');
      const dieSize = pDice.length > 6 ? 24 : 28;
      const dieGap = pDice.length > 6 ? 4 : 6;
      const startX = 225;
      pDice.forEach((d, dIdx) => {
        const val = typeof d === 'number' ? d : (d?.val || d?.value || '?');
        drawDieOnCanvas(ctx, val, startX + dIdx * (dieSize + dieGap), curY + 9, dieSize);
      });

      // 右侧生存状态文本
      ctx.textAlign = 'right';
      ctx.font = '11px sans-serif';
      if (props.state.config?.punishType === 'POISON') {
        ctx.fillStyle = p.poisonDrunk >= 2 ? '#ef4444' : '#10b981';
        ctx.fillText(`毒药: ${p.poisonDrunk || 0}/2`, width - 36, curY + 28);
      } else {
        ctx.fillStyle = !p.isAlive ? '#ef4444' : '#10b981';
        ctx.fillText(`枪击: ${p.bulletsFired || 0}次`, width - 36, curY + 28);
      }

      curY += 54;
    });

    posterImgUrl.value = canvas.toDataURL('image/png');
  } catch (err) {
    console.error('绘制骰子决胜海报失败:', err);
  }
}

async function savePosterImage() {
  if (!posterImgUrl.value) return;

  if (typeof window !== 'undefined' && window.AndroidDevice?.saveImageToGallery) {
    try {
      window.AndroidDevice.saveImageToGallery(posterImgUrl.value);
    } catch (_) {}
  }

  try {
    const a = document.createElement('a');
    a.href = posterImgUrl.value;
    a.download = `骗子酒馆_骰子决胜_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (_) {}

  alert('战报海报已成功生成并保存！');
}
</script>

<style scoped>
.dice-arena-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  color: #f1f5f9;
  user-select: none;
  overflow: hidden;
  position: relative;
}

.header-click-outside-backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: transparent;
}

/* 顶部状态栏 */
.top-nav {
  position: relative;
  z-index: 95;
  height: 52px;
  background: #161b22;
  border-bottom: 1.5px solid #30363d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.room-title {
  font-size: 15px;
  font-weight: 800;
  color: #f59e0b;
}

.room-capacity {
  font-size: 12px;
  color: #94a3b8;
  background: #21262d;
  padding: 2px 8px;
  border-radius: 6px;
}

.mode-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.mode-tag.poison {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.mode-tag.gun {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.extra-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.extra-tag.lock1 {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.extra-tag.spot {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.nav-right {
  display: flex;
  gap: 8px;
}

.nav-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.rules-btn {
  background: #21262d;
  color: #cbd5e1;
  border-color: #30363d;
}

.poster-btn {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.45);
}
.poster-btn:hover {
  background: rgba(245, 158, 11, 0.3);
}

.invite-btn {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
}
.invite-btn:hover {
  background: rgba(16, 185, 129, 0.3);
}

.drawer-toggle-btn {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.4);
}
.drawer-toggle-btn:hover {
  background: rgba(245, 158, 11, 0.3);
}

.cancel-btn, .leave-btn {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.4);
}

/* 核心圆桌竞技场 */
.dice-table {
  width: 76%;
  max-width: 760px;
  height: 74%;
  max-height: 400px;
  position: relative;
  background: radial-gradient(circle at center, #1c2738 0%, #0d131f 70%, #06090e 100%);
  border: 8px solid #3d2817;
  border-radius: 9999px;
  margin: auto;
  box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.8), 0 10px 30px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

/* 环形席位布局 (最多4人，左右完全置于桌子外侧) */
.seat-wrapper {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.3s ease;
  z-index: 10;
}

/* 0号席位: 正下方 (本人) */
.seat-pos-0 {
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%) translateY(100%);
  z-index: 15;
}

/* 1号席位: 左侧 (完全移到桌子外侧，不占桌心与台面) */
.seat-pos-1 {
  left: -14px;
  top: 50%;
  transform: translateX(-100%) translateY(-50%);
  z-index: 14;
}

/* 2号席位: 正上方 (骰子位于头像右侧) */
.seat-pos-2 {
  top: -8px;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  z-index: 14;
}

/* 3号席位: 右侧 (完全移到桌子外侧，不占桌心与台面) */
.seat-pos-3 {
  right: -14px;
  top: 50%;
  transform: translateX(100%) translateY(-50%);
  z-index: 14;
}

.player-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(18, 22, 31, 0.9);
  border: 1.5px solid #2d3748;
  padding: 6px 12px;
  border-radius: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.is-turn .player-card {
  border-color: #f59e0b;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.6);
}

.is-dead .player-card {
  opacity: 0.45;
  filter: grayscale(80%);
}

.avatar-ring {
  position: relative;
  width: 38px;
  height: 38px;
  background: #2d3748;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-emoji {
  font-size: 22px;
}

.badge-tag {
  position: absolute;
  font-size: 10px;
  bottom: -2px;
  right: -2px;
}

.offline-tag {
  bottom: auto;
  top: -8px;
  right: -10px;
  background: #ef4444;
  color: #fff;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 800;
}

.turn-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid #f59e0b;
  animation: pulse-ring 1.2s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.35); opacity: 0; }
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.p-name {
  font-size: 13px;
  font-weight: 700;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-tag {
  font-size: 11px;
  color: #f59e0b;
  font-weight: 800;
}

.poison-bottles {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bottle-item {
  font-size: 13px;
  transition: all 0.3s;
}

.bottle-item.drunk {
  opacity: 0.25;
  filter: grayscale(100%);
  transform: scale(0.85);
}

.life-text {
  font-size: 10px;
  color: #10b981;
  margin-left: 2px;
  font-weight: 700;
}

.life-text.danger {
  color: #f59e0b;
}

.life-text.dead {
  color: #ef4444;
}

.revolver-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.gun-chance {
  color: #f87171;
  font-weight: 700;
}

/* 席位暗骰与骰盅 */
.seat-cup-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.dice-cup {
  background: #3b2614;
  border: 1px solid #6b4423;
  padding: 3px 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
  transition: all 0.3s;
}

.dice-cup.lifted {
  opacity: 0.3;
  transform: translateY(-8px);
}

.cup-icon {
  font-size: 14px;
}

.cup-label {
  font-size: 10px;
  color: #d1d5db;
}

.dice-revealed-tray {
  display: flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.4);
  padding: 3px 6px;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
}

.dice-revealed-tray.is-double-row {
  flex-direction: column;
  gap: 2px;
  padding: 2px 4px;
}

.seat-dice-row {
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: center;
}

.mini-dice {
  font-size: 18px;
  line-height: 1;
  transition: all 0.2s;
}

.mini-dice.highlight {
  color: #fbbf24;
  transform: scale(1.2);
  text-shadow: 0 0 6px #f59e0b;
}

.mini-dice.wild {
  color: #34d399;
  transform: scale(1.15);
  text-shadow: 0 0 6px #10b981;
}

.mini-dice.dimmed {
  opacity: 0.25;
}

/* 桌心公告看板 */
.table-center-board {
  width: 90%;
  max-width: 440px;
  min-height: 140px;
  background: rgba(15, 23, 42, 0.9);
  border: 2px solid #334155;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  z-index: 5;
}

.center-lobby {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.lobby-badge {
  font-size: 16px;
  font-weight: 800;
  color: #f59e0b;
}

.lobby-info {
  font-size: 13px;
  color: #94a3b8;
}

.center-lobby-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.lobby-host-acts {
  display: flex;
  gap: 10px;
}

.c-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.add-bot-btn {
  background: #334155;
  color: #f8fafc;
}

.start-game-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.center-rolling {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.shake-anim-icon {
  font-size: 32px;
  animation: shake-cup 0.4s infinite alternate;
}

@keyframes shake-cup {
  0% { transform: rotate(-10deg) scale(0.95); }
  100% { transform: rotate(10deg) scale(1.05); }
}

.rolling-text {
  font-size: 14px;
  color: #fbbf24;
  font-weight: 700;
}

.bid-hero-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.bid-header-line {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 4px;
}

.bid-label {
  color: #94a3b8;
}

.bid-showcase {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 6px 0;
  flex-wrap: wrap;
}

.bid-caller {
  font-size: 14px;
  font-weight: 700;
  color: #cbd5e1;
}

.bid-verb {
  font-size: 13px;
  color: #94a3b8;
}

.bid-tight-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(245, 158, 11, 0.16);
  border: 1.5px solid rgba(245, 158, 11, 0.5);
  border-radius: 8px;
  padding: 3px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.tight-qty {
  font-size: 22px;
  font-weight: 900;
  color: #fbbf24;
  line-height: 1;
}

.tight-unit {
  font-size: 13px;
  color: #fef3c7;
  font-weight: 700;
}

.tight-die {
  margin: 0 1px;
}

.tight-face {
  font-size: 15px;
  font-weight: 800;
  color: #fef08a;
  line-height: 1;
}

.reveal-target-die {
  display: inline-flex;
  vertical-align: middle;
  margin: 0 2px;
}

.reveal-face-text {
  font-size: 16px;
  font-weight: 800;
  color: #fef08a;
}

.turn-status-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #e2e8f0;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 10px;
  border-radius: 20px;
}

.countdown-tag {
  color: #f59e0b;
  font-weight: 800;
  margin-left: 6px;
}

.countdown-tag.urgent {
  color: #ef4444;
  animation: urgent-blink 0.5s infinite alternate;
}

@keyframes urgent-blink {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.1); opacity: 1; }
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

.footer-gameover-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.c-btn.victory-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #1e1b4b;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
}
.c-btn.reset-btn {
  background: #334155;
  color: #f1f5f9;
}

.reveal-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.reveal-title {
  font-size: 13px;
  font-weight: 700;
  color: #cbd5e1;
}

.reveal-count-line {
  font-size: 14px;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.count-big {
  font-size: 24px;
  color: #fbbf24;
  margin: 0 4px;
}

.count-dice {
  font-size: 20px;
  vertical-align: middle;
}

.wild-sub-text {
  font-size: 11px;
  color: #34d399;
  display: inline;
}

.reveal-result-badge {
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 6px;
  margin-top: 2px;
}

.bidder-win .reveal-result-badge {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.bidder-lose .reveal-result-badge {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.punish-log-text {
  font-size: 12px;
  color: #fca5a5;
  margin-top: 4px;
}

/* 底部操作与控制台 (紧凑单栏架构) */
.dice-footer {
  min-height: 52px;
  position: relative;
  z-index: 50;
  background: #111827;
  border-top: 1px solid #374151;
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
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 16px;
  padding: 3px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #e2e8f0;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}
.log-ticker:hover {
  border-color: #f59e0b;
}
.ticker-icon { font-size: 12px; }
.ticker-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ticker-more {
  color: #fde68a;
  font-size: 10px;
  white-space: nowrap;
}

/* 左上角轻量常驻胶囊区 (默认收起顶部栏) */
.top-collapsed-bar {
  position: absolute;
  top: 10px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 50;
}
.header-toggle-pill, .lan-mini-pill, .dice-mode-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 12px;
  color: #fde68a;
  cursor: pointer;
}
.header-toggle-pill:hover, .lan-mini-pill:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: #f59e0b;
}
.dice-mode-indicator {
  border-color: #f59e0b;
  background: rgba(69, 36, 10, 0.85);
  color: #fef08a;
  font-weight: 700;
  cursor: default;
}
.nav-btn.collapse-btn {
  background: #334155;
  color: #cbd5e1;
}

/* 底部操作区三段式架构 */
.footer-left-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  z-index: 5;
}
.footer-center-controls {
  position: absolute;
  right: 16px;
  left: auto;
  transform: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: auto;
  z-index: 10;
}

.dice-actions-area {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 大厅阶段 */
.footer-lobby-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lobby-guest-tip {
  font-size: 12px;
  color: #94a3b8;
}

/* 存活玩家对决阶段 */
.footer-gaming-dock {
  display: flex;
  align-items: center;
  gap: 12px;
}

.my-dice-strip {
  display: flex;
  align-items: center;
  gap: 8px;
}
.my-dice-strip.has-many-dice {
  gap: 6px;
}

.my-dice-two-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-content: center;
}

.my-dice-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.compact-summary {
  display: flex;
  flex-wrap: wrap;
  max-width: 122px;
  gap: 2px;
}
.compact-summary .sum-mini-badge {
  font-size: 9px;
  padding: 0 3px;
  line-height: 1.25;
}

.dice-mini-summary {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sum-mini-badge {
  font-size: 10px;
  font-weight: 700;
  background: rgba(31, 41, 55, 0.9);
  color: #cbd5e1;
  border: 1px solid #4b5563;
  border-radius: 4px;
  padding: 1px 4px;
  white-space: nowrap;
}
.sum-mini-badge.is-wild {
  border-color: #10b981;
  color: #34d399;
  background: rgba(6, 78, 59, 0.5);
}

.dice-action-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.act-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stepper-compact {
  display: flex;
  align-items: center;
  background: #1f2937;
  border: 1px solid #4b5563;
  border-radius: 6px;
  overflow: hidden;
}
.step-btn {
  background: #374151;
  color: #f1f5f9;
  border: none;
  width: 24px;
  height: 26px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.step-val {
  padding: 0 8px;
  font-size: 12px;
  font-weight: 800;
  color: #fef08a;
  white-space: nowrap;
}

.face-picker-compact {
  display: flex;
  align-items: center;
  gap: 3px;
}
.face-btn-mini {
  padding: 2px;
  border-radius: 4px;
  border: 1.5px solid transparent;
  background: rgba(31, 41, 55, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.face-btn-mini.selected {
  border-color: #f59e0b;
  background: #1e3a8a;
  transform: scale(1.1);
}
.face-btn-mini.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.bid-action-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}
.c-act-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  white-space: nowrap;
  transition: all 0.2s;
}
.c-act-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.bid-confirm-btn {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
}
.challenge-btn, .challenge-btn-primary {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4);
}
.spoton-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
}

.bid-cap-tip {
  font-size: 11px;
  color: #f87171;
  font-weight: 700;
}

.not-turn-dock {
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

.footer-spectator-dock {
  display: flex;
  align-items: center;
  gap: 10px;
}
.spec-tag {
  background: #374151;
  color: #38bdf8;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}
.spec-desc {
  font-size: 11px;
  color: #94a3b8;
}
.s-leave-btn {
  background: #334155;
  color: #f1f5f9;
  border: 1px solid #475569;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

/* 抽屉背板与面板 */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 110;
  backdrop-filter: blur(2px);
}

.drawer-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 340px;
  max-width: 85vw;
  background: #0f172a;
  border-right: 1.5px solid #334155;
  display: flex;
  flex-direction: column;
  box-shadow: 8px 0 28px rgba(0, 0, 0, 0.6);
  animation: slide-in-left 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-in-left {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

.drawer-header {
  padding: 14px 16px;
  border-bottom: 1px solid #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e293b;
}

.drawer-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.d-icon {
  font-size: 18px;
}

.d-title {
  font-size: 15px;
  font-weight: 800;
  color: #f8fafc;
}

.drawer-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.drawer-close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 800;
  color: #fbbf24;
  border-left: 3px solid #f59e0b;
  padding-left: 8px;
}

.section-count {
  font-size: 11px;
  color: #94a3b8;
  font-weight: normal;
}

.empty-sub-tip {
  font-size: 12px;
  color: #64748b;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  text-align: center;
}

.bids-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bid-step-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1e293b;
  border: 1px solid #334155;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.step-num {
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
  width: 24px;
}

.step-avatar {
  font-size: 14px;
}

.step-player {
  font-weight: 700;
  color: #e2e8f0;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-arrow {
  color: #64748b;
  font-size: 11px;
}

.step-bid-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 2px 6px;
  border-radius: 6px;
  margin-left: auto;
}

.s-qty {
  font-weight: 800;
  color: #fbbf24;
}

.s-face {
  font-weight: 800;
  color: #fef08a;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-row {
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(0, 0, 0, 0.25);
  border-left: 2.5px solid #475569;
  padding: 6px 8px;
  border-radius: 0 6px 6px 0;
  line-height: 1.4;
  word-break: break-all;
}

.log-row.log-challenge {
  border-left-color: #f59e0b;
  color: #fef08a;
}

.log-row.log-punish {
  border-left-color: #ef4444;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.1);
}

.log-row.log-bid {
  border-left-color: #3b82f6;
  color: #e2e8f0;
}

/* 模态框通用 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  backdrop-filter: blur(3px);
}

.modal-card {
  width: 90%;
  max-width: 480px;
  background: #161e2e;
  border: 1.5px solid #334155;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-pop {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-title-wrap .m-icon {
  font-size: 18px;
}

.modal-title-wrap .m-title {
  font-size: 16px;
  font-weight: 800;
  color: #f8fafc;
}

.close-x {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.close-x:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.share-badge-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.room-summary-chip {
  display: flex;
  gap: 8px;
  background: #0f172a;
  border: 1px solid #1e293b;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  color: #fbbf24;
  font-weight: 700;
  flex-wrap: wrap;
}

.share-tip {
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.5;
  margin: 0;
}

.link-input-group {
  display: flex;
  gap: 8px;
}

.link-input {
  flex: 1;
  background: #0f172a;
  border: 1.5px solid #334155;
  color: #38bdf8;
  font-family: monospace;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  outline: none;
}

.copy-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.copy-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
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

.copy-toast-tip {
  font-size: 12px;
  color: #34d399;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  padding: 6px 12px;
  border-radius: 6px;
  text-align: center;
}

/* 数量放在点数靠左侧组合 */
.bid-inputs-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.poster-btn-lg {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #111827;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
}

.gameover-acts {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
}

/* 分享海报弹窗 (如图一) */
.share-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 130;
  backdrop-filter: blur(4px);
}

.share-modal-dialog {
  width: 90%;
  max-width: 680px;
  max-height: 90vh;
  background: #111827;
  border: 1.5px solid #374151;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
}

.sm-header {
  padding: 12px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1f2937;
}

.sm-title {
  font-size: 15px;
  font-weight: 800;
  color: #f1f5f9;
}

.sm-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
}

.sm-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.poster-img-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}

.poster-img {
  width: 100%;
  max-width: 600px;
  height: auto;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.sm-footer {
  padding: 12px 18px;
  display: flex;
  justify-content: center;
  gap: 16px;
  border-top: 1px solid #1f2937;
  background: #0f172a;
}

.sm-btn {
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.sm-save-img {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #111827;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
}

.sm-save-img:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.sm-cancel {
  background: #1f2937;
  color: #cbd5e1;
  border: 1px solid #374151;
}

.sm-cancel:hover {
  background: #374151;
}

/* 移动端横屏适配 (参照德州扑克紧凑黄金比例) */
@media (max-height: 560px), (max-width: 900px) {
  .dice-header {
    height: 40px;
    min-height: 40px;
    padding: 0 12px;
  }
  .brand-zone .brand-title { font-size: 14px; }
  .lan-pill, .header-tool-btn, .leave-btn {
    padding: 3px 8px;
    font-size: 11px;
  }
  .table-area {
    padding: 0 10px;
    overflow: visible;
    min-height: 0;
  }
  .dice-table {
    flex: none;
    border-radius: 9999px;
    border: 6px solid #3d2817;
    width: min(68vw, 440px);
    height: min(48vh, 146px);
    aspect-ratio: auto;
    max-width: 72%;
    margin: auto;
    align-self: center;
    overflow: visible;
  }
  .seat-pos-0 {
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    z-index: 15;
  }
  .seat-pos-2 {
    top: -8px;
    left: 50%;
    transform: translateX(-50%) translateY(-100%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    z-index: 14;
  }
  .seat-pos-1 {
    left: -14px;
    top: 50%;
    transform: translateX(-100%) translateY(-50%);
    z-index: 14;
  }
  .seat-pos-3 {
    right: -14px;
    top: 50%;
    transform: translateX(100%) translateY(-50%);
    z-index: 14;
  }
  .player-card {
    padding: 2px 6px;
    gap: 4px;
  }
  .avatar-ring {
    width: 22px;
    height: 22px;
  }
  .avatar-emoji {
    font-size: 12px;
  }
  .u-name {
    font-size: 10px;
    line-height: 1.1;
  }
  .life-text, .gun-chance {
    font-size: 8.5px;
  }
  .cup-icon {
    font-size: 15px;
  }
  .table-center-board {
    min-height: auto;
    max-height: 110px;
    padding: 6px 10px;
    max-width: min(72vw, 360px);
    border-radius: 12px;
    transform: none;
  }
  .reveal-banner {
    gap: 2px;
  }
  .reveal-title {
    font-size: 11px;
    line-height: 1.2;
  }
  .reveal-count-line {
    font-size: 12px;
    line-height: 1.2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .count-big {
    font-size: 18px;
    line-height: 1;
    margin: 0 2px;
  }
  .reveal-target-die :deep(.dice-cube.size-mini) {
    width: 16px !important;
    height: 16px !important;
  }
  .wild-sub-text {
    font-size: 9.5px;
    display: inline;
    margin-left: 2px;
  }
  .reveal-result-badge {
    font-size: 10.5px;
    padding: 2px 8px;
    margin-top: 2px;
  }
  .punish-log-text {
    font-size: 9.5px;
    margin-top: 2px;
    line-height: 1.2;
  }
  .dice-footer {
    min-height: 44px;
    max-height: 48px;
    padding: 2px 10px;
    gap: 6px;
    flex-shrink: 0;
    position: relative;
  }
  .footer-left-zone {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .dice-footer .log-ticker {
    max-width: 85px;
    font-size: 10px;
    padding: 2px 6px;
    gap: 4px;
    flex-shrink: 0;
  }
  .dice-footer .log-ticker .ticker-text {
    display: none;
  }
  .dice-footer .log-ticker::after {
    content: '战报';
    font-size: 11px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
  }
  .footer-center-controls {
    position: absolute;
    right: 10px;
    left: auto;
    transform: none;
    z-index: 10;
  }
  .dice-actions-area {
    margin-left: auto;
    gap: 8px;
    flex-shrink: 0;
  }
  .my-dice-strip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    flex-shrink: 0;
  }
  .my-dice-strip.has-many-dice {
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  .my-dice-two-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .my-dice-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .my-dice-row :deep(.real-die-wrap.size-small) {
    width: 24px !important;
    height: 24px !important;
  }
  .dice-mini-summary {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .sum-mini-badge {
    font-size: 8.5px;
    padding: 0 3px;
    line-height: 1.2;
  }
  .act-controls-row {
    gap: 6px;
  }
  .stepper-compact {
    height: 30px;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 6px;
  }
  .stepper-compact .step-btn {
    width: 28px;
    min-width: 28px;
    height: 30px;
    font-size: 16px;
    font-weight: 900;
  }
  .stepper-compact .step-val {
    padding: 0 6px;
    font-size: 12.5px;
    font-weight: 800;
  }
  .face-picker-compact {
    gap: 3px;
  }
  .face-btn-mini {
    padding: 2px 3px;
    border-radius: 5px;
  }
  .face-btn-mini :deep(.dice-cube.size-mini) {
    width: 24px !important;
    height: 24px !important;
  }
  .bid-action-btns {
    gap: 4px;
  }
  .c-act-btn {
    padding: 5px 9px;
    font-size: 11.5px;
    border-radius: 5px;
    font-weight: 800;
  }
  .c-btn {
    padding: 4px 8px;
    font-size: 11px;
  }
  .c-btn {
    padding: 4px 8px;
    font-size: 11px;
  }
}
</style>
