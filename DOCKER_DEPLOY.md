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
