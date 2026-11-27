# MULTI_ROOM_PLAN 第六轮评审记录（收尾轮）

| 项目 | 内容 |
|---|---|
| 评审对象 | `MULTI_ROOM_PLAN.md` v1.5（见同目录 `MULTI_ROOM_PLAN-v1.5-评审归档.md`） |
| 代码基线 | `main` @ `e12d252` |
| 评审日期 | 2026-11-27 |
| 评审方式 | 文档断言与代码逐条核对 + 设计评审 |
| 结论 | **无阻塞问题**；8 项发现（3 P2 / 5 P3）全部接受，并入 v1.6 后文档冻结 |

## 一、事实核查（12 项抽查，全部通过）

第五轮之前未系统做过"文档断言 → 代码"的核对，本轮补做。抽查结果：

| 文档断言 | 代码实际 | 结果 |
|---|---|---|
| `mode: this.room.mode` 在 159 行 | `embedded-server.js:159` | ✅ 精确到行 |
| `getServerInfo()` 在 broadcastState 461 行 | `embedded-server.js:461` | ✅ |
| 单例 `new RoomManager(() => this.broadcastState())` | `embedded-server.js:48` | ✅ |
| `cancelRoom(socketId)` 参数未使用 | `RoomManager.js:239` 函数体未使用该参数 | ✅ |
| `every(p => !p.connected \|\| p.isBot)` 重置分支 | `RoomManager.js:67` | ✅ |
| name 匹配重绑 `offlinePlayer.id = socketId` | `RoomManager.js:83-85` | ✅ |
| `UPDATE_CONFIG` 双广播 | `updateConfig` 内部广播 + `embedded-server.js:387` 再广播 | ✅ |
| 8 个房主操作零校验 | switch 分支逐一核对，恰好 8 个，全部直通 | ✅ |
| 定时器 12/8、8/5、9/3 | `grep -c` 三文件精确匹配 | ✅ |
| `App.vue:25/44/63` 三处 `:my-id` | 逐行确认 | ✅ |
| 固定 1000ms 重连 | `socketService.js:209` `}, 1000)` | ✅ |
| `currentTurnPlayerId` 28/14/14 | occurrence 计数 14/28/14（数值一致，仅排列顺序口径不同） | ✅ |

## 二、发现与处置（8 项，全部接受）

| # | 级别 | 意见 | 判定 | 处置（v1.6 落点） |
|---|---|---|---|---|
| 1 | P2 | `KICK_PLAYER`（P0 新增）与既有 `REMOVE_PLAYER` 语义几乎重合，文档未解释分工 | ✅ 接受 | 4.1 加切分定义：`REMOVE_PLAYER` 为座位层操作（bot 或真人席位，保持现有语义）；`KICK_PLAYER` 为会话层操作（仅大厅、仅真人，发 `KICKED` 并断开）。内部复用同一移除实现 |
| 2 | P2 | `NAME_TAKEN`（房内重名）与 7.2 name 三条件重绑的交互未定义：同名且席位离线但三条件不满足时行为无说明 | ✅ 接受 | 7.2 加三态判定：同名在线 → `NAME_TAKEN`；离线 + 三条件 → 重绑；离线 + 三条件不满足 → 统一 `NAME_TAKEN`（不区分原因，防探测）。4.3 错误码描述同步 |
| 3 | P2 | 安全章节缺 ws `maxPayload` 单帧上限，恶意超大 JSON 帧可在解析前占满内存 | ✅ 接受 | 6.5 新增 `WS_MAX_PAYLOAD_BYTES`（默认 64 KB）；7.4 加传输层条目；11.1 加用例 |
| 4 | P2 | `MULTI_ROOM_ENABLED` 双模式（开/关各一遍 P0 验收）的回归成本未计入 P0-6 | ✅ 接受 | 12 章 P0-6 内容补双模式回归，1.0 → 1.5 人日；P0 合计 6.5 → **7.0**，总量 10.5 → **11.0**；14 章决策 1 影响同步 |
| 5 | P3 | 6.1 `Room.broadcast` 伪代码读 `this.serverInfo`，但缓存归属 ServerInfoCache/EmbeddedServer，Room 需注入引用 | ✅ 接受 | 3.3 Room 结构加 `info: ServerInfoCache`（只读引用）；6.1 伪代码改为 `this.info.snapshot` 并加"Room 内禁 IO"说明 |
| 6 | P3 | `/api/metrics` 暴露房间数、连接数、安全计数，未提访问控制 | ✅ 接受 | 10.3 加约束：公网部署须鉴权（复用 `SERVER_ACCESS_KEY` 或独立 token）或仅绑定内网/localhost |
| 7 | P3 | `QUICK_JOIN` 匹配算法未定义，P0-2 实现时会卡住 | ✅ 接受 | 4.1 定义：同 `mode`、`LOBBY/READY`、未满的房间中选在线人数最多者（尽快凑满开局）；无候选则自动建房。11.1 加用例 |
| 8 | P3 | 5.2 房号冲突重试 5 次后报 `ROOM_LIMIT_REACHED`，映射牵强（32^5 空间下碰撞概率可忽略，该错误码本意是全服上限） | ✅ 接受 | 5.2 改为：生成前先查 `rooms.size >= MAX_ROOMS`；冲突重试失败与上限检查共用 `ROOM_LIMIT_REACHED` |

## 三、评审收敛声明

- 六轮评审的发现规模持续收敛：13 → 6 → 5 → 5 → 3 → 8 项，但第六轮全部为 P2/P3 级澄清，无架构级发现，且 v1.4/v1.5 的多数问题属方案自引入机制的自我修正，而非原始设计的缺陷。
- 事实核查 12 项全部命中，文档与代码基线一致。
- **评审到此冻结**：后续变更不再走全文档评审，按常规 PR + 对应章节小范围评审进行；`docs/reviews/` 仅归档，不再追加。
