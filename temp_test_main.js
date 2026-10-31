const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'main_debug.txt');
function log(msg) {
  try { fs.appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + msg + '\n'); } catch(e){}
}
log('main.js top-level reached');
try {
  log('requiring embedded-server.js');
  const EmbeddedServer = require('./embedded-server.js');
  log('creating server instance');
  const server = new EmbeddedServer(9527);
  log('starting server');
  server.start();
  log('server.start() finished');
} catch (err) {
  log('ERROR: ' + (err && err.stack ? err.stack : err));
}
