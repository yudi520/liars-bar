# 🍻 骗子酒馆 (Liar's Bar) - 多人联机博弈小游戏

[![Release](https://img.shields.io/badge/Release-v1.1.0-FF6F00?logo=github)](https://github.com/yudi520/liars-bar/releases/tag/v1.1.0)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-216%20%E9%A1%B9%E5%85%A8%E7%BB%BF-22C55E)](https://github.com/yudi520/liars-bar)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

基于经典桌游玩法与心理博弈打造的跨端多人在线对决游戏。集成三大热门玩法模式，支持**多房间开桌**、**手机局域网面对面免流对决**与**公网云端 Docker 一键部署**，手机/电脑浏览器与 Android 原生 App 全面互通！

---

## 🌟 核心特色

- 🎮 **三大经典博弈模式**：
  - **🃏 恶魔纸牌（Devil's Deck）**：出牌撒谎、相互质疑揭发、俄罗斯轮盘赌开枪惩罚、恶魔牌全场枪决机制。
  - **🎰 德州扑克（Bullet Poker）**：换牌（Switch）、下注/全压（All-In）、5% 神明庇佑奇迹生还、手枪决胜。
  - **🎲 骗子骰子（Liar's Dice）**：吹牛摇骰、叫点加码、质疑开盅、支持 3~10 颗手骰与双排紧凑布局、毒药与轮盘双重惩罚。
- 🏠 **多房间开桌**（云服务器模式）：
  - 房主建房获得 **5 位房间码**，朋友输码加入，或分享链接 `?room=房间码` 扫码直达；
  - 支持同时开多桌，房间之间状态零串扰（服务端按房间隔离广播）；
  - **房间密码**：建房时可为单个房间上锁，输码需验证；
  - **空房自动回收**（30 分钟）与**对局全员掉线回收**（2 小时），内存不随运行时长增长。
- 🔐 **服务端权威安全**：
  - 房主身份由服务端签发凭证，抓包自报无效；集中白名单收口全部房主操作；
  - 断线重连**保留席位与手牌**（凭证轮换 + 幂等恢复，弱网误重试不掉线）；
  - 进服暗号（`SERVER_ACCESS_KEY`）+ 房间密码 + 单连接限流 + 单帧上限，四层防护。
- 📱 **双重运行模式**：
  - **手机局域网免流模式**：Android App 内置独立 Node.js 运行时，无需互联网、面对面热点/WiFi 即可当房主，同伴扫码或搜寻 IP 秒进；
  - **公网云服务器 Docker 模式**：一键在云主机启动容器，异地朋友**无需安装任何 App**，直接用浏览器打开网址即可畅快开黑。
- 📊 **可观测性**：`/api/metrics` 指标接口（房间水位、事件循环延迟 p99、广播耗时、安全计数），默认关闭、按需开启。
- 🖥️ **全端自适应响应式**：针对手机横屏操作做深度优化，UI 细腻流畅，支持全屏沉浸式体验。

---

## 🚀 极速部署（云服务器 Docker 一键开服）

### 方式一：Docker 一行命令启动

在服务器终端进入项目目录，执行：

```bash
# 1. 构建 Docker 镜像 (约 150MB 极简镜像)
docker build -t liars-bar .

# 2. 启动服务 (对外开放 9527 端口，多房间在云部署下自动开启)
docker run -d \
  --name liars-bar-game \
  --restart unless-stopped \
  -p 9527:9527 \
  -e IS_PUBLIC_CLOUD=true \
  -e SERVER_ACCESS_KEY="你的专属暗号" \
  liars-bar
```

### 方式二：Docker Compose 启动

```bash
# 复制环境变量配置
cp .env.example .env

# 按需修改 .env（端口、暗号、房间数上限等，全部带注释）
# vim .env

# 一键启动（新版 Docker 用 docker compose，旧版用 docker-compose）
docker compose up -d --build
```

> ⚠️ **云服务器安全组提示**：请在阿里云/腾讯云/RackNerd 等控制台安全组放行 **TCP 9527** 端口；若服务器启用了防火墙，运行 `ufw allow 9527/tcp`。
>
> 📖 完整部署文档（含 Nginx/HTTPS/WSS 配置、多房间运维要点）见 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)。

---

## 🌐 朋友如何加入联机？

### 云服务器模式（多房间）

1. **房主**打开 `http://服务器地址:9527` → **「👑 创建房间」** → 头部出现房间码（如 `#R7K2M9`，点击可复制）；
2. **朋友**浏览器或 App 打开同一地址 → **「🎮 玩家加入」** → 输入 5 位房间码 + 昵称（私密房再填房间密码）→ 入座开玩；
3. 也可直接分享链接 `http://服务器地址:9527/?room=R7K2M9`，朋友打开后房间码已自动填好。

### 手机局域网免流模式（面对面）

1. 房主手机打开 App → **「👑 创建房间」**；
2. 朋友手机连同一 WiFi/热点 → 浏览器扫二维码，或打开 App 点 **「🔍 探测房主」** 秒连。

> 💡 从 GitHub [Release](https://github.com/yudi520/liars-bar/releases/latest) 下载最新版 APK；局域网模式下朋友也可以直接从房主页面点「📥 极速下载 App」。

---

## 💻 本地开发与构建

### 1. 本地启动开发环境

```bash
# 安装依赖
npm install

# 启动前端开发服务器 (端口 5173) 与后端服务 (端口 9527)
npm run dev
npm run server
```

### 2. 自动化测试

```bash
npm test        # 全套：规则/鉴权/多房间单元/双模式 e2e/压测烟雾，约 2 分钟
npm run test:load-full   # 500 房压力测试（可选）
```

### 3. 构建生产前端

```bash
npm run build
```

---

## 📱 Android APK 客户端打包

本项目基于 Cordova + `nodejs-mobile-cordova` 实现移动端嵌入式 Node 服务：

```bash
# 在 Windows 环境下直接双击运行或终端执行：
build-apk.bat
```

构建产物将自动输出至项目根目录：`liars-bar.apk`。最新版本也已发布到 GitHub [Releases](https://github.com/yudi520/liars-bar/releases/latest)。

---

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `9527` | 服务监听端口 |
| `SERVER_ACCESS_KEY` | *(空)* | 进服暗号（留空公开，填入后需暗号方可入场） |
| `IS_PUBLIC_CLOUD` | `false` | 公网部署标记（决定多房间与旧客户端防护的默认值） |
| `MULTI_ROOM_ENABLED` | 随上项 | 多房间总开关（云部署默认开启，APK 默认关闭） |
| `MAX_ROOMS` / `MAX_ROOMS_PER_IP` | `500` / `20` | 房间数上限 / 单 IP 建房上限 |
| `ROOM_EMPTY_TTL_MS` / `ROOM_ABANDON_TTL_MS` | `30min` / `2h` | 空房回收 / 全员掉线回收 |
| `HOST_RESUME_SAME_IP_ONLY` | `true`（公网） | 房主凭证异地恢复校验 |
| `RATE_LIMIT_PER_SEC` | `10` | 单连接消息速率（突发 20，3 次违规断开） |
| `WS_MAX_PAYLOAD_BYTES` | `65536` | 单帧大小上限 |
| `METRICS_ENABLED` | `false` | 开启 `/api/metrics` 指标接口 |

完整列表与调优建议见 [.env.example](.env.example)。

---

## 📜 开源协议

本项目基于 [MIT](LICENSE) 协议开源。欢迎提交 Issue 与 Pull Request！
