/**
 * 骗子酒馆 - 前端 WebSocket 双向通信驱动 (socketService.js)
 * 适配移动端嵌入式环境 (Cordova nodejs-mobile) 与外部浏览器多机局域网联机
 */

import { getWsBaseUrl, getServerBaseUrl, APP_PORT, getTargetHostIp, setTargetHostIp, getServerAccessKey, setServerAccessKey } from '../utils/env';

class SocketService {
  constructor() {
    this.ws = null;
    this.socketId = null;
    this.listeners = new Map();
    this.connected = false;
    this.serverInfo = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.pendingQueue = []; // 待发送消息队列，避免连接完成前消息被丢弃
  }

  setTargetHost(ip) {
    setTargetHostIp(ip);
  }

  getTargetHost() {
    return getTargetHostIp();
  }

  async connectToHost(hostIp) {
    this.setTargetHost(hostIp);
    this.disconnect();
    this.reconnectAttempts = 0;
    this.serverInfo = null;
    await this.fetchServerInfo();
    this.connect();
  }

  async probeHost(customIp = '') {
    const candidates = [];
    if (customIp && customIp.trim()) {
      candidates.push(customIp.trim());
    }

    const saved = getTargetHostIp();
    if (saved && !candidates.includes(saved)) {
      candidates.push(saved);
    }

    if (this.serverInfo?.lanIp && !candidates.includes(this.serverInfo.lanIp) && this.serverInfo.lanIp !== '127.0.0.1') {
      const parts = this.serverInfo.lanIp.split('.');
      if (parts.length === 4) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const myLast = parseInt(parts[3], 10);
        const probeList = [1, 100, 101, 110, 120, 2, 3, 4, 5];
        for (let offset = -5; offset <= 5; offset++) {
          const target = myLast + offset;
          if (target > 0 && target < 255 && !probeList.includes(target)) {
            probeList.push(target);
          }
        }
        for (const p of probeList) {
          const ip = `${prefix}.${p}`;
          if (!candidates.includes(ip)) candidates.push(ip);
        }
      }
    }

    const checkIp = async (ip) => {
      try {
        const res = await fetch(`http://${ip}:${APP_PORT}/api/server-info`, { signal: AbortSignal.timeout(900) });
        if (res.ok) {
          const info = await res.json();
          if (info && info.lanUrl) {
            return { ip, info };
          }
        }
      } catch (_) {}
      return null;
    };

    const results = await Promise.all(candidates.map(ip => checkIp(ip)));
    const found = results.find(r => r !== null);
    return found ? found.ip : null;
  }

  async fetchServerInfo() {
    const urls = [
      `${getServerBaseUrl()}/api/server-info`,
      `http://127.0.0.1:${APP_PORT}/api/server-info`,
      `http://localhost:${APP_PORT}/api/server-info`
    ];

    if (typeof window !== 'undefined' && window.location.hostname && !urls.some(u => u.includes(window.location.hostname))) {
      urls.push(`http://${window.location.hostname}:${APP_PORT}/api/server-info`);
    }

    for (const url of urls) {
      if (!url) continue;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
        if (res.ok) {
          const info = await res.json();
          if (info && (info.lanUrl || info.port)) {
            this.serverInfo = info;
            this.emit('server_info', info);
            return info;
          }
        }
      } catch (e) {
        // 继续尝试下一个可能地址
      }
    }

    const fallbackInfo = {
      lanIp: (typeof window !== 'undefined' && window.location.hostname) || '127.0.0.1',
      port: APP_PORT,
      lanUrl: `http://${(typeof window !== 'undefined' && window.location.hostname) || '127.0.0.1'}:${APP_PORT}`,
      mode: 'TEXAS_POKER'
    };
    return fallbackInfo;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const useIpFallback = (this.reconnectAttempts % 2) === 1;
    const wsUrl = getWsBaseUrl(useIpFallback);
    console.log('[SocketService] Connecting to:', wsUrl, `(attempt ${this.reconnectAttempts})`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[SocketService] WebSocket connected successfully to:', wsUrl);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connection_status', { connected: true });

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // 发送所有在连接建立前暂存的指令 (如 JOIN_ROOM, ADD_BOT 等)
        if (this.pendingQueue.length > 0) {
          const queue = [...this.pendingQueue];
          this.pendingQueue = [];
          for (const msg of queue) {
            try {
              this.ws.send(JSON.stringify(msg));
              console.log('[SocketService] 已补发暂存指令:', msg.type);
            } catch (e) {
              console.error('[SocketService] 补发暂存指令失败:', e);
            }
          }
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.serverInfo) {
            this.serverInfo = data.serverInfo;
            this.emit('server_info', data.serverInfo);
          }
          if (data.type === 'INIT_CONNECTED') {
            this.socketId = data.socketId;
            this.emit('init', data);
          } else if (data.type === 'STATE_UPDATE') {
            this.emit('state_update', data.state);
          } else if (data.type === 'SWITCH_CANDIDATES_RESPONSE') {
            this.emit('switch_candidates', data.candidates);
          } else if (data.type === 'ROOM_DISBANDED') {
            this.emit('room_disbanded', data.message);
          } else if (data.type === 'UNAUTHORIZED_ACCESS_KEY') {
            this.emit('unauthorized_access_key', data.message);
          } else if (data.type === 'ERROR_NOTICE') {
            this.emit('error_notice', data.message);
          } else if (data.type === 'SAVE_POSTER_RESULT') {
            this.emit('save_poster_result', data.payload);
          }
        } catch (e) {
          console.error('解析 WS 消息失败:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emit('connection_status', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WS 连接异常，准备重试...', err);
        try {
          this.ws.close();
        } catch (_) {}
      };
    } catch (e) {
      console.error('创建 WebSocket 实例失败:', e);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1000);
  }

  disconnect() {
    this.pendingQueue = [];
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
  }

  send(type, payload = {}) {
    if (type === 'JOIN_ROOM') {
      if (!payload.accessKey) {
        const key = getServerAccessKey();
        if (key) payload.accessKey = key;
      }
    }
    const msg = { type, payload };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log('[SocketService] WS 尚未就绪，指令暂存待发:', type);
      this.pendingQueue.push(msg);
      if (!this.connected) {
        this.connect();
      }
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event).filter(cb => cb !== callback);
    this.listeners.set(event, list);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`事件回调 ${event} 执行异常:`, e);
        }
      }
    }
  }
}

export const socketService = new SocketService();
export default socketService;
