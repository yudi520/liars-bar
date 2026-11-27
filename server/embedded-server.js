/**
 * 骗子酒馆 (Liar's Bar) - 嵌入式独立服务器
 *
 * 多房间改造（MULTI_ROOM_PLAN.md v1.6）：
 *  - 传输层：HTTP + WS（maxPayload 单帧上限），握手后创建 SocketSession；
 *  - 路由层：消息一律以服务端 socket -> roomId 映射为准，不接受客户端传的 roomId 越权（原则 2）；
 *  - 权限层：房主专属动作走集中白名单 + assertHost（7.1）；
 *  - 注册层：RoomRegistry 持有多房间（3.1），广播收敛到 Room.broadcast（原则 3）。
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { monitorEventLoopDelay } = require('perf_hooks');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const ServerInfoCache = require('./ServerInfoCache');
const { RoomRegistry, RoomError, createSocketSession } = require('./RoomRegistry');

let cordovaBridge = null;
try {
  cordovaBridge = require('cordova-bridge');
} catch (e) {
  // 本地 Node 运行模式下无需 cordova-bridge
}

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

function envBool(name, def) {
  if (process.env[name] == null) return def;
  return process.env[name] === 'true' || process.env[name] === '1';
}

const IS_PUBLIC_CLOUD = process.env.IS_PUBLIC_CLOUD === 'true';
// MULTI_ROOM_ENABLED：显式环境变量优先；缺省时公网开、APK/局域网关（6.5）
const MULTI_ROOM_ENABLED = process.env.MULTI_ROOM_ENABLED != null
  ? (process.env.MULTI_ROOM_ENABLED === 'true' || process.env.MULTI_ROOM_ENABLED === '1')
  : IS_PUBLIC_CLOUD;
// ALLOW_LEGACY_HOST_CLAIM：公网建议关闭（7.1 残留风险），默认非公网开启
const ALLOW_LEGACY_HOST_CLAIM = process.env.ALLOW_LEGACY_HOST_CLAIM != null
  ? (process.env.ALLOW_LEGACY_HOST_CLAIM === 'true' || process.env.ALLOW_LEGACY_HOST_CLAIM === '1')
  : !IS_PUBLIC_CLOUD;
const MAX_CONNECTIONS = envInt('MAX_CONNECTIONS', 2000);
const WS_MAX_PAYLOAD_BYTES = envInt('WS_MAX_PAYLOAD_BYTES', 65536);
const WS_HIGH_WATER_BYTES = envInt('WS_HIGH_WATER_BYTES', 1048576);
// P1-2 限流（7.4）：10 次/秒（突发 20），连续 3 次违规断开
const RATE_LIMIT_PER_SEC = envInt('RATE_LIMIT_PER_SEC', 10);
const RATE_LIMIT_BURST = envInt('RATE_LIMIT_BURST', 20);
// P1-3 压缩（6.3）：默认关闭；开启时压低 zlib 参数防内存失控
const PERMESSAGE_DEFLATE = envBool('PERMESSAGE_DEFLATE', false);
// P1-3 指标接口：默认关闭；开启后公网需配合 SERVER_ACCESS_KEY 鉴权（10.3）
const METRICS_ENABLED = envBool('METRICS_ENABLED', false);

/**
 * 房主专属动作集中白名单（7.1）。校验入口唯一：assertHost。
 * P1 新增：TRANSFER_HOST（移交）、REVOKE_SESSIONS（双路径：房主任意人 / 本人自己）。
 */
const HOST_ONLY_ACTIONS = new Set([
  'START_GAME',
  'START_NEXT_HAND',
  'RESET_LOBBY',
  'ADD_BOT',
  'REMOVE_PLAYER',
  'KICK_PLAYER',       // P0 新增（仅大厅）
  'UPDATE_CONFIG',
  'SWITCH_MODE',       // 仅大厅
  'CANCEL_ROOM',
  'TRANSFER_HOST'      // P1
]);

function freePort(port) {
  // 7.5：误杀风险收敛——仅非生产环境且显式 FORCE_FREE_PORT=1 时启用
  if (process.env.NODE_ENV === 'production' || process.env.FORCE_FREE_PORT !== '1') {
    return;
  }
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
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

function normalizeIp(raw) {
  if (!raw) return null;
  return String(raw).replace(/^::ffff:/, '').trim() || null;
}

class EmbeddedServer {
  constructor(port = parseInt(process.env.PORT || '9527', 10), accessKey = (process.env.SERVER_ACCESS_KEY || '').trim()) {
    this.port = port;
    this.accessKey = accessKey;
    this.httpServer = null;
    this.wsServer = null;
    this.staticRoot = this.resolveStaticRoot();
    this.cachedQrCode = null;

    // P0-0：serverInfo 缓存（广播热路径唯一允许的 serverInfo 来源）
    this.infoCache = new ServerInfoCache({ port: this.port, accessKey: this.accessKey });

    // 注册层：多房间容器
    this.registry = new RoomRegistry({
      info: this.infoCache,
      multiRoomEnabled: MULTI_ROOM_ENABLED,
      allowLegacyHostClaim: ALLOW_LEGACY_HOST_CLAIM
    });

    this.sessions = new Map();   // ws -> SocketSession
    this._parseErrorCount = 0;
    this._shuttingDown = false;

    // P1-3 指标：事件循环延迟直方图 + 消息计数
    this._elHistogram = null;
    this._msgCounters = { in: 0, out: 0, bytesOut: 0, lastSample: Date.now(), inPerSec: 0, outPerSec: 0, bytesOutPerSec: 0 };
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

  /** 兼容保留：返回缓存快照（test-server-env.js 依赖）。绝不在广播热路径调用。 */
  getServerInfo() {
    return this.infoCache.get();
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
        const quiet = { stdio: ['ignore', 'ignore', 'ignore'] };
        exec(`content insert --uri content://media/external/images/media --bind _data:s:"${filePath}" --bind mime_type:s:"image/png" --bind title:s:"${fileName}"`, quiet);
        exec(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${filePath}"`, quiet);
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
        // 读缓存（6.0）：HTTP 请求同样不 spawn 子进程
        const info = this.infoCache.get();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(info));
        return;
      }

      // P1-3 指标接口（10.3）：默认关闭；公网部署必须配合 SERVER_ACCESS_KEY 鉴权
      if (req.url.split('?')[0] === '/api/metrics') {
        if (!METRICS_ENABLED) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'metrics disabled (set METRICS_ENABLED=true)' }));
          return;
        }
        if (this.accessKey) {
          const url = new URL(req.url, 'http://localhost');
          if ((url.searchParams.get('key') || '').trim() !== this.accessKey) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'forbidden' }));
            return;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(this.collectMetrics()));
        return;
      }

      // APK 客户端直链下载路由 (提供给同伴极速免流下载独立 App)
      if (req.url === '/download-apk' || req.url === '/liars-bar.apk' || req.url === '/apk') {
        const apkPath = this.infoCache.get().apkPath;
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

    // 6.5/7.4：单帧上限，超限由 ws 直接断开（防恶意大帧拖垮进程）
    // P1-3 压缩：默认关闭；开启时压低 windowBits/memLevel（6.3 内存账）
    const wsOptions = { server: this.httpServer, maxPayload: WS_MAX_PAYLOAD_BYTES };
    if (PERMESSAGE_DEFLATE) {
      wsOptions.perMessageDeflate = {
        zlibDeflateOptions: { windowBits: 10, memLevel: 5 },
        threshold: 1024
      };
    }
    this.wsServer = new WebSocket.Server(wsOptions);
    // ws 8.x 会把 httpServer 的 error 转发到 WebSocketServer 上再次发出；
    // 必须挂处理器，否则端口占用重试时会出现未处理 'error' 事件导致进程崩溃。
    this.wsServer.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') return; // 由 httpServer 的 error 处理器负责重试
      console.error('[EmbeddedServer] WS 服务异常:', err);
    });

    this.wsServer.on('connection', (ws) => {
      // MAX_CONNECTIONS 保护（6.5）
      if (this.wsServer.clients.size > MAX_CONNECTIONS) {
        console.warn(`[EmbeddedServer] 连接数超上限(${MAX_CONNECTIONS})，拒绝新连接`);
        try {
          ws.close(1013, 'server_full');
        } catch (_) {}
        return;
      }

      const socketId = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const ip = normalizeIp(ws._socket && ws._socket.remoteAddress);
      const session = createSocketSession({ socketId, ip });
      this.sessions.set(ws, session);

      ws.on('message', (message) => {
        // P1-2 限流（7.4）：每连接令牌桶，超限回 RATE_LIMITED，连续 3 次违规断开
        if (!this._checkRateLimit(ws, session)) return;
        let data;
        try {
          data = JSON.parse(message);
        } catch (e) {
          // 7.4：JSON 解析失败丢帧计数，不回包（防放大）
          this._parseErrorCount += 1;
          if (this._parseErrorCount % 100 === 1) {
            console.warn(`[EmbeddedServer] WS 帧解析失败，累计 ${this._parseErrorCount} 次`);
          }
          return;
        }
        this._msgCounters.in += 1;
        try {
          this.handleSocketMessage(ws, session, data);
        } catch (e) {
          // 动作层兜底（10.1）：异常只影响本次请求
          console.error('[EmbeddedServer] 消息处理异常:', e);
          this.sendError(ws, e, data && data.payload && data.payload.requestId);
        }
      });

      ws.on('close', () => {
        const room = this.registry.getRoomBySession(session);
        if (room) {
          room.leave(ws, session);
        }
        this.sessions.delete(ws);
      });

      ws.on('error', () => {
        try { ws.terminate(); } catch (_) {}
      });

      // 发送连接成功信息。多房间下尚未入座，state 置 null（3.5 冻结契约）：
      // 旧前端 `if (data.state)` 可安全跳过，新前端在 ROOM_CREATED / STATE_UPDATE 后再渲染。
      ws.send(JSON.stringify({
        type: 'INIT_CONNECTED',
        socketId,
        serverInfo: this.infoCache.get(),
        state: null,
        multiRoomEnabled: MULTI_ROOM_ENABLED
      }));
    });

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[EmbeddedServer] 端口 ${this.port} 已被占用，尝试使用端口 ${this.port + 1}...`);
        this.port += 1;
        // 缓存快照里的 port/lanUrl 必须跟随实际端口，否则启动横幅与 cordova 通知都是旧地址
        this.infoCache.port = this.port;
        this.infoCache.snapshot = null;
        this.start();
      } else {
        console.error('[EmbeddedServer] HTTP 服务启动失败:', err);
      }
    });

    this.infoCache.startAutoRefresh();

    // P1-3：事件循环延迟监控（卡顿第一指标，> 100ms 告警）
    try {
      this._elHistogram = monitorEventLoopDelay({ resolution: 20 });
      this._elHistogram.enable();
      this._elHistogramResetAt = Date.now();
      // 启动阶段的延迟样本是垃圾数据（进程冷启动），监听就绪后重置一次
      setTimeout(() => {
        try {
          if (this._elHistogram) this._elHistogram.reset();
          this._elHistogramResetAt = Date.now();
        } catch (_) {}
      }, 1000).unref?.();
    } catch (_) {}

    // P1-3：每 5 秒采样一次消息速率
    this._metricsTimer = setInterval(() => {
      try { this._sampleMetrics(); } catch (_) {}
    }, 5000);
    if (this._metricsTimer.unref) this._metricsTimer.unref();

    this.httpServer.listen(this.port, '0.0.0.0', () => {
      const info = this.infoCache.get();
      console.log(`\n========================================`);
      console.log(`🍻 骗子酒馆 (Liar's Bar) 服务已就绪！`);
      console.log(`📡 本机访问: http://localhost:${this.port}`);
      console.log(`📱 手机局域网/WiFi直连: ${info.lanUrl}`);
      console.log(`🏠 多房间: ${MULTI_ROOM_ENABLED ? '开启' : '关闭（单间 MAIN 模式）'}`);
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

  // ================================================================ 消息路由

  sendTo(ws, msg) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const bytes = JSON.stringify(msg);
        this._msgCounters.out += 1;
        this._msgCounters.bytesOut += bytes.length;
        this.registry.recordBytesOut(bytes.length);
        ws.send(bytes);
      }
    } catch (_) {}
  }

  /** P1-2 限流（7.4）：返回 true 表示放行。 */
  _checkRateLimit(ws, session) {
    const now = Date.now();
    const r = session.rate;
    const elapsed = (now - r.lastRefill) / 1000;
    r.tokens = Math.min(RATE_LIMIT_BURST, r.tokens + elapsed * RATE_LIMIT_PER_SEC);
    r.lastRefill = now;
    if (r.tokens < 1) {
      r.violations += 1;
      this.registry.counters.rate_limit_hits += 1;
      if (r.violations >= 3) {
        console.warn(`[EmbeddedServer] 限流违规 3 次，断开连接: ${session.socketId}`);
        try { ws.terminate(); } catch (_) {}
        return false;
      }
      this.sendError(ws, new RoomError('RATE_LIMITED', '操作太快了，请慢一点！'));
      return false;
    }
    r.tokens -= 1;
    return true;
  }

  sendError(ws, err, requestId) {
    const code = err instanceof RoomError ? err.code : 'INVALID_ACTION';
    const message = err && err.message ? err.message : '操作失败';
    // 过渡期兼容双发（4.3）：旧前端只监听 ERROR_NOTICE / UNAUTHORIZED_ACCESS_KEY
    if (code === 'UNAUTHORIZED_ACCESS_KEY') {
      this.sendTo(ws, { type: 'UNAUTHORIZED_ACCESS_KEY', message });
    } else {
      this.sendTo(ws, { type: 'ERROR_NOTICE', message });
    }
    this.sendTo(ws, { type: 'ERROR', payload: { code, message, requestId: requestId || null } });
  }

  checkAccessKey(payload) {
    if (!this.accessKey) return;
    const clientKey = String(payload.accessKey || '').trim();
    if (clientKey !== this.accessKey) {
      throw new RoomError('UNAUTHORIZED_ACCESS_KEY', '该私密酒馆已设置进服暗号，请输入正确的进入密钥！');
    }
  }

  /** 成员资格校验（原则 2）：一律以服务端 socket -> roomId 映射为准。 */
  requireRoom(session) {
    const room = this.registry.getRoomBySession(session);
    if (!room) {
      throw new RoomError('NOT_IN_ROOM', '当前未入座任何房间，请先创建或加入房间！');
    }
    room.touch();
    return room;
  }

  /** 房主权限校验唯一入口（7.1）。 */
  assertHost(session, room) {
    if (!room || room.hostId === null || session.playerId !== room.hostId) {
      throw new RoomError('NOT_HOST', '只有房主可以执行该操作！');
    }
  }

  applyHostAction(room, type, payload, session) {
    const manager = room.manager;
    switch (type) {
      case 'SWITCH_MODE':
        manager.switchMode(payload.mode);
        break;
      case 'UPDATE_CONFIG':
        // manager 内部已广播；Room.scheduleBroadcast 合并去重（1.2 #9：不再二次广播）
        manager.updateConfig(payload);
        break;
      case 'ADD_BOT':
        manager.addBot();
        break;
      case 'REMOVE_PLAYER': {
        // 统一走 room.kick（v1.6 4.1"内部复用同一移除实现"）：
        // bot → 座位层移除；真人 → 移除席位 + KICKED 通知 + 断开。
        // 必须通知被移除的真人客户端，否则其"自愈入座"会立刻把人加回来（踢人死循环）。
        room.kick(payload.playerId);
        break;
      }
      case 'START_GAME':
        manager.startGame();
        break;
      case 'START_NEXT_HAND':
        manager.startNextHand();
        break;
      case 'RESET_LOBBY':
        manager.resetToLobby();
        break;
      case 'KICK_PLAYER':
        room.kick(payload.playerId);
        break;
      case 'TRANSFER_HOST':
        room.transferHost(payload.playerId);
        break;
      case 'CANCEL_ROOM':
        room.close('host_disband');
        break;
      default:
        throw new RoomError('INVALID_ACTION', `未知房主操作: ${type}`);
    }
  }

  handleSocketMessage(ws, session, data) {
    const type = data && data.type;
    const payload = (data && data.payload) || {};

    // 动作层异常隔离（10.1）：每个消息处理包 try/catch，异常只影响本请求，返回 ERROR
    try {
      this.dispatchSocketMessage(ws, session, type, payload);
    } catch (e) {
      this.sendError(ws, e, payload.requestId);
    }
  }

  dispatchSocketMessage(ws, session, type, payload) {
    switch (type) {
      // ---------------- 房间入口（P0-2） ----------------
      case 'CREATE_ROOM': {
        this.checkAccessKey(payload);
        const room = this.registry.createRoom(ws, session, payload);
        this.sendTo(ws, {
          type: 'ROOM_CREATED',
          payload: {
            roomId: room.id,
            hostToken: session.hostToken,
            resumeToken: session.resumeToken,   // P1-2：断线重连凭证
            state: room.buildState(session)
          }
        });
        break;
      }
      case 'JOIN_ROOM': {
        this.checkAccessKey(payload);
        const room = this.registry.joinRoom(ws, session, payload);
        // 入座结果经 STATE_UPDATE 广播；另发 SEAT_TOKEN 携带重连凭证（P1-2）
        this.sendTo(ws, {
          type: 'SEAT_TOKEN',
          payload: { roomId: room.id, playerId: session.playerId, resumeToken: session.resumeToken }
        });
        break;
      }
      case 'QUICK_JOIN': {
        this.checkAccessKey(payload);
        const room = this.registry.quickJoin(ws, session, payload);
        if (room._createdByQuickJoin) {
          room._createdByQuickJoin = false;
          this.sendTo(ws, {
            type: 'ROOM_CREATED',
            payload: {
              roomId: room.id,
              hostToken: session.hostToken,
              resumeToken: session.resumeToken,
              state: room.buildState(session)
            }
          });
        } else {
          this.sendTo(ws, {
            type: 'SEAT_TOKEN',
            payload: { roomId: room.id, playerId: session.playerId, resumeToken: session.resumeToken }
          });
        }
        break;
      }
      case 'CLIENT_HELLO': {
        // P1 能力握手（4.5）：新客户端拿稳定 ID 原样输出，未声明的按旧协议投影
        if (payload && (payload.version === '1.1' || payload.version === 1.1)) {
          session.legacy = false;
        }
        break;
      }
      case 'RESUME_SESSION': {
        // P1-2 断线重连（7.2.1）：先幂等、后判重放；重放只拒本次
        const result = this.registry.resumeSession(ws, session, payload);
        this.sendTo(ws, result);
        break;
      }
      case 'REVOKE_SESSIONS': {
        // P1 双路径（7.1）：房主可撤销本房任意人；本人仅可撤销自己
        const result = this.registry.revokeSessions(session, payload.targetPlayerId);
        this.sendTo(ws, { type: 'SESSIONS_REVOKED', payload: { playerId: payload.targetPlayerId || session.playerId, kicked: result.kicked } });
        break;
      }
      case 'LEAVE_ROOM': {
        const room = this.registry.getRoomBySession(session);
        if (!room) {
          throw new RoomError('NOT_IN_ROOM', '当前未入座任何房间。');
        }
        room.leave(ws, session);
        break;
      }

      // ---------------- 房主专属（集中白名单 7.1） ----------------
      case 'SAVE_POSTER': {
        const resData = this.savePoster(payload.dataUrl);
        this.sendTo(ws, { type: 'SAVE_POSTER_RESULT', payload: resData });
        break;
      }

      // ---------------- 房内交互 ----------------
      case 'ACTION': {
        const room = this.requireRoom(session);
        room.manager.handleAction(session.playerId, payload.action, payload);
        break;
      }
      case 'REQUEST_SWITCH_CANDIDATES': {
        const room = this.requireRoom(session);
        const candidates = room.manager.game.getSwitchCandidates(session.playerId);
        this.sendTo(ws, { type: 'SWITCH_CANDIDATES_RESPONSE', candidates });
        break;
      }
      case 'SELECT_SWITCH_CHOICE': {
        const room = this.requireRoom(session);
        const player = room.manager.players.find(p => p.id === session.playerId);
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

      default: {
        if (HOST_ONLY_ACTIONS.has(type)) {
          const room = this.requireRoom(session);
          this.assertHost(session, room);
          this.applyHostAction(room, type, payload, session);
          break;
        }
        console.warn('未知消息类型:', type);
      }
    }
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

  // ================================================================ P1-3 指标（10.3）

  _sampleMetrics() {
    const c = this._msgCounters;
    const now = Date.now();
    const span = Math.max(1, (now - c.lastSample) / 1000);
    c.inPerSec = Math.round((c.in - (c._lastIn || 0)) / span);
    c.outPerSec = Math.round((c.out - (c._lastOut || 0)) / span);
    c._lastIn = c.in;
    c._lastOut = c.out;
    c.lastSample = now;
  }

  collectMetrics() {
    const rooms = [...this.registry.rooms.values()];
    const byStatus = {};
    for (const r of rooms) {
      const st = r.getStatus();
      byStatus[st] = (byStatus[st] || 0) + 1;
    }
    const el = this._elHistogram;
    let elP99 = 0;
    if (el) {
      // percentile(99) 返回纳秒 → 换算毫秒（1ms = 1e6 ns）
      elP99 = Math.round(el.percentile(99) / 1e6);
      if (Date.now() - this._elHistogramResetAt >= 60000) {
        el.reset();
        this._elHistogramResetAt = Date.now();
      }
    }
    const mem = process.memoryUsage();
    return {
      uptime_s: Math.round(process.uptime()),
      rooms_active: rooms.length,
      rooms_by_status: byStatus,
      room_codes: rooms.map(r => ({ id: r.id, status: r.getStatus(), players: r.manager ? r.manager.players.map(p => p.name + '/' + (p.connected ? '在' : '离')) : [] })),
      ws_connections: this.wsServer ? this.wsServer.clients.size : 0,
      msgs_in_per_sec: this._msgCounters.inPerSec,
      msgs_out_per_sec: this._msgCounters.outPerSec,
      bytes_out_per_sec: this.registry.bytesOutPerSec(),
      broadcast_duration_ms: this.registry.broadcastMsPercentiles(),
      event_loop_delay_ms_p99: elP99,
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 10) / 100,
      rss_mb: Math.round(mem.rss / 1024 / 10) / 100,
      counters: { ...this.registry.counters },
      multi_room_enabled: MULTI_ROOM_ENABLED,
      permessage_deflate: PERMESSAGE_DEFLATE
    };
  }

  // ================================================================ 停机

  /**
   * 优雅停机（10.2）：停止接受新连接 → 广播 SERVER_SHUTDOWN → 3 秒排空 → 退出。
   * 重启后所有房间消失（5.5 明确不支持恢复），客户端重连收到 ROOM_NOT_FOUND 回大厅。
   */
  shutdown(reason = 'maintenance') {
    if (this._shuttingDown) return;
    this._shuttingDown = true;
    console.log('[EmbeddedServer] 开始优雅停机，通知所有房间...');
    for (const room of this.registry.rooms.values()) {
      if (room.closed) continue;
      for (const ws of room.sockets) {
        this.sendTo(ws, { type: 'SERVER_SHUTDOWN', payload: { roomId: room.id, reason } });
      }
    }
    setTimeout(() => {
      try {
        this.registry.stop();
      } catch (_) {}
      this.stop();
      process.exit(0);
    }, 3000);
  }

  stop() {
    try {
      this.infoCache.stopAutoRefresh();
      this.registry.stop();
    } catch (_) {}
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
    server.shutdown('sigterm');
  });
  process.on('SIGINT', () => {
    console.log('[EmbeddedServer] 收到 SIGINT 信号，退出中...');
    server.shutdown('sigint');
  });
  // 10.1 进程层：记录 + 优雅退出，由 supervisor / Docker restart policy 拉起新进程
  process.on('uncaughtException', (err) => {
    console.error('[EmbeddedServer] uncaughtException，优雅退出:', err);
    server.shutdown('uncaught_exception');
  });
  process.on('unhandledRejection', (err) => {
    console.error('[EmbeddedServer] unhandledRejection，优雅退出:', err);
    server.shutdown('unhandled_rejection');
  });
}

module.exports = EmbeddedServer;
