/**
 * 骗子酒馆 - 服务器信息缓存 (ServerInfoCache.js)
 *
 * P0-0（MULTI_ROOM_PLAN.md v1.6）：广播热路径只允许 O(房间人数) 的纯内存操作。
 * getApkPath()（execSync 子进程）与 getLanIp()（网卡遍历 / 兜底子进程）严禁出现在
 * broadcastState / getPlayerState / Room.broadcast 中——单次 execSync 同步阻塞事件
 * 循环 8~105 ms（随宿主），是容量断崖的第一杀手。
 *
 * 因此：启动时计算一次并缓存；仅按 SERVER_INFO_REFRESH_MS 定时刷新；
 * 广播与 /api/server-info 一律只读 get() 快照。
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ServerInfoCache {
  constructor({ port, accessKey = '', refreshMs } = {}) {
    this.port = port;
    this.accessKey = accessKey || '';
    this.refreshMs = refreshMs || parseInt(process.env.SERVER_INFO_REFRESH_MS || '60000', 10);
    this.snapshot = null;
    this._timer = null;
    // 测试注入点：替换 execSync 实现，用于 spy 断言"广播 0 次 execSync"
    this._exec = execSync;
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
        const ipOut = this._exec('ip route 2>/dev/null || ifconfig 2>/dev/null', {
          encoding: 'utf8',
          timeout: 800,
          stdio: ['ignore', 'pipe', 'ignore']
        });
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
    // 1. Android 系统已安装 APK 路径 (通过 pm path 获取自身 base.apk)。
    //    仅 Android 平台尝试：Windows/Linux 上 pm 命令不存在，还会向控制台打印乱码报错。
    if (process.platform === 'android' || fs.existsSync('/system/bin/pm')) {
      try {
        const output = this._exec('pm path com.liarsbar.game', {
          encoding: 'utf8',
          timeout: 1500,
          stdio: ['ignore', 'pipe', 'ignore'] // 子进程 stderr 不进控制台
        });
        const match = output && output.match(/package:(.+)/);
        if (match && match[1]) {
          const candidate = match[1].trim();
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      } catch (_) {}
    }

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

  /**
   * 重建快照。唯一的重 IO 入口：只在启动 / 定时刷新时执行。
   * mode 字段语义说明：多房间下不存在"全服唯一模式"，固定返回 null（方案 1.1）。
   */
  refresh() {
    const lanIp = this.getLanIp();
    const lanUrl = `http://${lanIp}:${this.port}`;
    const apkPath = this.getApkPath();
    this.snapshot = {
      lanIp,
      port: this.port,
      lanUrl,
      mode: null,
      hasApk: Boolean(apkPath),
      apkPath,
      apkDownloadUrl: `${lanUrl}/download-apk`,
      requireAccessKey: Boolean(this.accessKey),
      isPublicCloud: process.env.IS_PUBLIC_CLOUD === 'true'
    };
    return this.snapshot;
  }

  /** 只读快照。广播热路径唯一允许的访问方式，零 IO。 */
  get() {
    if (!this.snapshot) this.refresh();
    return this.snapshot;
  }

  startAutoRefresh() {
    this.refresh();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      try {
        this.refresh();
      } catch (e) {
        console.warn('[ServerInfoCache] 刷新失败，保留旧快照:', e.message);
      }
    }, this.refreshMs);
    if (this._timer.unref) this._timer.unref();
  }

  stopAutoRefresh() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

module.exports = ServerInfoCache;
