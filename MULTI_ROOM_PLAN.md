# 骗子酒馆（Liar's Bar）服务端多房间改造方案

| 项目 | 内容 |
|---|---|
| 文档版本 | **v1.6（冻结版 · 纯实现规格）** |
| 冻结日期 | 2026-11-27 |
| 目标版本 | v1.1.0 |
| 代码基线 | `main` @ `e12d252` |
| 文档状态 | 六轮评审收敛，冻结；本文为 P0 实现与验收的唯一依据 |
| 涉及模块 | `server/embedded-server.js`、`server/RoomManager.js`、`src/App.vue`、`src/components/HomeView.vue`、`src/api/socketService.js` |
| 评审史 | v1.0~v1.5 修订记录与全部评审处置表归档于 `docs/reviews/`（第六轮记录：`MULTI_ROOM_PLAN-第六轮评审记录.md`） |

**v1.6 相对 v1.5 无架构级变更**，仅为第六轮（收尾轮）8 项 P2/P3 处置，正文已并入：

| # | 级别 | 内容 | 落点 |
|---|---|---|---|
| 1 | P2 | `KICK_PLAYER`（会话层）与 `REMOVE_PLAYER`（座位层）切分 | 4.1 |
| 2 | P2 | `NAME_TAKEN` 与 name 三条件重绑的三态判定 | 4.3 / 7.2 / 11.1 |
| 3 | P2 | ws `maxPayload` 单帧上限（默认 64 KB） | 6.5 / 7.4 / 11.1 |
| 4 | P2 | 双模式回归计入 P0-6，P0 合计 6.5 → 7.0 人日 | 8.5 / 12 / 14 |
| 5 | P3 | `Room` 构造注入 `ServerInfoCache` 只读引用 | 3.3 / 6.1 |
| 6 | P3 | `/api/metrics` 访问控制 | 10.3 |
| 7 | P3 | `QUICK_JOIN` 匹配算法定义 | 4.1 / 11.1 |
| 8 | P3 | 房号冲突与 `MAX_ROOMS` 检查共用 `ROOM_LIMIT_REACHED` | 5.2 |

---

## 0. 结论摘要（TL;DR）

当前**一个服务进程只能承载一个房间**：`EmbeddedServer` 在构造时 `new` 了一个 `RoomManager` 单例，`broadcastState()` 把这一份状态广播给所有连接，协议里没有 `roomId` 概念。

改造方向是**在同一进程内做"房间容器化"**：引入 `RoomRegistry` 持有 `Map<roomId, Room>`，每个 `Room` 内部继续复用现有 `RoomManager`（它本身已经是"单房间状态机"，天然适合被实例化多份），把广播从"全服广播"改为"按房间广播"。

**容量结论有一个前置条件**：必须先完成 P0-0（缓存 `serverInfo`）。当前 `broadcastState()` 每次都调用 `getServerInfo()` → `getApkPath()` → `execSync('pm path ...')`。

同一台机器、不同宿主进程实测 **8~105 ms**：CLI Node 连续 20 次中位 8.4 ms、均值 9.3 ms；同一台机器的另一宿主（客户端/Electron 进程）稳定在 **96~105 ms**。宿主环境本身就能造成约 10 倍差异，因此容量必须按目标运行环境实测。

关键不是"要几个核"，而是**它同步阻塞事件循环**：Node 单线程，一次广播卡住多少毫秒，整个进程就停多少毫秒。按"事件循环阻塞 ≤ 10%"的预算，可承载房间数约为 `400 / 单次毫秒`：8~10 ms 时约 43 房，23 ms 时约 18 房，**~100 ms 时仅约 4 房**。下面的容量表全部以 P0-0 已完成为前提。

| 服务器规格 | 可承载房间 | 并发连接 | 出口带宽 | 前提 |
|---|---|---|---|---|
| 1 核 1G / 100 Mbps | 100 ~ 200 | 400 ~ 800 | 8 ~ 20 Mbps | 已缓存 `serverInfo` |
| 2 核 2G / 100 Mbps | **300 ~ 500（推荐）** | 1200 ~ 2000 | 25 ~ 50 Mbps | 已缓存 `serverInfo`、未开压缩 |
| 4 核 8G / 500 Mbps+ | 1000 ~ 2000 | 4000 ~ 8000 | 80 ~ 160 Mbps | 已缓存、压测通过 |
| 任意规格（**未**缓存） | 约 4~43 房（随宿主 8~105 ms） | — | — | 事件循环被 `execSync` 阻塞 |

瓶颈**不是序列化 CPU**（1000 房间约 5~8% 单核），而是**出口带宽**、**单进程可靠性**，以及**任何被放进广播热路径的同步调用**。

**P0 边界（工时按此估算）**：只做多房间容器化 + 房主鉴权 + 前端大厅，**不做**身份解耦、不做手牌级断线重连、不做房间持久化。P0 结束即"旧 APK 完全可用、多桌互不干扰"。

---

## 1. 现状评审

### 1.1 当前架构

```
浏览器 / APK
     │  WebSocket（单连接）
     ▼
EmbeddedServer
  ├── socketMap: Map<ws, socketId>        ← 连接 → socketId
  ├── room: RoomManager                   ← 单例！全服唯一
  │     ├── mode: 'LIARS_DECK' | 'TEXAS_POKER' | 'LIARS_DICE'
  │     ├── players: Player[]             ← 全服唯一玩家数组
  │     └── game: *Game                   ← 全服唯一对局状态
  └── broadcastState()                    ← 遍历 wsServer.clients 全服广播
```

HTTP 侧三个路由的归属需要区分清楚：

| 路由 | 与房间的关系 | 处置 |
|---|---|---|
| `/download-apk` | 无关 | 不改 |
| `/api/save-poster` | 写到服务端所在设备的相册 | 不改 |
| `/api/server-info` | **返回 `mode: this.room.mode`（第 159 行）** | 多房间下语义失效，改为 `mode: null` 或删除该字段；并做整体缓存 |

`serverInfo` 同时被塞进 `INIT_CONNECTED` 和每条 `STATE_UPDATE`，因此它是**广播热路径的一部分**，不能只当普通 HTTP 接口看（见 1.3.2）。

### 1.2 阻碍多房间的问题点（共 17 项）

| # | 位置 | 现状 | 多房间下的后果 |
|---|---|---|---|
| 1 | `embedded-server.js` 构造函数 | `this.room = new RoomManager(...)` | 全服只有一桌 |
| 2 | `embedded-server.js` `broadcastState()` | 遍历 `wsServer.clients`，每人取 `this.room.getPlayerState()` | 所有房间共享同一份状态，必然串房 |
| 3 | `embedded-server.js` `broadcastDisband()` | 全服广播 `ROOM_DISBANDED` | A 房解散会把 B 房一起踢回大厅 |
| 4 | `handleSocketMessage` 的 `JOIN_ROOM` | payload 无 `roomId` | 无法指定加入哪一桌 |
| 5 | `RoomManager.joinPlayer` | `isHost` 由**客户端自报** | 任何人可自称房主；多房间下可直接抢房 |
| 6 | `RoomManager.joinPlayer` 的重置分支 | `players.every(p => !p.connected \|\| p.isBot)` 成立时清空 `players` | 多房间下会误清其他房状态 |
| 7 | `RoomManager.disconnectPlayer` | 断线重连靠 **name 匹配** `p.isOffline && p.name === name` | 重名玩家会互相顶号；跨房间重名更混乱 |
| 8 | `RoomManager.cancelRoom(socketId)` | 参数 `socketId` 未使用 | 任何人都能解散房间 |
| 9 | `embedded-server.js` `UPDATE_CONFIG` 分支 | 先 `room.updateConfig()`（内部已广播）再 `broadcastState()` | 每次改配置**广播两次**，多房间下翻倍放大 |
| 10 | `embedded-server.js` `freePort()` | 启动时 `taskkill` 占用端口的进程 | 多实例部署会互相残杀 |
| 11 | `socketService.scheduleReconnect()` | 固定 1000ms 无退避重连 | 进程重启时形成重连风暴 |
| 12 | 协议 | 无 `roomId` / 无 `revision` / 无错误码 | 无法区分房间、无法丢弃乱序快照 |
| 13 | `broadcastState()` → `getServerInfo()` → `getApkPath()` | 每次广播同步执行 `execSync('pm path ...')`；**同机不同宿主 8~105 ms**（CLI Node 均值 9.3 ms，客户端宿主 96~105 ms） | 同步阻塞事件循环，100 ms 下单次广播就卡顿 1/10 秒 |
| 14 | `handleSocketMessage` 全部分支 | 现有 **8 个房主专属操作全部零校验**（含 `REMOVE_PLAYER`/`RESET_LOBBY`/`START_NEXT_HAND`） | 任何玩家可踢人、重置房间、推进回合 |
| 15 | `INIT_CONNECTED`（第 316~321 行） | 入座前就下发 `state: this.room.getPlayerState(socketId)` | 多房间下"哪个房间的状态"无定义，且是前端 `socketId` 的唯一来源 |
| 16 | `disconnectPlayer` | 重连时执行 `offlinePlayer.id = socketId`（改写主键） | 玩家 ID 语义在会话中途变化，状态里的 id 副本全部失配 |
| 17 | 三个 Game 文件 | 已核实 **12 类** ID 副本：`currentTurnPlayerId`（28/14/14）、`allInPlayerId`、`handStartPlayerId`、`lastPlay.playerId`、`devilPlayerId`、`winnerId`、`lastAction.playerId`、`rouletteEvent.player.id` / `playerId`、`revealEvent.challenger.id` / `liar.id` / `challengerId` / `bidderId`、`showdownResult.winners[].id`、`punishedPlayers[].id`。计数口径：严格 `player.id` 32/13/5；全部 `.id` 69/65/41；`playerId` 21/13/12 | 任何 ID 语义变更都必须同步改写这些副本，漏一个就"轮到一个不存在的人" |

### 1.3 实测容量基线

#### 1.3.1 快照与广播

基准方法：直接实例化真实 `RoomManager`，4 名玩家入座并 `startGame()`，将战报打满至上限（50~60 条），测量"4 客户端各取一次快照 + `JSON.stringify`"的耗时。

| 模式 | 单份快照 | 每动作全房出网 | 广播一轮 CPU |
|---|---|---|---|
| 恶魔纸牌 | 9.9 KB | 40 KB | 0.075 ms |
| 德州扑克 | 4.5 KB | 18 KB | 0.163 ms |
| 骗子骰子 | 7.8 KB | 31 KB | 0.061 ms |

推算（4 人房平均 3~5 秒一次动作 ≈ 0.25 次/秒）：

- 序列化 CPU：单房间 ≈ 0.02 ms/秒 → 1000 房间 ≈ 2% 单核
- 加上 `ws.send`（按经验每帧 20~40 µs，未单独实测）：单次动作 +0.08~0.16 ms → 1000 房约 5~8% 单核
- 带宽：单房间 ≈ 10 KB/s → 1000 房间 ≈ 10 MB/s ≈ 80 Mbps
- 内存：每连接约 30~60 KB（ws 缓冲）+ 每房间几十 KB

#### 1.3.2 热路径隐藏成本

```
broadcastState()                    // 每次状态变更
  └── this.getServerInfo()          // embedded-server.js:461
        ├── getLanIp()              // 遍历网卡
        └── getApkPath()            // :151
              └── execSync('pm path com.liarsbar.game')  // 同步子进程
```

**实测口径**（同一台机器，`pm path ...` 命令不存在）：

| 宿主 / 参数 | 平均 | 中位 | 范围 |
|---|---|---|---|
| CLI Node，20 次，带 `timeout` | 9.3 ms | 8.4 ms | 7.6~27.0 ms |
| CLI Node，10 次，无 `timeout` | 8.2 ms | 7.9 ms | 7.3~9.2 ms |
| CLI Node，10 次，`windowsHide: true` | 22.7 ms | 22.7 ms | 21.0~25.0 ms |
| 同机另一宿主（客户端进程，三次口径） | — | — | 96.0 / 98.4 / 105.5 ms |

**归因**：8~105 ms 的差异来自**同一台机器的不同宿主进程**，不是两台机器，也**不是硬件差异**。CLI Node 下 9.3 ms 稳定可复现；客户端宿主下为 96~105 ms，两种口径互不可复现。差异来自宿主进程的 PATH 长度、shell 启动方式、杀软 / EDR 注入与容器基线。

**结论：按 8~105 ms 区间评估，到目标运行环境实测，不要用任何单点值做容量承诺。**

**论证方式**：`execSync` 不是"占用 0.9 个核"这种并行消耗，而是**同步阻塞事件循环**。Node 单线程，一次广播卡住多少毫秒，整个进程就停多少毫秒。

设单次阻塞 `t` ms、每房动作率 `r = 0.25 次/秒`、房间数 `N`，则事件循环阻塞率：

```
block% = t × r × N / 1000        // 10% 预算下：N ≈ 400 / t
```

| 房间数 | 广播/秒 | @9 ms（CLI） | @23 ms（windowsHide） | @100 ms（客户端宿主） |
|---|---|---|---|---|
| 1（现状） | 0.25 | 0.2% | 0.6% | 2.5% |
| 10 | 2.5 | 2.3% | 5.8% | 25% |
| 50 | 12.5 | 11.6% | 28.8% | **125%（过载）** |
| 100 | 25 | 23.3% | 57.5% | 250% |
| 200 | 50 | 46.5% | **115%** | 500% |
| 500 | 125 | **116%** | 288% | 1250% |

超过 100% 不是"需要更多核"，而是**事件循环排不下队**：广播间隔已经短于单次阻塞时间，进程持续停留在子进程等待中，所有房间的回合倒计时与操作都会堆积。

**结论：`serverInfo` 必须在启动时算一次并缓存，广播只读快照。这是 P0-0，不是优化项。** 在缓存落地前，本方案的任何容量数字都不适用。

#### 1.3.3 压缩内存账

`ws` 的 `permessage-deflate` 是**每连接独立 zlib 上下文**（deflater + inflater），默认参数下按经验每连接约 **250~500 KB**（需实测确认）。

- 2000 连接 ≈ **0.5~1 GB**，2G 内存机型直接触顶。
- 因此压缩**默认关闭**；若要开启，必须把 `windowBits` 降到 9~10、`memLevel` 降到 5，并在压测中单独核算 RSS。
- 首选替代方案：**战报裁剪**（成本为零，快照降 30~50%）。

#### 1.3.4 结论

容量必须同时核算四项成本：序列化（小）、`ws.send`（小）、`permessage-deflate`（内存）、`execSync`（数量级）。核算后：

- 序列化 + 发送仍不是瓶颈；
- **未缓存 `serverInfo` 时，容量由阻塞预算决定**：CLI Node 约 43 房，客户端宿主约 4 房，差异来自宿主而非硬件；
- 缓存后，瓶颈回到带宽与单进程可靠性，第 6.6 节的表才成立。

---

## 2. 目标、非目标与版本边界

### 2.1 目标

1. **单进程多房间**：一个服务实例可同时开多桌，互不可见、状态零串扰。
2. **房间入口**：创建房间 → 获得 5 位房间号 → 他人输码入座；快速匹配为可选项，列表默认关闭。
3. **强制隔离**：任意房间的动作、广播、解散、配置变更只影响本房间。
4. **服务端权威**：房主身份、座位归属、房主操作权限全部由服务端判定，客户端不可伪造。
5. **可回收**：空房间自动回收，进程内存不随运行时长增长。
6. **不破坏旧客户端**：P0 结束后，旧 APK 无需重新打包即可进入 `MAIN` 房间正常游戏。

### 2.2 非目标（本期不做）

- 跨进程/跨机器共享房间状态（Redis 路由、房间迁移）
- **进程重启后的房间恢复**（见 5.5，明确不支持）
- 手牌级断线重连（P1 再做；P0 重连 = 重新入座）
- 观战位、公共聊天大厅、好友系统、账号体系
- 房间内观战者与回放
- 增量 diff 协议（P2）

### 2.3 版本边界

| 能力 | P0 | P1 |
|---|---|---|
| 多房间、房间号、隔离广播 | ✅ | — |
| 房主 `hostToken` 鉴权 + 完整白名单 | ✅ | — |
| 空房回收、定时器注册表 | ✅ | — |
| `serverInfo` 缓存 | ✅（P0-0） | — |
| 旧 APK 兼容（`players[].id === socketId`） | ✅ | ✅（靠视图投影） |
| 断线保留手牌重连（`resumeToken`） | ❌ 重新入座 | ✅ |
| 房间密码、限流 | ❌ | ✅ |
| 战报裁剪（只发最近 20 条） | ✅ | — |
| 合并广播（`setImmediate` + `revision`） | ✅ | — |
| 指标接口 / 背压 | ❌ | ✅ |
| 房间列表 UI | ❌（仅输码 + 快速匹配） | 按决策 |

---

## 3. 总体架构

### 3.1 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 基础层  ServerInfoCache（P0-0）                               │
│   启动时计算一次 lanIp/port/hasApk；网卡变化时刷新；广播只读  │
├──────────────────────────────────────────────────────────────┤
│ 传输层  EmbeddedServer                                        │
│   ├── HTTP: /api/server-info（读缓存）, /download-apk, poster  │
│   └── WS:  handshake → 鉴权(accessKey) → 路由分发             │
├──────────────────────────────────────────────────────────────┤
│ 路由层  SocketSession                                         │
│   socketId, roomId, playerId, hostToken, 限流桶               │
├──────────────────────────────────────────────────────────────┤
│ 注册层  RoomRegistry                                          │
│   rooms: Map<roomId, Room>                                    │
│   socketToRoom: Map<socketId, roomId>                         │
│   createRoom / getRoom / joinRoom / leaveRoom / reap          │
├──────────────────────────────────────────────────────────────┤
│ 房间层  Room（薄封装）                                        │
│   id, passwordHash, manager: RoomManager,                     │
│   sockets: Set<ws>, revision, timers, lastActiveAt            │
├──────────────────────────────────────────────────────────────┤
│ 规则层  RoomManager（**复用现有实现，仅改构造入参与广播出口**）│
│   players[] + game（LiarsDeck / TexasPoker / LiarsDice）      │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 核心设计原则

**原则 1：`RoomManager` 保持"单房间状态机"定位，规则代码零改动。**

它现在的 `players` + `game` + `mode` 三件套正好就是一个房间的全部状态。改造只需：

- 构造函数由 `new RoomManager(broadcast)` 改为 `new RoomManager(roomId, broadcast)`；
- 内部所有 `this.broadcastState()` 语义由"全服"变为"本房间"（通过注入回调实现，**无需改内部调用点**）。

**硬约束**：P0 不改 `players[].id` 语义（保持 `id === socketId`，见 3.5）；P1 的身份改造通过**视图层 ID 投影**完成，同样不改三个 Game 文件（见 4.5）。任何需要改动规则代码的 ID 方案都违反本原则。

**原则 2：路由信息挂在连接（Session）上，不放在每条消息里。**
`ACTION`、`START_GAME`、`CANCEL_ROOM` 等消息**不接受客户端传的 `roomId`**，一律以服务端 `socket → roomId` 映射为准，从根上堵住越权操作。

**原则 3：广播由房间自己发起，不再有全服广播函数。**
`EmbeddedServer.broadcastState()` 删除，改为 `Room.broadcast()`；`broadcastDisband()` 收敛为 `Room.close(reason)`。

**原则 4：广播热路径只允许 O(房间人数) 的纯内存操作。**
禁止 `execSync`、禁止文件 IO、禁止读网卡、禁止重新计算 `serverInfo`。P0-0 用测试守住这条（见 11.1）。

### 3.3 数据结构（示意，非最终代码）

```js
// ServerInfoCache（P0-0）
{
  snapshot: { lanIp, port, lanUrl, hasApk, apkDownloadUrl,
              requireAccessKey, isPublicCloud, mode: null },
  refreshAt: 1690000000000,     // 默认 60s，或网卡变化事件触发
  refresh() { /* 只在启动/刷新时执行 execSync */ }
}

// RoomRegistry
{
  rooms: Map<roomId, Room>,
  socketToRoom: new Map(),      // socketId -> roomId
  resumeTokens: new Map(),      // P1：tokenHash -> { roomId, playerId, tokenVersion, hostEpoch,
                                //      expiresAt, prevTokenHash, prevExpiresAt, revokedAt }
  resumeIdempotency: new Map(), // P1：`${playerId}:${requestId}:${tokenHash}` ->
                                //      { result, issuedToken, tokenHash, expiresAt }
  stats: { created: 0, closed: 0, rejected: 0 }
}

// Room
{
  id: 'R7K2M9',
  createdAt: 1690000000000,
  lastActiveAt: 1690000000000,
  passwordHash: null,
  manager: RoomManager,
  info: ServerInfoCache,        // 构造时注入的只读引用；广播时取 info.snapshot
  sockets: new Set(),
  sessions: new Map(),          // ws -> SocketSession
  revision: 0,
  broadcastScheduled: false,
  timers: new Set(),            // P0：定时器注册表
  emptySince: null
}

// SocketSession
{
  socketId: 'user_...',
  roomId: null,
  playerId: null,               // P0 等于 socketId；P1 为稳定 ID
  hostToken: null,
  rate: { tokens: 20, lastRefill: 0 }
}
```

### 3.4 请求链路

```
ws.message
  → 限流检查（令牌桶）
  → JSON 解析 + schema 校验
  → 会话查找（socketId → roomId）
  → 房间存在性 / 成员资格校验
  → 权限校验（房主专属动作走集中白名单）
  → room.manager.handleAction(session.playerId, ...)
  → room.scheduleBroadcast()        ← setImmediate 合并，只读 serverInfo 缓存
```

### 3.5 与旧客户端的契约（P0 必须冻结）

| 契约 | P0 行为 | 原因 |
|---|---|---|
| `INIT_CONNECTED.socketId` | 保留，值不变 | 旧 APK 用它标识"我" |
| `players[].id` | **恒等于该玩家当前 `socketId`** | 旧 APK 用 `p.id === mySocketId` 判断自己 |
| `INIT_CONNECTED.state` | 置 `null` | 入座前无房间上下文；旧代码 `if (data.state)` 可安全跳过 |
| 消息名与 payload | 全部保留 | 旧 APK 无法升级 |
| 新增字段 | 只增不改 | 旧代码不读即忽略 |

---

## 4. 协议设计

### 4.1 消息总表

**新增（客户端 → 服务端）**

| 消息 | 作用 | 关键字段 | 阶段 |
|---|---|---|---|
| `CREATE_ROOM` | 建房并自动入座为房主 | `name, avatar, mode, config, password?` | P0 |
| `JOIN_ROOM` | 按房间号入座（带 `roomId`） | `roomId, name, avatar, password?` | P0 |
| `QUICK_JOIN` | 快速匹配，无空房则建房 | `name, avatar, mode` | P0 |
| `LEAVE_ROOM` | 主动离座 | — | P0 |
| `KICK_PLAYER` | 房主踢人（仅大厅） | `playerId` | P0 |
| `LIST_ROOMS` | 拉取可加入的房间列表 | `mode?, page?, pageSize?` | P1（默认关闭） |
| `RESUME_SESSION` | 断线重连恢复席位与手牌 | `resumeToken, requestId` | P1 |
| `REVOKE_SESSIONS` | 房主/本人显式撤销旧会话 | `targetPlayerId?, reason?` | P1 |
| `TRANSFER_HOST` | 房主移交 | `playerId` | P1 |

**新增（服务端 → 客户端）**

| 消息 | 作用 | 阶段 |
|---|---|---|
| `ROOM_CREATED` | `{ roomId, hostToken, state }` | P0 |
| `ROOM_CLOSED` | `{ roomId, reason }`，取代 `ROOM_DISBANDED` | P0 |
| `KICKED` | `{ reason }` | P0 |
| `ERROR` | `{ code, message, requestId? }`，统一错误出口 | P0 |
| `ROOM_LIST` | `{ rooms: [...], total }` | P1 |
| `SESSIONS_REVOKED` | `{ playerId, reason }`，被显式撤销的连接收到后断开 | P1 |

**改造（保留原名，语义收敛到本房间）**

`SWITCH_MODE`、`UPDATE_CONFIG`、`ADD_BOT`、`REMOVE_PLAYER`、`START_GAME`、`START_NEXT_HAND`、`RESET_LOBBY`、`ACTION`、`CANCEL_ROOM`、`REQUEST_SWITCH_CANDIDATES`、`SELECT_SWITCH_CHOICE`

> 对外名称与 payload 完全不变，只是服务端处理时从"全局 `this.room`"改为"`registry.get(session.roomId)`"。旧前端调用无需改动。

> **`KICK_PLAYER` 与 `REMOVE_PLAYER` 的切分**：`REMOVE_PLAYER` 是**座位层**操作（移除指定席位，可为 bot 或真人，保持现有消息语义不变）；`KICK_PLAYER` 是**会话层**操作（仅大厅、仅真人，向被踢连接发送 `KICKED { reason }` 并关闭其 ws）。两者均为房主专属，内部复用同一移除实现。

> **`QUICK_JOIN` 匹配算法**：在**同 `mode`、状态 `LOBBY/READY`、未满**的房间中选**在线人数最多**的一桌加入（尽快凑满开局），并列时随机；无候选房间则走 `CREATE_ROOM` 流程自动建房（建房者即房主）。

**`INIT_CONNECTED` 的改造定义**

```jsonc
// ← 连接建立后立即下发，此时尚未入座
{ "type": "INIT_CONNECTED",
  "socketId": "user_...",          // 保留：旧客户端唯一身份来源
  "serverInfo": { /* 缓存快照 */ },
  "state": null }                  // 多房间下无默认房间，置 null
```

旧前端 `if (data.state) gameState.value = data.state` 可安全跳过；新前端在收到 `ROOM_CREATED` / `STATE_UPDATE` 后再渲染。

### 4.2 关键 Schema

```jsonc
// → CREATE_ROOM
{ "type": "CREATE_ROOM",
  "payload": { "name": "酒馆老板", "avatar": "👑",
               "mode": "LIARS_DECK",
               "config": { "maxPlayers": 4 },
               "password": null } }

// ← ROOM_CREATED
{ "type": "ROOM_CREATED",
  "payload": { "roomId": "R7K2M9",
               "hostToken": "ht_9f3a...",   // 仅本连接持有
               "state": { /* 房间快照 */ } } }

// → JOIN_ROOM（P0）
{ "type": "JOIN_ROOM",
  "payload": { "roomId": "R7K2M9", "name": "阿三", "avatar": "🦊",
               "password": null } }

// → RESUME_SESSION（P1，必须带 requestId）
{ "type": "RESUME_SESSION",
  "payload": { "resumeToken": "rs_1c7b...",
               "requestId": "rq_7f2a..." } }   // 幂等键，重试时必须复用

// ← ERROR
{ "type": "ERROR",
  "payload": { "code": "ROOM_FULL", "message": "房间已满（4 人），无法加入！" } }
```

### 4.3 错误码

| code | HTTP 类比 | 说明 |
|---|---|---|
| `ROOM_NOT_FOUND` | 404 | 房间号不存在、已回收，或服务已重启 |
| `ROOM_FULL` | 409 | 达到 `config.maxPlayers` |
| `ROOM_IN_GAME` | 409 | 对局已开始，禁止中途入座 |
| `WRONG_PASSWORD` | 403 | 房间密码错误（P1） |
| `NOT_HOST` | 403 | 非房主执行房主操作 |
| `FORBIDDEN` | 403 | 已入座但无该操作权限（如撤销他人会话） |
| `NOT_IN_ROOM` | 409 | 当前连接未入座 |
| `NAME_TAKEN` | 409 | 房内重名（含重绑三条件不满足时的统一回包，见 7.2） |
| `RESUME_EXPIRED` | 410 | 重连凭证过期（P1） |
| `RESUME_REPLAYED` | 409 | 旧 token 重放，仅拒绝本次，不影响当前会话（P1） |
| `RESUME_RATE_LIMITED` | 429 | 同一来源重连频率过高（P1） |
| `RATE_LIMITED` | 429 | 触发限流（P1） |
| `ROOM_LIMIT_REACHED` | 503 | 达全服房间数上限 |
| `INVALID_ACTION` | 400 | 动作非法（复用现有 `throw new Error` 文案） |

> 过渡期保留 `ERROR_NOTICE` 通道（前端已监听），新代码统一走 `ERROR`，一个版本后移除旧通道。

### 4.4 状态快照扩展

**P0**（只增字段，不动 `players[].id`）：

```jsonc
{
  "roomId": "R7K2M9",
  "revision": 42,
  "self": { "socketId": "user_...", "isHost": true, "seat": 0 },
  "hostId": "user_...",            // 即房主的 socketId
  "players": [ /* 保持原样，id === socketId */ ]
}
```

**P1**（引入稳定 `playerId` 后，按客户端能力投影）：

```jsonc
{
  "self": { "playerId": "p_...", "socketId": "user_...", "isHost": true },
  "hostId": "p_...",
  "players": [ /* 新客户端：id = playerId；旧客户端：id = 当前 socketId */ ]
}
```

**兼容性**：P0 只增加 `roomId/revision/self/hostId`，`players[].id` 语义不变，旧 APK 与现有组件全部照常工作。

### 4.5 身份模型

旧客户端依赖 `p.id === mySocketId` 判断自己（`App.vue:25/44/63` 把 `INIT_CONNECTED.socketId` 传给各 Arena 的 `:my-id`），直接把 `players[].id` 改成稳定 `playerId` 会让所有旧客户端失配。因此身份模型分两阶段：

| 阶段 | 内部主键 | 快照投影 | 旧客户端 | 新客户端 |
|---|---|---|---|---|
| **P0** | `player.id = socketId` | 无 | ✅ | 用 `self.socketId` |
| **P1** | `player.id` 保持**首次入座时的 socketId 字符串**（此后不再改写），另存 `player.socketId` 为当前连接 | 旧客户端：把 `players[].id` 与 `currentTurnPlayerId` 投影为各自当前 `socketId`；新客户端：原样返回 | ✅ | 用 `self.playerId` |

**关键实现点**：当前重连逻辑 `offlinePlayer.id = socketId` 会改写主键，这是所有 ID 副本失配的根源。P1 改为：

- 重连只更新 `player.socketId = 新socketId`，`player.id` 不变；
- 服务端收到动作时，先用 `session.playerId` 找到玩家，再把 `player.id` 传给 `game.actionXxx`——**Game 文件一行不改**；
- 只改 `RoomManager` 里的"按 socket 找玩家"辅助函数（约 3~5 处）；
- 快照出口加一层 `projectStateForViewer(state, viewer)`。

**投影必须递归，且必须键名感知**。已核实的 ID 副本远不止 `players[].id` 与 `currentTurnPlayerId`，至少 12 类：

| # | 位置 | 形态 |
|---|---|---|
| 1 | `currentTurnPlayerId` | 顶层字符串 |
| 2 | `allInPlayerId` | 顶层字符串 |
| 3 | `handStartPlayerId` | 顶层字符串 |
| 4 | `lastAction.playerId` | 嵌套对象 |
| 5 | `lastPlay.playerId` | 嵌套对象 |
| 6 | `devilPlayerId` | 嵌套对象（纸牌） |
| 7 | `winnerId` | 嵌套对象（骰子） |
| 8 | `rouletteEvent.player.id` / `rouletteEvent.playerId` | 嵌套对象 |
| 9 | `revealEvent.challenger.id` / `liar.id` | 嵌套对象（纸牌） |
| 10 | `revealEvent.challengerId` / `bidderId` | 嵌套对象（骰子） |
| 11 | `showdownResult.winners[].id` | 嵌套数组（德州） |
| 12 | `showdownResult.punishedPlayers[].id` | 嵌套数组（德州） |

算法：

```js
// 稳定 ID -> 当前 socketId（旧客户端视角）
const idMap = new Map(players.map(p => [p.id, p.socketId]));

function project(node, key) {
  if (Array.isArray(node)) return node.map(v => project(v, key));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = project(v, k);
    return out;
  }
  // 只替换“键名是 id/xxxId”的字符串，避免误伤名字、战报文本、卡牌 id
  if (typeof node === 'string' && /^(id|[a-z][a-zA-Z0-9]*Id)$/.test(key) && idMap.has(node)) {
    return idMap.get(node);
  }
  return node;
}
```

> **正则必须覆盖 camelCase**：`/^(id|[a-z]+Id)$/` 会漏掉 `currentTurnPlayerId`、`allInPlayerId`、`handStartPlayerId`、`devilPlayerId`——恰好是上表列出的关键字段。改为 `/^(id|[a-z][a-zA-Z0-9]*Id)$/` 后 12 类字段全部命中，且 `name` / `text` / `avatar` 仍不匹配（已用 15 个键名实测）。
>
> `cardId`、`roomId` 也会命中正则，但由 `idMap.has(node)` 做第二道闸：映射表只含玩家 ID，卡牌 / 房间 ID 不在表中，因此不会被替换。

**测试守卫（P1）**：重连后序列化旧客户端快照，断言其中**不出现任何玩家的稳定 ID**，且所有 `id`/`*Id` 字段的值都属于当前活连接；漏一个字段就会表现为"轮到一个不存在的人"。

这样既保住"规则代码零改动"，又拿到稳定 ID，额外成本约 **1 人日**。

---

## 5. 房间生命周期

### 5.1 状态机

```
        CREATE_ROOM
             │
             ▼
        ┌─────────┐  第 2 人入座   ┌──────────┐  START_GAME  ┌──────────┐
        │  LOBBY  │ ─────────────► │  READY   │ ───────────► │ PLAYING  │
        └─────────┘                └──────────┘              └──────────┘
             │                           │                         │
             │ 全员离开                   │ 全员离开                  │ GAME_OVER
             ▼                           ▼                         ▼
        ┌─────────┐                ┌─────────┐              ┌──────────┐
        │ EMPTY   │ ── TTL 超时 ──► │ CLOSED  │ ◄──────────── │ SETTLED  │
        └─────────┘                └─────────┘   房主解散      └──────────┘
```

- `LOBBY / READY / SETTLED` 允许加入；`PLAYING` 默认禁止入座。
- `EMPTY` 状态启动 **30 分钟** 回收定时器（`ROOM_EMPTY_TTL_MS`），期间保留房间号与配置。
- 对局中全员掉线：保留 **2 小时**（`ROOM_ABANDON_TTL_MS`）后回收。
- P0 的 "EMPTY 回座" 指**重新入座**（新 `socketId`），不保留手牌；P1 才保留。

### 5.2 房间号规则

- 长度 **5 位**，字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`（剔除 `0/O/1/I`），熵 ≈ 32^5 ≈ 3350 万。
- 生成前先检查 `rooms.size >= MAX_ROOMS`，达标直接报 `ROOM_LIMIT_REACHED`；生成时查 `Map` 去重，冲突重试最多 5 次（32^5 空间下碰撞概率可忽略），仍失败同样报 `ROOM_LIMIT_REACHED`。
- 大小写不敏感：入参统一 `toUpperCase().trim()`。
- 展示前缀 `#R7K2M9`，URL 参数 `?room=R7K2M9` 便于分享。
- **注意**：若房间列表公开，"防枚举"这一理由自动失效，安全边界应改为"房间密码 + 限流"，不能同时宣称两者。

### 5.3 回收与资源释放

房间关闭时必须执行 `Room.dispose()`：

1. 从 `timers` 注册表逐个 `clearTimeout`；
2. 清空 `sockets`，向每个客户端发 `ROOM_CLOSED`；
3. 从 `rooms`、`socketToRoom`、`resumeTokens` 中删除；
4. 置 `manager = null` 帮助 GC。

> **定时器是头号泄漏源。** 现有 `setTimeout` 回调会直接 `this.broadcastState()`，房间销毁后若定时器未清，会访问已销毁的 `manager` 并抛异常。
>
> 实测清理覆盖率不足：
>
> | 文件 | `setTimeout` | `clearTimeout` | 未覆盖 |
> |---|---|---|---|
> | `LiarsDeckGame.js` | 12 | 8 | 4 |
> | `LiarsDiceGame.js` | 8 | 5 | 3 |
> | `TexasPokerGame.js` | 9 | 3 | 6 |
>
> 单房间时漏清只会在下次开局被覆盖；多房间下每个房间漏几处，会让"已关闭房间"持续广播并持有内存。
>
> **P0 硬要求**：把三个 Game 文件里的 `setTimeout` 统一替换为 `room.setTimer(fn, ms)`，`dispose()` 时全量清理，覆盖率必须是 **29/29**。这属于对规则文件的**最小侵入改动**，不涉及 ID 或规则逻辑。

### 5.4 房主移交

| 场景 | 策略 |
|---|---|
| 房主主动离开（大厅） | 顺位移交给座位号最小的在线人类玩家 |
| 房主断线（对局中） | 保留房主席位 + AI 托管，**不移交**；超时 2 小时回收 |
| 房主主动 `TRANSFER_HOST`（P1） | 目标必须在线且非 bot |
| 全房无人类 | 进入 `EMPTY` 计时 |

### 5.5 进程重启语义

**房间状态全部在内存，进程重启 = 所有房间消失。**

- `resumeToken` 只解决 **WebSocket 断线**（同进程），不解决重启；
- 签名 token 也救不回来：签名只能证明凭证可信，不能把 `players` 和 `game` 变回来；
- Docker `restart: unless-stopped` 会"自动恢复服务"，但**不会恢复对局**，用户看到的是 `ROOM_NOT_FOUND`，必须回大厅；
- 若未来要支持，唯一路径是房间快照持久化（周期落盘 + 启动重建），列为 P2 之外，本期不做。

UI 层必须明确提示："服务器重启后房间会消失，请重新建房。"

### 5.6 `hostId` 生命周期

**不变量（任何时刻必须成立）**：

```js
function assertHostInvariant(room) {
  const host = room.players.find(p => p.isHost && !p.isBot);
  const ok = host ? room.hostId === host.id : room.hostId === null;
  if (!ok) {
    room.close('host_state_corrupt');
  }
}
```

每次重绑/移交后调用 `assertHostInvariant()`；不成立则关闭房间并告警，不允许带病运行。**空房（全员离开、房间待回收）时人类房主不存在，合法状态是 `room.hostId === null`**，不能直接对 `undefined` 取 `.id`。

| 事件 | 触发方 | `player.id` | `player.socketId` | `room.hostId` | `players[].isHost` | `hostToken` |
|---|---|---|---|---|---|---|
| `CREATE_ROOM` | 建房者 | = 新 socketId | = 新 socketId | = `player.id` | true | 新签发 |
| 普通入座 | 其他玩家 | = 其 socketId | = 其 socketId | 不变 | false | — |
| 房主断线（对局中） | ws close | 不变 | 置 null | 不变 | true（保留） | 随连接失效 |
| 房主重连（P0 name 重绑） | `JOIN_ROOM` | **原子改写为新 socketId** | = 新 socketId | **= 新 socketId** | true | 重新签发 |
| 房主重连（P1 token） | `RESUME_SESSION` | 不变（稳定 ID） | = 新 socketId | 不变 | true | 重新签发 |
| 房主主动离开（大厅） | `LEAVE_ROOM` | 移除 | — | 顺位移交 | 新 host true / 旧 false | 给新 host 签发 |
| `TRANSFER_HOST`（P1） | 房主 | 不变 | 不变 | = 目标 `player.id` | 目标 true / 旧 false | 给目标签发 |
| 房主超时 / 房间回收 | TTL | 随房间销毁 | — | 置 null | — | 撤销 |
| 解散房间 | `CANCEL_ROOM` | 随房间销毁 | — | 置 null | — | 撤销 |
| 被踢（`KICK_PLAYER`） | 房主 | 仅非房主可被踢 | — | 不变 | — | — |

**硬规则**：

1. 重绑必须走单一函数 `rebindHostPlayer(room, player, newSocketId)`，**禁止**在 `joinPlayer` / `disconnectPlayer` 里散落赋值（现 `offlinePlayer.id = socketId` 就是散落赋值的典型）；
2. 重绑在**同一事务**内完成 `player.id`、`player.socketId`、`room.hostId`、`isHost` 四项改写；任一步失败则回滚到"房主离线、`hostId` 指向旧值"，不允许半更新；
3. 重绑成功后立即关闭旧 ws（`4001 replaced`），防止旧连接双活后仍能发房主操作；
4. `players[].isHost` 只用于展示与旧客户端兼容，**权限判定的唯一依据是 `room.hostId`**；
5. 房主**不可被踢**，只能移交或解散；
6. 房主重连仍须先过 7.2 的三条件（旧客户端 + 席位离线 + 同 IP），P1 后改走 token。

---

## 6. 广播与性能

### 6.0 P0-0：`serverInfo` 缓存

```js
// 启动时 / 网卡变化时 / 每 60s 刷新一次
refreshServerInfo() {
  const apkPath = this.getApkPath();          // 唯一允许 execSync 的地方
  this.serverInfo = { lanIp: this.getLanIp(), port: this.port, hasApk: !!apkPath,
                      /* ... */ mode: null };
}

// 广播只读
const info = this.serverInfo;
```

- 禁止在 `broadcastState`、`getPlayerState`、`Room.broadcast` 中调用 `getServerInfo()`；
- `/api/server-info` 也读缓存，避免每次 HTTP 请求 spawn 子进程；
- 验收：连续 1000 次广播，`execSync` 调用次数为 **0**（测试用 spy 断言）。

### 6.1 按房间广播

```js
broadcast() {
  const rev = ++this.revision;
  const info = this.info.snapshot;    // ServerInfoCache 只读引用（构造时注入），零 IO
  for (const ws of this.sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const session = this.sessions.get(ws);
    let state = this.manager.getPlayerState(session.playerId);
    state = projectStateForViewer(state, session);   // P1 才需要，P0 恒等
    const payload = JSON.stringify({ type: 'STATE_UPDATE', state: { ...state, revision: rev }, serverInfo: info });
    if (ws.bufferedAmount > HIGH_WATER) { this.dropSlowClient(ws); continue; }
    ws.send(payload);
  }
}
```

> `Room` 只持有 `ServerInfoCache` 的**只读引用**（3.3 的 `info` 字段）；`Room` 及 `RoomManager` 内不得出现 `getServerInfo()` / `execSync` / 任何 IO（原则 4）。

### 6.2 合并广播（消除重复推送）

现状 `UPDATE_CONFIG` 会**广播两次**（`RoomManager.updateConfig` 内一次 + `EmbeddedServer` 一次）。改造后统一：

```js
scheduleBroadcast() {
  if (this.broadcastScheduled) return;
  this.broadcastScheduled = true;
  setImmediate(() => { this.broadcastScheduled = false; this.broadcast(); });
}
```

同一 tick 内多次状态变更只产生**一帧**快照，按现有动作频率可减少 20~40% 出网量。

### 6.3 快照裁剪与压缩

| 手段 | 收益 | 成本 | 优先级 |
|---|---|---|---|
| 战报只发最近 20 条（德州已做，纸牌/骰子仍全量 50~60 条） | 快照降 30~50% | 极低 | **P0** |
| `revision` 丢旧快照 | 避免慢客户端堆积过期帧 | 低 | **P0** |
| 合并广播 | 出网降 20~40% | 低 | **P0** |
| `permessage-deflate` | 出网降 5~8 倍 | **每连接 250~500 KB 内存**，CPU 翻倍 | P1，默认关闭 |
| 增量 diff | 再降 70%+ | 高，需协议重构 | P2 |

> 压缩若开启，必须使用 `windowBits: 9~10`、`memLevel: 5`，并在 2000 连接压测中检查 RSS；否则 2G 机型会被 zlib 上下文吃光。

### 6.4 背压与慢客户端

- 连接级 `bufferedAmount` 高水位 `1 MB`，超限 `terminate()` 并记 `slow_client_dropped`。
- 移动端切后台/弱网是常态；P0 靠"重新入座"恢复，P1 靠 `resumeToken` 补状态，**都不补帧**。

### 6.5 容量上限配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `MULTI_ROOM_ENABLED` | `false`（APK）/ `true`（云） | 总开关 |
| `MAX_ROOMS` | `500` | 全服房间上限 |
| `MAX_CONNECTIONS` | `2000` | 全服连接上限 |
| `MAX_ROOMS_PER_IP` | `20` | 单 IP 建房上限 |
| `ROOM_EMPTY_TTL_MS` | `1800000`（30 分钟） | 空房回收 |
| `ROOM_ABANDON_TTL_MS` | `7200000`（2 小时） | 全员掉线回收 |
| `WS_HIGH_WATER_BYTES` | `1048576` | 慢客户端阈值 |
| `WS_MAX_PAYLOAD_BYTES` | `65536`（64 KB） | 单帧上限，超限直接关闭连接 |
| `SERVER_INFO_REFRESH_MS` | `60000` | 缓存刷新间隔 |
| `PERMESSAGE_DEFLATE` | `false` | 压缩开关，默认关 |
| `RATE_LIMIT_PER_SEC` | `10`（突发 20） | 单连接消息速率（P1） |
| `ALLOW_LEGACY_HOST_CLAIM` | `true`（APK）/ `false`（公网建议） | 旧客户端 `isHost` 抢房开关，见 7.1 残留风险 |
| `HOST_RESUME_SAME_IP_ONLY` | `true`（公网）/ `false`（局域网） | 房主从异地恢复时强制二次确认或拒绝 |
| `RESUME_IDEMPOTENCY_TTL_MS` | `120000`（2 分钟） | 同 `requestId` 幂等结果缓存窗口 |
| `RESUME_PREV_TOKEN_GRACE_MS` | `60000`（1 分钟） | 轮换后旧 token 的宽限期，用于收纳丢失响应的重试 |
| `RESUME_RATE_LIMIT_PER_MIN` | `5` | 单 IP + playerId 的恢复尝试上限 |

### 6.6 容量结论（修正版）

前提：P0-0 生效、压缩关闭、战报裁剪开启、4 人房。

| 服务器规格 | 房间 | 连接 | 带宽 | CPU（序列化+发送） |
|---|---|---|---|---|
| 1 核 1G | 100~200 | 400~800 | 8~20 Mbps | 2~4% |
| 2 核 2G | 300~500 | 1200~2000 | 25~50 Mbps | 6~12% |
| 4 核 8G | 1000~2000 | 4000~8000 | 80~160 Mbps | 20~40% |

对照（未缓存 `serverInfo`，按 10% 阻塞预算）：

| 单次 `execSync` | 实际可承载 | 依据 |
|---|---|---|
| 9 ms（CLI Node） | **约 43 房** | `400 / 9` |
| 23 ms（`windowsHide`） | 约 18 房 | `400 / 23` |
| 100 ms（客户端宿主） | **约 4 房** | `400 / 100` |

> 这里的限制与 CPU 核数**无关**：`execSync` 阻塞的是唯一的事件循环，加核不能并行掉这段等待。容量必须按**部署实际宿主**取值；同一台机器换宿主就能差 10 倍。

> 以上仍为推算，需按 11.3 压测确认；真实上限以 `event_loop_delay p99` 与 RSS 为准。

---

## 7. 安全设计

### 7.1 房主鉴权

**现状**：`handleSocketMessage` 的**所有房主操作都没有任何校验**——8 个房主专属操作（`START_GAME`、`ADD_BOT`、`REMOVE_PLAYER`、`RESET_LOBBY`、`START_NEXT_HAND`、`UPDATE_CONFIG`、`SWITCH_MODE`、`CANCEL_ROOM`）全部零校验，任何连接都可以执行。

**改造**：

- `CREATE_ROOM` / 首个入座者由服务端生成 `hostToken`（随机 32 字节），仅下发一次；
- 服务端维护**集中式白名单常量**，而不是在各分支散落 `if`：

| 动作 | 房主限定 | 备注 |
|---|---|---|
| `START_GAME` | ✅ | |
| `START_NEXT_HAND` | ✅ | |
| `RESET_LOBBY` | ✅ | |
| `ADD_BOT` | ✅ | |
| `REMOVE_PLAYER` | ✅ | |
| `KICK_PLAYER` | ✅ | P0 新增 |
| `UPDATE_CONFIG` | ✅ | |
| `SWITCH_MODE` | ✅ | 仅大厅 |
| `CANCEL_ROOM` | ✅ | |
| `REVOKE_SESSIONS` | ✅ 房主 / 本人 | 房主可撤销本房任意人；本人仅可撤销自己；否则 `FORBIDDEN`（P1） |
| `TRANSFER_HOST` | ✅ | P1 |
| `ACTION` | ❌ | 由 `game.actionXxx` 校验回合归属 |
| `REQUEST_SWITCH_CANDIDATES` / `SELECT_SWITCH_CHOICE` | ❌ | 仅本人 |
| `LEAVE_ROOM` | ❌ | 仅本人 |

- 校验入口只有一个：`assertHost(session, room)`，返回 `NOT_HOST`；
- 客户端不再发送 `isHost` 字段（服务端忽略之，仅用于旧客户端首个入座的兼容判定）。

> **已知残留风险：MAIN 房 legacy 抢房**
>
> 旧 APK 无 `hostToken`，若完全不采信 `isHost`，旧客户端将永远无法当房主。因此保留一条**受限兼容分支**：
>
> - 仅 `roomId === 'MAIN'`（或 `MULTI_ROOM_ENABLED=false`）；
> - 仅 `LOBBY` 阶段；
> - 仅当房内**无人类房主**；
> - 仅当该席位通过 7.2 的同 IP 校验；
> - 每次命中共 `legacy_host_claim` 指标并写安全日志。
>
> 该分支仍允许同 IP 内的恶意客户端抢 MAIN 房主，属于**兼容性妥协**，不是漏洞修复。公网部署建议 `ALLOW_LEGACY_HOST_CLAIM=false`，强制走 `CREATE_ROOM`；退场条件：强制升级后旧客户端占比 < 5%，即可删除该分支与 `isHost` 入参。

### 7.2 重连与 `name` 降级

| 阶段 | 策略 |
|---|---|
| **P0** | 无 token。旧客户端按 `name` 重绑，**必须同时满足**：① 该席位 `isOffline === true`；② 请求来自同一 IP；③ 仅允许重新入座，不改变房主归属。每次重绑记安全日志 |
| **P1** | `resumeToken` 优先；`name` 降级仅对未升级客户端开放，并在旧客户端退场后删除 |

> `name` 匹配既是现状问题（见 1.2 #7 顶号），又是旧客户端重连的唯一可行手段——这是**有意的临时妥协**：用三条件把顶号风险压缩到"同 IP + 对方恰好离线"，并设定退场条件（旧客户端退场后删除该路径，P1 起改走 token）。

**重名判定规则（与 `NAME_TAKEN` 的交互）**：入座时若房间内存在同名玩家：

1. 该席位**在线** → 返回 `NAME_TAKEN`；
2. 该席位**离线**且通过上述三条件 → 走重绑；
3. 该席位**离线**但三条件不满足（如不同 IP）→ 一律返回 `NAME_TAKEN`，不区分具体原因（避免被用于探测离线席位归属）。

多房间下房间内不允许重名。

#### 7.2.1 `resumeToken` 轮换、幂等与重放处置

`resumeToken` 若绑定房主席位，**泄露后重连即可换到新签发的 `hostToken`，实际等价于房主凭证**。但"同一 token 第二次使用即判攻击"有两处硬伤：

1. **误伤弱网重试**：服务端已轮换 token，但响应在移动网络中丢失；客户端超时重试用的还是旧 token，会被当攻击者踢回大厅；
2. **DoS 放大**：攻击者拿一个已失效的旧 token 重放，就能触发"撤销该玩家全部会话"，把合法房主踢下线。

**三条原则：先幂等、后判重放；重放只拒本次、不主动踢人；撤销只能显式触发。**

| 场景 | 判定 | 处置 |
|---|---|---|
| 同 token + 同 `requestId`，幂等窗内 | 客户端重试 | 返回缓存结果（含上次签发的 token），**命中后校验 token 哈希一致**；不重复轮换、不告警 |
| 轮换后旧 token + 同 `requestId`，宽限期内 | 响应丢失 | 幂等表命中（键含**旧** token 哈希），返回缓存结果；不依赖 `prevTokenHash` |
| 旧 token + 新 `requestId`，宽限期内 + 同 IP | 客户端未复用 `requestId` | 不在幂等表，用 `prevTokenHash` 匹配旧 token；允许一次恢复并轮换，记 `resume_grace_used`；不同 IP → `RESUME_REPLAYED` |
| 已失效 token + 新 `requestId`，超出宽限期 | 重放 / 泄露 | **仅拒绝本次** `RESUME_REPLAYED` + 记 `token_replay` 告警；**不撤销当前会话、不关闭 ws** |
| 同来源高频重放（≥ 5 次/分钟） | 滥用 | 对该 IP + token 临时限流 `RESUME_RATE_LIMITED`；合法会话仍不受影响 |
| 房主显式 `REVOKE_SESSIONS` | 主动处置 | 撤销目标会话并轮换 token，向被撤销连接发 `SESSIONS_REVOKED` |

配套约束：

| 措施 | 说明 |
|---|---|
| 幂等键 | `${playerId}:${requestId}:${sha256(token)}`，TTL `RESUME_IDEMPOTENCY_TTL_MS`（120 s）；只存内存 |
| 命中校验 | 缓存中的 `tokenHash` 必须与请求 token 哈希一致；不一致按重放处理，**不返回缓存的凭证** |
| 幂等结果 | 缓存"上次签发的 token + 响应"，以便响应丢失后原样重发 |
| 轮换宽限 | 保留 `prevTokenHash` / `prevExpiresAt` `RESUME_PREV_TOKEN_GRACE_MS`（60 s） |
| 只存哈希 | 服务端存 `sha256(token)`，不落明文；比对用恒定时间比较 |
| 绑定维度 | `roomId + playerId + tokenVersion`；房主席位额外绑定 `hostEpoch` |
| 重签房主凭证 | 恢复房主时重新签发 `hostToken`，**旧 `hostToken` 立即失效** |
| 异地恢复 | 房主席位从不同 IP 恢复时，强制二次确认或拒绝（`HOST_RESUME_SAME_IP_ONLY`） |
| 限流 | 单 IP + `playerId` 恢复尝试 `RESUME_RATE_LIMIT_PER_MIN`（5 次/分钟） |

> 结论：`resumeToken` 不是"长期登录态"，而是**一次性、可轮换、可撤销、带幂等窗口的短期凭证**。判重放时**永远不能以"踢掉当前会话"作为默认动作**，否则弱网和攻击者都能用它制造掉线。
>
> **幂等键必须含 token 哈希**：若只用 `playerId + requestId`，知道这两个值（日志、前端存储、截图）的人可以用任意 token 命中幂等表并拿到"上次签发的 token"，直接接管会话。`prevTokenHash` 只服务宽限期场景，不能代替幂等键里的 token 校验。

### 7.3 房间密码（P1）

- 房间级可选密码，存 `sha256(salt + password)`，不落明文；
- 与全服 `SERVER_ACCESS_KEY` 正交：暗号是"进店"，密码是"进雅间"；
- 5 次错误后该连接 60 秒内禁止再试。

### 7.4 限流与输入校验

- 每连接令牌桶：`10 次/秒`，突发 20；超限回 `RATE_LIMITED`，连续 3 次违规断开（P1）；
- 入参：`name` 长度 1~12、`avatar` 白名单、`roomId` 正则 `^[A-Z0-9]{5}$`；
- 单帧上限：ws `maxPayload = WS_MAX_PAYLOAD_BYTES`（默认 64 KB），超限 `terminate()` 并计数；JSON 解析失败的帧直接丢弃并计数，不回包（防放大）；
- 所有动作必须在"轮到该玩家"且"房间状态允许"时才执行，现有 `game.actionXxx` 已有校验，不绕过。

### 7.5 现有风险修复清单

| 风险 | 处置 | 阶段 |
|---|---|---|
| `freePort()` 用 `taskkill` 杀端口进程 | 仅 `NODE_ENV !== 'production'` 且 `FORCE_FREE_PORT=1` 时启用 | P0 |
| `cancelRoom(socketId)` 不校验身份 | 改为 `room.close('host_disband')` + `assertHost` | P0 |
| 现有 8 个房主操作零校验 | 集中白名单（10 项，含 2 项新增）+ `assertHost` | P0 |
| 广播热路径 `execSync` | `serverInfo` 缓存 | **P0-0** |
| 定时器未清 | `room.setTimer` 注册表，29/29 清理 | P0 |
| 未捕获异常 | per-room 隔离 + 快速失败 + supervisor（见 10.1） | P0 |
| 重连风暴 | 指数退避 + 抖动（1s→2s→4s，上限 30s，±30%） | P0 |
| 无 `roomId` 越权 | 路由以服务端映射为准 | P0 |
| 超大/畸形帧 | `maxPayload` 64 KB，解析失败丢帧计数 | P0 |
| 顶号 | P0 三条件限制；P1 token | P0/P1 |

---

## 8. 前端改造

### 8.1 视图与路由

现有 `currentView` 只有 `'HOME' | 'HOST' | 'PLAYER'`，改为：

```
HOME
 ├── 创建房间  ──► HOST（携带 roomId）
 ├── 输码加入  ──► PLAYER
 └── 快速匹配  ──► PLAYER（P0 可选）
```

- URL 支持 `?room=R7K2M9` 直达（扫码/分享）；
- 保持 `?host=1` 与 `?name=xxx` 两个既有调试参数可用；
- 房间列表 UI 推迟到 P1，且默认关闭。

### 8.2 大厅 UI（`HomeView.vue`）

P0 只做两块：

1. **创建房间**：昵称、头像、模式（纸牌/扑克/骰子）、人数 2~4；
2. **输码加入**：5 位房间号 + 昵称（+ 密码框预留，P1 启用）。

> 房间列表移出 P0（与决策 #3"公网默认关闭"一致）；`QUICK_JOIN` 不依赖列表，由服务端直接选房（算法见 4.1）。

### 8.3 状态管理与自愈逻辑（关键）

`App.vue` 现有两处"自愈兜底"会在 `init` 与 `state_update` 中检测 `hasHost` 并补发 `JOIN_ROOM`（`isHost: true`）。多房间下这段逻辑**必须带 `roomId`**，否则会加入默认房间，出现"人在 A 房界面、状态来自 B 房"。

**P0 改造**：

- 新增 `currentRoomId`（`localStorage` 持久化：`lb.room`）；
- 自愈补发改 `JOIN_ROOM { roomId: currentRoomId, name, avatar }`，**不再传 `isHost`**；
- `state.roomId !== currentRoomId` 时**直接丢弃该帧**（防止串房渲染）；
- `ROOM_CLOSED` 的 `roomId === currentRoomId` 才回 HOME；
- 刷新页面后若 `lb.room` 存在，尝试重新入座；失败显示"房间已不存在"并回 HOME。

**P1 追加**：改用 `RESUME_SESSION { resumeToken, requestId }`；`requestId` 必须与 `resumeToken` **一起持久化**（如 `localStorage: lb.resume.<roomId>` 存 `{ token, requestId, expiresAt }`），重试时**复用同一 `requestId`**，不得重新生成。刷新/重启后若 `requestId` 丢失，只能走 60 s 宽限期；超过则按重放拒绝并回大厅。

### 8.4 `socketService.js`

| 改动 | 说明 | 阶段 |
|---|---|---|
| 增加 `roomId` / `currentRoomId` | 入座后记录 | P0 |
| 重连改为指数退避 + 抖动 | 替代固定 1000ms | P0 |
| `pendingQueue` 增加过期时间 | 断线超过 60 秒的入座指令丢弃 | P0 |
| 新增事件 | `room_created`、`room_closed`、`kicked`、`error` | P0 |
| 兼容双发 | 保留 `room_disbanded` 映射到 `room_closed` | P0 |
| `resumeToken` + 自动 `RESUME_SESSION` | 重连保留手牌 | P1 |
| `requestId` 持久化与复用 | 与 `resumeToken` 同存；重试不重新生成；丢失时走宽限期 | P1 |
| `room_list` 事件 | 列表 | P1 |

### 8.5 组件影响面

| 文件 | P0 影响 | P1 影响 |
|---|---|---|
| `App.vue` | 视图状态、房间路由、自愈、事件监听（改动最大） | 接 `RESUME_SESSION` |
| `HomeView.vue` | 新增创建/输码两块 UI | 列表 UI |
| `HostArena.vue` | 仅透传 `roomId` | — |
| `GameArena.vue` / `LiarsDeckArena.vue` / `LiarsDiceArena.vue` | **零改动**（`myId` 仍等于 socketId） | 若采用稳定 ID，改用 `state.self.playerId` |
| `VictoryBanner.vue` / `ShowdownModal.vue` | 无改动 | 无改动 |

> P0 的 `Arena` 零改动是"冻结旧契约"带来的直接收益，也是 P0 工时估算成立的前提。

---

## 9. 兼容与降级

### 9.1 兼容矩阵

| 客户端 | P0 | P1（启用稳定 ID 后） |
|---|---|---|
| 旧 APK（< 1.1，无房间概念） | ✅ 完全可用，自动进 `MAIN` | ✅ 依赖视图投影；需回归测试 |
| 新前端 1.1 | ✅ 房间号入座 | ✅ 使用 `self.playerId` |
| 未带 `roomId` 的 `JOIN_ROOM` | 进 `MAIN` | 进 `MAIN` |
| 旧客户端断线重连 | ✅ 按 `name` 三条件重绑 | ✅ 同上，逐步切 token |

### 9.2 降级与回滚

| 策略 | 说明 |
|---|---|
| **默认房间** | 无 `roomId` 请求进 `MAIN`，旧前端/旧 APK 行为不变 |
| **总开关** | `MULTI_ROOM_ENABLED=false` 时只允许 `MAIN`，等价现状 |
| **APK 场景** | Cordova 嵌入式默认关闭多房间（单机即一桌） |
| **消息双发** | 过渡期同时发 `ROOM_DISBANDED` 与 `ROOM_CLOSED` |
| **回滚** | 置 `false` 重启即可，无需回滚代码；但重启会清空房间（见 5.5） |

---

## 10. 可靠性与可观测性

### 10.1 异常隔离

分三层，**不使用"`uncaughtException` 保活"**：

1. **动作层**：每个消息处理包 `try/catch`，异常只影响本房间，记 `roomId + action + stack`，返回 `ERROR`；
2. **定时器层**：`room.setTimer` 包装回调，异常时 `room.close('internal_error')`，并从注册表移除；
3. **进程层**：`uncaughtException` / `unhandledRejection` 只做"记录 + 优雅退出"，由 systemd / Docker restart policy 拉起新进程。

> 原因：游戏状态机抛异常时往往已经半更新，继续服务会让"半损坏房间"继续广播，比崩溃更难排查。进程崩溃的代价是"全服重连"，用 5 秒内重启 + 客户端退避吸收，优于长期带病运行。

### 10.2 退出与重启

`SIGTERM` 时：

1. 停止接受新连接；
2. 向所有房间广播 `SERVER_SHUTDOWN`（前端提示"服务器维护，房间将失效"）；
3. 等待 3 秒排空发送缓冲；
4. 退出。**重启后所有房间消失**，客户端重连会收到 `ROOM_NOT_FOUND` 并回大厅。

### 10.3 指标（`/api/metrics`）

| 指标 | 用途 |
|---|---|
| `rooms_active` / `rooms_by_status` | 容量水位 |
| `ws_connections` | 连接数水位 |
| `msgs_in_per_sec` / `msgs_out_per_sec` | 流量 |
| `broadcast_duration_ms{p50,p95,p99}` | 广播耗时 |
| `event_loop_delay_ms{p99}` | **卡顿第一指标**，> 100 ms 告警 |
| `exec_sync_block_ms` / `server_info_refresh_total` | 守住 P0-0，异常时立刻可见 |
| `heap_used_bytes` / `rss_bytes` | 内存泄漏、zlib 占用 |
| `bytes_out_per_sec` | 带宽 |
| `rate_limit_hits` / `slow_client_dropped` | 滥用与弱网 |
| `legacy_host_claim` | 旧客户端 `isHost` 抢房命中 |
| `token_replay` / `resume_grace_used` / `resume_rate_limited` | 重放、宽限期恢复、恢复限流 |
| `room_create_failed{code}` | 建房失败归因 |

> `/api/metrics` 暴露房间数、连接数与安全计数，公网部署不得无鉴权暴露：复用 `SERVER_ACCESS_KEY` 或独立 token，或仅绑定内网 / `localhost`。

---

## 11. 测试计划

### 11.1 单元测试（`node:test`，与现有 `test/` 一致）

| 用例 | 断言 |
|---|---|
| 房间号格式与大小写 | 5 位、字符集合规、`r7k2m9` ≡ `R7K2M9` |
| 满员加入 | `ROOM_FULL` |
| 非房主执行房主动作（P0：9 个 = 8 现有 + `KICK_PLAYER`；P1：+ `TRANSFER_HOST`） | 逐项 `NOT_HOST`（矩阵测试，不抽样） |
| `REVOKE_SESSIONS` 权限双路径（P1） | 房主撤销他人 → 允许；本人撤销自己 → 允许；普通玩家撤销他人 → `FORBIDDEN` |
| `INIT_CONNECTED` 未入座 | `state === null`，`socketId` 存在 |
| P0 契约 | 快照中 `players[].id` 恒等于该玩家当前 `socketId` |
| 房间回收 | `rooms.size` 减 1，`manager` 为空，`timers.size === 0` |
| `hostId` 不变量（空房） | 全员离开后 `room.hostId === null`，`assertHostInvariant()` 不抛错 |
| 投影键名匹配（表驱动，P1） | 12 类字段名全部匹配（含 `currentTurnPlayerId` 等 camelCase）；`name` / `text` / `avatar` 不匹配；`idMap` 未命中时不替换 |
| 重名三态 | 同名席位在线 → `NAME_TAKEN`；离线 + 三条件 → 重绑；离线 + 三条件不满足 → `NAME_TAKEN` |
| `KICK_PLAYER` 边界 | 仅大厅可用，被踢者收 `KICKED` 并断开；对局中 → `INVALID_ACTION` |
| `QUICK_JOIN` 选择 | 同模式多候选时选在线人数最多且未满者；无候选时自动建房 |
| 单帧上限 | 超过 `maxPayload` 的连接被关闭，其他连接不受影响 |
| **`serverInfo` 缓存** | spy `child_process.execSync`，1000 次广播调用次数为 **0** |
| 定时器覆盖 | 静态检查三个 Game 文件 `setTimeout` 均经 `room.setTimer`（29/29） |

### 11.2 集成测试（多房间隔离，**最高优先级**）

| 用例 | 断言 |
|---|---|
| A、B 两房各 2 人 | A 房动作只推给 A 房连接，B 房连接零帧 |
| A 房 `CANCEL_ROOM` | B 房状态不变、不收到 `ROOM_CLOSED` |
| A 房切换模式 | B 房 `state.mode` 不变 |
| A 房玩家断线 | 只影响 A 房座位 |
| 100 房并发建/解散 | 无串房、无泄漏、无未捕获异常 |
| 旧客户端模拟 | 用 P0 契约的字段（socketId）驱动，全流程可玩 |
| **房主断线 → 重连（P0 name 重绑）** | `room.hostId === player.id` 成立；`START_GAME` / `ADD_BOT` 成功；旧连接发房主操作返回 `NOT_HOST` |
| 房主重绑失败注入 | 回滚为"房主离线、`hostId` 指旧值"，无半更新、无两个 `isHost` |
| P1：快照残留稳定 ID 扫描 | 重连后旧客户端快照中不出现任何稳定 ID，所有 `*Id` 都属于当前活连接 |
| P1：弱网重试（同 `requestId`） | 同 token + 同 `requestId` 重发 → 返回同一结果，不重复轮换，合法会话不掉线 |
| P1：响应丢失（旧 token + 同 `requestId`） | 宽限期内幂等恢复成功，不告警 |
| P1：重放攻击（旧 token + 新 `requestId`） | 仅该请求返回 `RESUME_REPLAYED`，合法 ws 仍在线，`token_replay` 计数 +1 |
| P1：重放 DoS（高频） | 触发 `RESUME_RATE_LIMITED`，合法会话不受影响 |
| P1：显式撤销 | `REVOKE_SESSIONS` 后被撤销连接收到 `SESSIONS_REVOKED` 并断开，token 轮换 |

### 11.3 压测（`test/load/`，自建 `ws` 客户端）

| 场景 | 目标 |
|---|---|
| 500 房 × 4 连接 = 2000，1 动作/3 秒，30 分钟 | `event_loop_delay p99 < 50ms`、`broadcast p95 < 20ms`、RSS 平稳 |
| 2000 连接同时重连 | 30 秒内恢复，无 OOM，`execSync` 仍为 0 |
| 单连接刷 `ACTION` | 被限流，其他房间延迟不受影响 |
| 对照实验 | 关闭 P0-0 缓存复跑一次，确认容量断崖，证明前置项必要性 |

### 11.4 验收标准

1. 两房并行对局，双方状态互不可见；
2. 500 房压测无串房、2 小时浸泡堆增长 < 10%；
3. 任一房间抛异常，其余房间不受影响，进程不退出；
4. **旧版 APK 不重新打包即可连入 `MAIN` 并正常游戏**（P0 契约不变）；
5. 抓包改 `isHost` 无效，房主动作对普通玩家全部返回 `NOT_HOST`（P0 测 9 个，P1 补 `TRANSFER_HOST`）；
6. 单房间 1000 次动作期间 `execSync` 调用次数为 0；
7. 房主断线重连后仍能 `START_GAME`；旧连接无法再执行房主操作；
8. 全员离开后房间不变量断言不抛错（`hostId === null`）；
9. 弱网重试不导致房主掉线；旧 token 重放不能让合法会话下线。

---

## 12. 实施阶段与工时

| 阶段 | 内容 | 产出 | 工时 |
|---|---|---|---|
| **P0-0** | `ServerInfoCache` + 广播热路径去 IO + 测试守卫 | 容量前提成立 | 0.5 人日 |
| **P0-1** | `RoomRegistry` + `Room` + 按房间广播 + 会话映射 + 战报裁剪 + 合并广播 | 双房隔离可跑 | 1.5 人日 |
| **P0-2** | 协议：`CREATE_ROOM`/`JOIN_ROOM`/`QUICK_JOIN`/`ROOM_CLOSED`/`ERROR`/`INIT_CONNECTED` | 接口可用 | 1.0 人日 |
| **P0-3** | 房间号、生命周期、空房回收、定时器注册表（29/29） | 无泄漏 | 0.5 人日 |
| **P0-4** | 房主 `hostToken` + 集中白名单 + `assertHost` | 权限收口 | 0.5 人日 |
| **P0-5** | 前端创建/输码 + 房间路由 + 自愈改造 + 退避重连 | 端到端可用 | 1.5 人日 |
| **P0-6** | 隔离集成测试 + 房主重连/权限用例 + 双房人工验证 + 旧客户端回归 + 双模式（`MULTI_ROOM_ENABLED` 开/关各一遍）验收 | P0 验收 | 1.5 人日 |
| **P0 合计** | | | **7.0 人日** |
| **P1-1** | 稳定 ID + 视图投影（不改 Game 文件） | 手牌级重连 | 1.0 人日 |
| **P1-2** | `resumeToken`（轮换 / 幂等 / 重放限流，含前端 `requestId` 持久化契约）/ 房间密码 / 限流 | 安全加固 | 1.5 人日 |
| **P1-3** | 背压 + 指标接口 + （可选）压缩 | 容量可观测 | 0.5 人日 |
| **P1-4** | 500 房压测 + 2 小时浸泡 + 异常注入 | 压测报告 | 1.0 人日 |
| **P1 合计** | | | **4.0 人日（累计 11.0）** |
| **P2** | 多实例横向扩展（按 roomId 路由 + 共享注册表） | 可选 | 3~5 人日 |

> 工时按两个前提拆分估算：规则代码零改动（P0 冻结契约）+ P0-0 已完成。**P0 7.0 人日**交付"多房间 + 旧客户端可用 + 房主鉴权（含重连保持）"；**P1 +4.0 人日**补齐"手牌级重连 + 安全（含 token 幂等与轮换）+ 可观测"。若把身份改造强行放进 P0，则 P0 8.0、P1 降为 3.0，总量约 11.0 人日，但风险前移、旧客户端需回归。

---

## 13. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 广播热路径含同步子进程（`execSync`） | 高 | **高（容量断崖）** | P0-0 缓存 + 单测守卫 `execSync === 0` |
| 状态串房 | 中 | 高 | 集成测试 + `state.roomId` 前端二次校验 |
| 定时器泄漏 | 高 | 中 | 注册表 + 29/29 覆盖 + 浸泡测试 |
| 单进程崩溃全服掉线 | 中 | 高 | 房间隔离 + 快速失败 + supervisor 5 秒拉起 |
| 房主越权（8 个现有动作零校验） | 高 | 高 | 集中白名单 + 矩阵测试 |
| **房主重连丢权限 / 双活** | 高 | 高 | 5.6 原子重绑 + 不变量断言 + 旧连接 `4001` 关闭 + 集成测试 |
| MAIN 房 legacy 抢房（旧客户端兼容） | 中 | 中 | `ALLOW_LEGACY_HOST_CLAIM` 开关 + 四条件 + 退场条件 |
| 带宽先于 CPU 打满 | 高 | 中 | 战报裁剪 + 合并广播 + `MAX_ROOMS` |
| `permessage-deflate` 内存 | 中 | 高 | 默认关闭；开启时降 `windowBits/memLevel` |
| 旧客户端因 ID 语义变更失配 | 中 | 高 | P0 冻结契约；P1 视图投影 + 回归 |
| 重启被误解为"可恢复" | 中 | 中 | 文档 + UI 明示；`ROOM_NOT_FOUND` 引导回大厅 |
| 房间号被枚举 | 低 | 中 | 列表默认关闭；开启列表则改靠密码/限流 |
| 移动端弱网重连风暴 | 高 | 中 | 指数退避 + 抖动 + 过期待发指令丢弃 |
| `freePort` 误杀进程 | 低 | 高 | 生产默认关闭 |
| 超大/畸形帧拖垮进程 | 低 | 高 | `maxPayload` 64 KB + 解析失败丢帧计数 |

---

## 14. 待决策项（附建议与影响）

| # | 决策 | 建议 | 影响 |
|---|---|---|---|
| 1 | `playerId` 解耦放 P0 还是 P1 | **P1**，且采用"稳定 ID + 视图投影"（不改 Game 文件） | P0 7.0 人日；P1 4.0 人日。若强行进 P0，则 P0 8.0、P1 3.0，总量约 11.0 |
| 2 | 进程重启后是否恢复房间 | **明确不支持** | 无需持久化，P0/P1 工时不变；UI 需提示 |
| 3 | 房间列表是否默认公开 | **公网默认关闭**，只保留输码 + 快速匹配 | P0 不做列表 UI；若要做，需先接受"防枚举"失效 |
| 4 | 对局中能否加入 | **禁止** | 无需观战快照裁剪 |
| 5 | 是否引入 Redis | **不引入**（单实例 500 房足够） | P2 才考虑按 `roomId` 一致性哈希 |
| 6 | APK 是否需要多房间 | **不需要**，`MULTI_ROOM_ENABLED=false` | 无额外移动端工作 |

> 本文档按以上建议写成。若第 1、3 项改为相反选择，第 4、8、12 章需同步返工。

---

## 附录 A：改造前后对照

| 维度 | 改造前 | P0 后 | P1 后 |
|---|---|---|---|
| 房间数 | 1 | `MAX_ROOMS`（默认 500） | 同左 |
| 并发上限 | 4 | 2000 连接 | 同左 |
| 广播范围 | 全服 | 本房间 | 本房间 |
| 广播热路径 | 含 `execSync`（8~105 ms，随宿主） | 纯内存 | 纯内存 |
| 房主判定 | 客户端自报 | `hostToken` + 白名单 | 同左 |
| 房主重连 | 改写 `player.id` 但 `hostId` 不同步 → 丢权限 | 5.6 原子重绑，权限保持 | 同左（稳定 ID） |
| 重连 | 昵称匹配（改写主键） | 昵称三条件，重新入座 | `resumeToken`，保留手牌 |
| `players[].id` | `socketId` | `socketId`（冻结） | 稳定 ID + 视图投影 |
| 解散影响 | 全服 | 本房间 | 本房间 |
| 房间号 | 无 | 5 位码 + URL 直达 | 同左 |
| 空房回收 | 无 | 30 分钟 TTL | 同左 |
| 错误处理 | 无错误码 | 14 个标准错误码 | 同左 |
| 进程重启 | 全服重置 | **明确不恢复** | 同左 |
