/**
 * 骗子酒馆 (Liar's Bar) - Cordova Node.js 嵌入式后台启动器
 */
window.__LIARSBAR_EMBEDDED_RUNTIME__ = true;
window.__RPS_EMBEDDED_RUNTIME__ = true;
window.nodejsStarting = false;
window.nodejsReady = false;
window.nodejsServerReady = false;
window.nodejsServerInfo = null;
window.nodejsLastError = null;
window.nodejsLastErrorMessage = '';

function startNodeMobile() {
  if (window.nodejsStarting || window.nodejsReady) {
    return true;
  }

  let nodePlugin = (typeof nodejs !== 'undefined') ? nodejs : null;
  if (!nodePlugin && window.cordova && typeof window.cordova.require === 'function') {
    try {
      nodePlugin = window.cordova.require('nodejs-mobile-cordova.nodejs');
      if (nodePlugin) {
        window.nodejs = nodePlugin;
      }
    } catch (e) {
      // not yet ready in moduleMap
    }
  }
  if (!nodePlugin && window.cordova && window.cordova.plugins && window.cordova.plugins.NodeJS) {
    nodePlugin = window.cordova.plugins.NodeJS;
  }

  if (!nodePlugin) {
    console.warn('[LiarsBar Mobile] nodejs-mobile plugin not yet available, will retry...');
    return false;
  }

  window.nodejsStarting = true;
  window.nodejsServerReady = false;
  window.nodejsLastError = null;
  window.nodejsLastErrorMessage = '';

  if (nodePlugin.channel && typeof nodePlugin.channel.on === 'function') {
    nodePlugin.channel.on('server-started', function(msg) {
      console.log('[LiarsBar Mobile] Embedded server reported ready:', msg);
      window.nodejsServerReady = true;
      window.nodejsServerInfo = msg;
      document.dispatchEvent(new CustomEvent('nodejs-server-ready', { detail: msg }));
    });
  }

  console.log('[LiarsBar Mobile] Starting Node.js with main.js...');
  nodePlugin.start('main.js', function(err) {
    window.nodejsStarting = false;
    if (err) {
      window.nodejsLastError = err;
      window.nodejsLastErrorMessage = (err && err.message) ? err.message : String(err);
      console.error('[LiarsBar Mobile] Failed to start Node.js:', err);
      document.dispatchEvent(new CustomEvent('nodejs-error', { detail: { message: window.nodejsLastErrorMessage } }));
      return;
    }
    window.nodejsReady = true;
    window.nodejsLastError = null;
    window.nodejsLastErrorMessage = '';
    document.dispatchEvent(new CustomEvent('nodejs-ready'));
    console.log('[LiarsBar Mobile] Node.js server started');
  }, { redirectOutputToLogcat: true });

  return true;
}

function tryStartNodeMobile(retries) {
  if (startNodeMobile()) return;
  if (retries > 0) {
    setTimeout(function() {
      tryStartNodeMobile(retries - 1);
    }, 400);
  }
}

document.addEventListener('deviceready', function() {
  console.log('[LiarsBar Mobile] deviceready triggered');
  tryStartNodeMobile(15);
}, false);

// 备选机制：若 deviceready 延迟或在已加载环境中
setTimeout(function() {
  if (!window.nodejsReady && !window.nodejsStarting) {
    tryStartNodeMobile(10);
  }
}, 800);
