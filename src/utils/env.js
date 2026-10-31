/**
 * 骗子酒馆 (Liar's Bar) - 运行环境与服务器地址自动检测工具
 * 默认非传统高位端口: 9527
 */

export const APP_PORT = 9527;

export function getTargetHostIp() {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('target_host_ip') || '').trim();
  }
  return '';
}

export function setTargetHostIp(ip) {
  if (typeof window !== 'undefined') {
    if (ip && ip.trim()) {
      localStorage.setItem('target_host_ip', ip.trim());
    } else {
      localStorage.removeItem('target_host_ip');
    }
  }
}

export function getServerAccessKey() {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('server_access_key') || '').trim();
  }
  return '';
}

export function setServerAccessKey(key) {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem('server_access_key', key.trim());
    } else {
      localStorage.removeItem('server_access_key');
    }
  }
}

export function parseTargetHost(rawTarget) {
  if (!rawTarget) return { host: '', port: APP_PORT };
  let cleaned = rawTarget.trim().replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '');
  if (!cleaned) return { host: '', port: APP_PORT };
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    return { host: parts[0], port: parseInt(parts[1], 10) || APP_PORT };
  }
  return { host: cleaned, port: APP_PORT };
}

export function isEmbeddedRuntime() {
  if (typeof window === 'undefined') return false;

  // 1. 显式标记或 Cordova/Node 插件存在
  if (window.__LIARSBAR_EMBEDDED_RUNTIME__ || window.cordova || window.nodejs) {
    return true;
  }

  const loc = window.location;
  if (!loc) return false;

  // 2. 本地文件协议
  if (loc.protocol === 'file:') return true;

  // 3. Cordova Android 内部 WebView (https://localhost 或 http://localhost，无自定义端口)
  if (
    (loc.protocol === 'https:' || loc.protocol === 'http:') &&
    (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') &&
    (!loc.port || loc.port === '80' || loc.port === '443')
  ) {
    return true;
  }

  return false;
}

export function getServerBaseUrl() {
  const targetIp = getTargetHostIp();
  if (targetIp) {
    const { host, port } = parseTargetHost(targetIp);
    return `http://${host}:${port}`;
  }
  if (isEmbeddedRuntime() || (typeof window !== 'undefined' && window.location.port === '5173')) {
    return `http://127.0.0.1:${APP_PORT}`;
  }
  return '';
}

export function getWsBaseUrl(useIpFallback = false) {
  const targetIp = getTargetHostIp();
  if (targetIp) {
    const { host, port } = parseTargetHost(targetIp);
    return `ws://${host}:${port}`;
  }
  if (isEmbeddedRuntime()) {
    // 关键优化：在 Android WebView 中，localhost 会解析为 IPv6 (::1)，导致连接失败；127.0.0.1 具备极高稳定性
    return `ws://127.0.0.1:${APP_PORT}`;
  }
  if (typeof window !== 'undefined') {
    const isDev = window.location.port === '5173';
    const host = isDev ? `${window.location.hostname}:${APP_PORT}` : window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${host}`;
  }
  return `ws://127.0.0.1:${APP_PORT}`;
}
