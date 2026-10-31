# 🍻 骗子酒馆 (Liar's Bar) - 多人联机博弈小游戏

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android-FF6F00)](https://github.com/yudi520/liars-bar)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

基于经典桌游玩法与心理博弈打造的跨端多人在线对决游戏。集成三大热门玩法模式，支持**手机局域网面对面免流对决**与**公网云端 Docker 一键部署**，手机/电脑浏览器与 Android 原生 App 全面互通！

---

## 🌟 核心特色

- 🎮 **三大经典博弈模式**：
  - **🃏 恶魔纸牌（Devil's Deck）**：出牌撒谎、相互质疑揭发、俄罗斯轮盘赌开枪惩罚、恶魔牌全场枪决机制。
  - **🎰 德州扑克（Bullet Poker）**：换牌（Switch）、下注/全压（All-In）、5% 神明庇佑奇迹生还、手枪决胜。
  - **🎲 骗子骰子（Liar's Dice）**：吹牛摇骰、叫点加码、质疑开盅、支持 3~10 颗手骰与双排紧凑布局、毒药与轮盘双重惩罚。
- 📱 **双重运行模式**：
  - **手机局域网免流模式**：Android App 内置独立 Node.js 运行时，无需互联网、面对面热点/WiFi 即可当房主，同伴扫码或搜寻 IP 秒进。
  - **公网云服务器 Docker 模式**：一键在云主机启动容器，异地朋友**无需安装任何 App**，直接用浏览器打开网址即可畅快开黑！
- 🔒 **私密防蹭服保护**：
  - 支持配置进服暗号（`SERVER_ACCESS_KEY`），陌生人即使扫描到服务器 IP 也无法进入，杜绝带宽盗用。
- 🖥️ **全端自适应响应式**：
  - 针对手机横屏操作做深度优化，UI 细腻流畅，支持全屏沉浸式体验。

---

## 🚀 极速部署（云服务器 Docker 一键开服）

### 方式一：Docker 一行命令启动（最推荐）

在服务器终端进入项目目录，执行：

```bash
# 1. 构建 Docker 镜像 (约 150MB 极简镜像)
docker build -t liars-bar .

# 2. 启动服务 (对外开放 9527 端口)
docker run -d \
  --name liars-bar-game \
  --restart unless-stopped \
  -p 9527:9527 \
  liars-bar
```

#### 开启防蹭服私密暗号（可选）：
如果不想让陌生人占用服务器席位，启动时加上密码暗号：
```bash
docker run -d \
  --name liars-bar-game \
  --restart unless-stopped \
  -p 9527:9527 \
  -e SERVER_ACCESS_KEY="你的专属暗号" \
  liars-bar
```

---

### 方式二：Docker Compose 启动

```bash
# 复制环境变量配置
cp .env.example .env

# 按需修改 .env 中的端口与暗号
# vim .env

# 一键启动
docker-compose up -d --build
```

> ⚠️ **云服务器安全组提示**：请在阿里云/腾讯云/RackNerd等控制台安全组放行 **TCP 9527** 端口；若服务器启用了防火墙，运行 `ufw allow 9527/tcp`。

---

## 🌐 朋友如何加入联机？

服务器启动后：

### 1. 网页端直接加入（零门槛，免装 App）
异地朋友在**手机或电脑浏览器**中直接访问：
```
http://<你的公网IP或域名>:9527
```
填入昵称，如果有暗号填入暗号，点击 **「🎮 加入房间」** 即可入座开玩！

### 2. Android App 跨网加入
1. 打开手机 App，停留在 **「🎮 玩家加入」**；
2. 在 **「房主联机 IP 或云服务器地址」** 输入框中，填入你的服务器公网地址（如 `47.100.xx.xx:9527`）；
3. 若服务器设置了暗号，在下方的 **「私密进服暗号」** 填入；
4. 点击 **「🎮 加入房间」**，秒连云端服务器！

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

### 2. 自动化测试验证

```bash
# 执行全套算法、环境变量与网络鉴权测试
npm run test
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
构建产物将自动输出至项目根目录：`liars-bar.apk`。

---

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `9527` | 服务监听端口 |
| `SERVER_ACCESS_KEY` | *(空)* | 私密进服暗号（留空表示公开，填入后需暗号方可入场） |
| `IS_PUBLIC_CLOUD` | `false` | 标记是否为公网云端部署环境 |

---

## 📜 开源协议

本项目基于 [MIT](LICENSE) 协议开源。欢迎提交 Issue 与 Pull Request！
