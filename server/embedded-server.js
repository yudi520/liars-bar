/**
 * 骗子酒馆 (Liar's Bar) - 嵌入式独立服务器
 * HTTP 静态资源服务 + 原生 WebSocket 双向同步 + 局域网 WiFi/热点 IP 与二维码生成
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const RoomManager = require('./RoomManager');

let cordovaBridge = null;
try {
  cordovaBridge = require('cordova-bridge');
} catch (e) {
  // 本地 Node 运行模式下无需 cordova-bridge
}

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = output.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== process.pid.toString()) {
            try {
              execSync(`taskkill /F /PID ${pid}`);
            } catch (_) {}
          }
        }
      }
    }
  } catch (e) {}
}

class EmbeddedServer {
  constructor(port = parseInt(process.env.PORT || '9527', 10), accessKey = (process.env.SERVER_ACCESS_KEY || '').trim()) {
    this.port = port;
    this.accessKey = accessKey;
    this.httpServer = null;
    this.wsServer = null;
    this.room = new RoomManager(() => this.broadcastState());
    this.staticRoot = this.resolveStaticRoot();
    this.cachedQrCode = null;
    this.socketMap = new Map(); // ws -> socketId
  }

  resolveStaticRoot() {
    const candidates = [
      path.join(__dirname, '../dist'),
      path.join(__dirname, 'dist'),
      path.join(process.cwd(), 'dist'),
      path.join(__dirname, '../public')
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'index.html'))) {
        return c;
      }
    }
    return path.join(__dirname, '../dist');
  }

  getLanIp() {
    try {
      const interfaces = os.networkInterfaces();
      const addresses = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          const family = typeof iface.family === 'string'
            ? iface.family
            : iface.family === 4 ? 'IPv4' : '';
          if (!iface.internal && family === 'IPv4' && iface.address && iface.address !== '127.0.0.1') {
            addresses.push({ name, address: iface.address });
          }
        }
      }

      // 1. 优先在常见无线/热点网卡中寻找 192.168 / 10 / 172 私网 IP
      const wlanPrivate = addresses.find(a => 
        /wlan|ap|eth|en|wl|swlan|softap|rndis|p2p/i.test(a.name) &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a.address)
      );
      if (wlanPrivate) return wlanPrivate.address;

      // 2. 匹配任何 192.168.x.x 或 10.x.x.x 或 172.16~31.x.x
      const anyPrivate = addresses.find(a => 
        /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a.address)
      );
      if (anyPrivate) return anyPrivate.address;

      // 3. 任何非回环有效 IPv4
      if (addresses.length > 0) return addresses[0].address;

      // 4. Android 系统级命令兜底 (当 os.networkInterfaces() 受限时)
      try {
        const { execSync } = require('child_process');
        const ipOut = execSync('ip route 2>/dev/null || ifconfig 2>/dev/null', { encoding: 'utf8', timeout: 800 });
        const match = ipOut.match(/src\s+(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+)/);
        if (match && match[1]) return match[1];
        const matchAny = ipOut.match(/inet\s+(?:addr:)?(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+)/);
        if (matchAny && matchAny[1]) return matchAny[1];
      } catch (cmdErr) {}
    } catch (e) {
      console.warn('获取网络接口失败:', e);
    }
    return '127.0.0.1';
  }

  getApkPath() {
    // 1. Android 系统已安装 APK 路径 (通过 pm path 获取自身 base.apk)
    try {
      const output = execSync('pm path com.liarsbar.game', { encoding: 'utf8', timeout: 1500 });
      const match = output && output.match(/package:(.+)/);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch (_) {}

    // 2. 常见本地或开发路径兜底
    const candidates = [
      path.join(__dirname, '../liars-bar-debug.apk'),
      path.join(__dirname, '../liars-bar.apk'),
      path.join(__dirname, 'liars-bar-debug.apk'),
      path.join(__dirname, 'liars-bar.apk'),
      path.join(process.cwd(), 'liars-bar-debug.apk'),
      path.join(process.cwd(), 'liars-bar.apk'),
      '/sdcard/Download/liars-bar.apk',
      '/sdcard/Pictures/liars-bar.apk'
    ];

    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          return c;
        }
      } catch (_) {}
    }

    return null;
  }

  getServerInfo() {
    const lanIp = this.getLanIp();
    const lanUrl = `http://${lanIp}:${this.port}`;
    const apkPath = this.getApkPath();
    return {
      lanIp,
      port: this.port,
      lanUrl,
      mode: this.room.mode,
      hasApk: Boolean(apkPath),
      apkDownloadUrl: `${lanUrl}/download-apk`,
      requireAccessKey: Boolean(this.accessKey),
      isPublicCloud: process.env.IS_PUBLIC_CLOUD === 'true'
    };
  }

  savePoster(dataUrl) {
    try {
      if (!dataUrl) {
        return { success: false, error: '缺少图片数据' };
      }
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // 查找可写入的系统相机相册与公共图片目录 (优先 DCIM/Camera，手机相册主页秒出)
      const candidates = [
        '/sdcard/DCIM/Camera',
        '/sdcard/DCIM',
        '/sdcard/Pictures/Screenshots',
        '/sdcard/Pictures',
        '/sdcard/Download',
        path.join(os.homedir(), 'Pictures'),
        path.join(os.homedir(), 'Downloads'),
        path.join(__dirname, '../public')
      ];
      let targetDir = null;
      for (const d of candidates) {
        try {
          if (!fs.existsSync(d)) {
            fs.mkdirSync(d, { recursive: true });
          }
          targetDir = d;
          break;
        } catch (_) {}
      }
      if (!targetDir) {
        targetDir = os.tmpdir();
      }

      const now = new Date();
      const dateTag = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const fileName = `IMG_${dateTag}_骗子酒馆.png`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, buffer);

      // 额外也往 Pictures 目录备份一份
      try {
        if (targetDir.includes('DCIM') && fs.existsSync('/sdcard/Pictures')) {
          fs.writeFileSync(path.join('/sdcard/Pictures', fileName), buffer);
        }
      } catch (_) {}

      // 触发 Android MediaStore 数据库立即插入与系统扫描广播，使系统相册主页秒出该图片
      try {
        const { exec } = require('child_process');
        // 1. 直接插入系统媒体库数据库 (Android 10/11/12/13/14 现代通用)
        exec(`content insert --uri content://media/external/images/media --bind _data:s:"${filePath}" --bind mime_type:s:"image/png" --bind title:s:"${fileName}"`);
        // 2. 传统广播兜底
        exec(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${filePath}"`);
      } catch (_) {}

      console.log('[EmbeddedServer] 图片已成功保存至手机相册:', filePath);
      return { success: true, filePath, fileName, dir: targetDir };
    } catch (err) {
      console.error('[EmbeddedServer] 保存图片失败:', err);
      return { success: false, error: err.message };
    }
  }

  start() {
    freePort(this.port);

    this.httpServer = http.createServer((req, res) => {
      // 允许跨域
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/api/server-info') {
        const info = this.getServerInfo();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(info));
        return;
      }

      // APK 客户端直链下载路由 (提供给同伴极速免流下载独立 App)
      if (req.url === '/download-apk' || req.url === '/liars-bar.apk' || req.url === '/apk') {
        const apkPath = this.getApkPath();
        if (apkPath && fs.existsSync(apkPath)) {
          try {
            const stat = fs.statSync(apkPath);
            res.writeHead(200, {
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': 'attachment; filename="liars-bar.apk"',
              'Content-Length': stat.size,
              'Cache-Control': 'no-cache'
            });
            fs.createReadStream(apkPath).pipe(res);
            return;
          } catch (e) {
            console.error('[EmbeddedServer] 读取 APK 失败:', e);
          }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 未找到安装包文件');
        return;
      }

      if (req.url === '/api/save-poster' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { dataUrl } = JSON.parse(body || '{}');
            const result = this.savePoster(dataUrl);
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      this.serveStatic(req, res);
    });

    this.wsServer = new WebSocket.Server({ server: this.httpServer });

    this.wsServer.on('connection', (ws) => {
      const socketId = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      this.socketMap.set(ws, socketId);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleSocketMessage(ws, socketId, data);
        } catch (e) {
          console.error('解析 WS 消息错误:', e);
        }
      });

      ws.on('close', () => {
        this.room.disconnectPlayer(socketId);
        this.socketMap.delete(ws);
      });

      // 发送连接成功与初始状态 (直接带上 serverInfo 确保客户端无需额外 HTTP 请求即可获得局域网 IP)
      ws.send(JSON.stringify({
        type: 'INIT_CONNECTED',
        socketId,
        serverInfo: this.getServerInfo(),
        state: this.room.getPlayerState(socketId)
      }));
    });

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[EmbeddedServer] 端口 ${this.port} 已被占用，尝试使用端口 ${this.port + 1}...`);
        this.port += 1;
        this.start();
      } else {
        console.error('[EmbeddedServer] HTTP 服务启动失败:', err);
      }
    });

    this.httpServer.listen(this.port, '0.0.0.0', () => {
      const info = this.getServerInfo();
      console.log(`\n========================================`);
      console.log(`🍻 骗子酒馆 (Liar's Bar) 服务已就绪！`);
      console.log(`📡 本机访问: http://localhost:${this.port}`);
      console.log(`📱 手机局域网/WiFi直连: ${info.lanUrl}`);
      console.log(`========================================\n`);

      try {
        if (cordovaBridge && cordovaBridge.channel) {
          if (typeof cordovaBridge.channel.post === 'function') {
            cordovaBridge.channel.post('server-started', info);
          }
          if (typeof cordovaBridge.channel.send === 'function') {
            cordovaBridge.channel.send(JSON.stringify({
              type: 'SERVER_STARTED',
              url: info.lanUrl,
              ...info
            }));
          }
          console.log('[EmbeddedServer] 已成功通知 Cordova 客户端服务器就绪');
        }
      } catch (err) {
        console.warn('[EmbeddedServer] 通知 Cordova 前端失败:', err.message);
      }
    });
  }

  handleSocketMessage(ws, socketId, data) {
    const { type, payload = {} } = data;

    try {
      switch (type) {
        case 'JOIN_ROOM': {
          if (this.accessKey) {
            const clientKey = (payload.accessKey || '').trim();
            if (clientKey !== this.accessKey) {
              ws.send(JSON.stringify({
                type: 'UNAUTHORIZED_ACCESS_KEY',
                message: '该私密酒馆已设置进服暗号，请输入正确的进入密钥！'
              }));
              return;
            }
          }
          this.room.joinPlayer(socketId, payload);
          break;
        }
        case 'SWITCH_MODE': {
          this.room.switchMode(payload.mode);
          break;
        }
        case 'UPDATE_CONFIG': {
          this.room.updateConfig(payload);
          this.broadcastState();
          break;
        }
        case 'ADD_BOT': {
          this.room.addBot();
          break;
        }
        case 'REMOVE_PLAYER': {
          this.room.removePlayer(payload.playerId);
          break;
        }
        case 'START_GAME': {
          this.room.startGame();
          break;
        }
        case 'START_NEXT_HAND': {
          this.room.startNextHand();
          break;
        }
        case 'RESET_LOBBY': {
          this.room.resetToLobby();
          break;
        }
        case 'ACTION': {
          this.room.handleAction(socketId, payload.action, payload);
          break;
        }
        case 'CANCEL_ROOM': {
          this.room.cancelRoom(socketId);
          this.broadcastDisband();
          break;
        }
        case 'LEAVE_ROOM': {
          this.room.disconnectPlayer(socketId);
          break;
        }
        case 'SAVE_POSTER': {
          const resData = this.savePoster(payload.dataUrl);
          ws.send(JSON.stringify({ type: 'SAVE_POSTER_RESULT', payload: resData }));
          break;
        }
        case 'REQUEST_SWITCH_CANDIDATES': {
          const candidates = this.room.game.getSwitchCandidates(socketId);
          ws.send(JSON.stringify({
            type: 'SWITCH_CANDIDATES_RESPONSE',
            candidates
          }));
          break;
        }
        case 'SELECT_SWITCH_CHOICE': {
          const player = this.room.players.find(p => p.id === socketId);
          if (player) {
            if (payload.discardCardIndex !== undefined) {
              player.pendingDiscardIndex = payload.discardCardIndex;
            }
            if (payload.newCard !== undefined) {
              player.pendingNewCard = payload.newCard;
            }
          }
          break;
        }
        default:
          console.warn('未知消息类型:', type);
      }
    } catch (e) {
      ws.send(JSON.stringify({
        type: 'ERROR_NOTICE',
        message: e.message || '操作失败'
      }));
    }
  }

  broadcastState() {
    if (!this.wsServer) return;
    const serverInfo = this.getServerInfo();
    this.wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        const socketId = this.socketMap.get(client);
        if (socketId) {
          const state = this.room.getPlayerState(socketId);
          client.send(JSON.stringify({
            type: 'STATE_UPDATE',
            serverInfo,
            state
          }));
        }
      }
    });
  }

  broadcastDisband() {
    if (!this.wsServer) return;
    this.wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'ROOM_DISBANDED',
          message: '房主已取消/解散骗子酒馆房间，已退回大厅。'
        }));
      }
    });
  }

  serveStatic(req, res) {
    let safeUrl = req.url.split('?')[0];
    if (safeUrl === '/') safeUrl = '/index.html';
    const filePath = path.join(this.staticRoot, safeUrl);

    if (!fs.existsSync(filePath)) {
      const indexFile = path.join(this.staticRoot, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexFile).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 资源未找到');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  }

  stop() {
    try {
      if (this.wsServer) {
        this.wsServer.close();
      }
      if (this.httpServer) {
        this.httpServer.close();
      }
    } catch (_) {}
  }
}

// 直接运行启动
if (require.main === module) {
  const port = parseInt(process.env.PORT || '9527', 10);
  const accessKey = (process.env.SERVER_ACCESS_KEY || '').trim();
  const server = new EmbeddedServer(port, accessKey);
  server.start();

  process.on('SIGTERM', () => {
    console.log('[EmbeddedServer] 收到 SIGTERM 信号，平稳退出...');
    server.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('[EmbeddedServer] 收到 SIGINT 信号，退出中...');
    server.stop();
    process.exit(0);
  });
}

module.exports = EmbeddedServer;
