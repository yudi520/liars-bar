/**
 * 骗子酒馆 - 本地多人对战联调脚本 (test-tabs.js)
 * 自动检测 9527 端口服务，并呼出双人对决测试浏览器标签页
 */
const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

console.log('========================================');
console.log('🍻 正在启动骗子酒馆多人联调环境...');
console.log('========================================');

function checkAndStart() {
  const req = http.get('http://127.0.0.1:9527', (res) => {
    console.log('✅ 检测到 9527 服务已在后台就绪！');
    openBrowsers();
  });

  req.on('error', () => {
    console.log('🚀 正在启动酒馆核心服务器 (端口 9527)...');
    const serverScript = path.join(__dirname, 'server', 'embedded-server.js');
    const srv = spawn('node', [serverScript], {
      cwd: __dirname,
      detached: false,
      stdio: 'inherit'
    });
    setTimeout(() => {
      openBrowsers();
    }, 1800);
  });
}

function openBrowsers() {
  const hostUrl = 'http://localhost:9527/?tab=host';
  const playerUrl = 'http://localhost:9527/';
  console.log(`🌐 正在打开房主窗口: ${hostUrl}`);
  exec(`start ${hostUrl}`);
  setTimeout(() => {
    console.log(`🌐 正在打开玩家窗口: ${playerUrl}`);
    exec(`start ${playerUrl}`);
  }, 1000);
}

checkAndStart();
