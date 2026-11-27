# 骗子酒馆 (Liar's Bar) - Docker 互联网部署与自建指南

本项目支持**双重联机模式**：
1. **手机局域网免流模式**：Android App 内置独立 Node.js 服务，面对面扫码或热点直连，零外网流量。
2. **公网云服务器 Docker 模式**：一键部署到任意 Linux / 云服务器，全球玩家（免安装 App，手机/电脑浏览器直接打开）即可在线联机！

---

## 快速开始（一键 Docker 部署）

### 方式 A：Docker 命令行直接运行（最快捷）

在服务器项目根目录下执行：

```bash
# 1. 构建镜像
docker build -t liars-bar .

# 2. 启动服务 (映射 9527 端口)
docker run -d \
  --name liars-bar-game \
  --restart unless-stopped \
  -p 9527:9527 \
  liars-bar
```

---

### 方式 B：Docker Compose 编排启动（推荐生产使用）

```bash
# 1. 复制配置文件
cp .env.example .env

# 2. 根据需要修改 .env (例如设置私密暗号 SERVER_ACCESS_KEY)
# vim .env

# 3. 启动容器
docker-compose up -d --build
```

查看日志与运行状态：
```bash
docker-compose logs -f
```

停止服务：
```bash
docker-compose down
```

---

## 互联网朋友如何加入游戏？

服务器启动后（请确保云服务器安全组已放行 **TCP 9527** 端口）：

### 1. 方式一：手机/电脑浏览器免安装直连（推荐）
异地朋友无需下载任何 APK，在手机或电脑浏览器中直接打开：
```
http://<你的公网IP或域名>:9527
```
即可直接进入酒馆界面，支持全屏横屏对决！

### 2. 方式二：Android App 跨公网联机
已安装 App 的玩家：
1. 打开手机 App；
2. 在首页“🎮 加入房间”选项卡下方的“**房主联机 IP 或云服务器地址**”中，输入你的公网服务器地址（例如：`47.100.50.20:9527` 或 `game.yourdomain.com:9527`）；
3. 点击“加入房间”，即可跨互联网连入服务器！

---

## 防蹭服与安全保护机制

若您不想让外部陌生人随意进入您的服务器消耗带宽，您可以使用**私密暗号保护**：

### 1. 启用密钥
启动 Docker 时传入环境变量 `SERVER_ACCESS_KEY`：

```bash
docker run -d \
  --name liars-bar-game \
  --restart unless-stopped \
  -p 9527:9527 \
  -e SERVER_ACCESS_KEY="liars2026" \
  liars-bar
```
或在 `.env` 文件中设置：
```env
SERVER_ACCESS_KEY=liars2026
```

### 2. 客户端进入
- 玩家加入房间时，在“**私密进服暗号**”输入框填入对应的暗号即可顺利入场。
- 未提供暗号或暗号错误的陌生连接会被直接拦截，无法占用席位与资源。

---

## Nginx 反向代理与 HTTPS / WSS 域名配置（可选）

如果您绑定了域名并配置了 SSL 证书，可使用以下 Nginx 配置实现 `https://` 与 `wss://` 支持：

```nginx
server {
    listen 80;
    server_name game.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name game.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/game.crt;
    ssl_certificate_key /etc/nginx/ssl/game.key;

    location / {
        proxy_pass http://127.0.0.1:9527;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
配置完成后，玩家直接访问 `https://game.yourdomain.com` 即可畅玩！

---

## 多房间与 P1 功能部署说明（v1.6 规格实现后）

### 默认行为（无需任何配置）

云服务器部署（`IS_PUBLIC_CLOUD=true`）时，以下能力**自动开启**：

- **多房间**：房主建房获得 5 位房间码，朋友输码入座（也可扫码/分享链接 `?room=房间码` 直达）；
- **房主鉴权**：服务端签发凭证，抓包自报房主无效；旧 APK 自动进 MAIN 房正常游戏；
- **房间密码**：房主建房时在界面上自行设置（每个房间独立，无需服务器配置）；
- **断线恢复**：对局中断线重连保留席位与手牌（同 IP 直连恢复）；
- **限流与防护**：单连接 10 次/秒限流、64KB 单帧上限、旧客户端抢房防护。

### 可选环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `MAX_ROOMS` | 500 | 全服房间数上限 |
| `MAX_ROOMS_PER_IP` | 20 | 单 IP 建房上限（防滥用） |
| `ROOM_EMPTY_TTL_MS` | 1800000 | 空房回收时间 |
| `ALLOW_LEGACY_HOST_CLAIM` | false（公网） | 允许旧 APK 在 MAIN 房自报房主 |
| `HOST_RESUME_SAME_IP_ONLY` | true（公网） | 房主换网络后需重新入座 |
| `RATE_LIMIT_PER_SEC` | 10 | 单连接消息速率 |
| `METRICS_ENABLED` | false | 开启 `/api/metrics` 指标接口 |

### 运维要点

1. **房间不持久化**：容器重启 = 所有房间消失（玩家会收到"房间已不存在"提示并自动回大厅），这是设计行为；`restart: unless-stopped` 只保证服务拉起，不恢复对局；
2. **指标监控**：`.env` 设 `METRICS_ENABLED=true` 后，访问 `http://服务器:9527/api/metrics?key=<SERVER_ACCESS_KEY>` 可查看房间数、连接数、事件循环延迟 p99（>100ms 告警线）、广播耗时、RSS 与安全计数（重放/限流/慢客户端）；
3. **玩家重连风暴**：容器重启后所有客户端自动指数退避重连（1s→2s→4s…上限 30s），无需人工干预；
4. **Android APK 双模式**：APK 内嵌服务默认单房间（一台手机一张桌），不影响其作为客户端连入多房间云服务器。
