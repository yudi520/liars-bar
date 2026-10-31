const WebSocket = require('ws');
const EmbeddedServer = require('../server/embedded-server.js');

async function runAuthTest() {
  process.env.PORT = '9531';
  process.env.SERVER_ACCESS_KEY = 'super_secret_123';
  
  const server = new EmbeddedServer(9531, 'super_secret_123');
  server.start();

  await new Promise(r => setTimeout(r, 600));

  console.log('Testing WebSocket connection to ws://127.0.0.1:9531...');

  // 1. Test wrong access key
  const ws1 = new WebSocket('ws://127.0.0.1:9531');
  let rejected = false;

  await new Promise((resolve) => {
    ws1.on('open', () => {
      ws1.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          name: 'Hacker',
          avatar: '🤠',
          isHost: false,
          accessKey: 'wrong_key'
        }
      }));
    });

    ws1.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.type === 'UNAUTHORIZED_ACCESS_KEY') {
        console.log('✅ Correctly rejected invalid access key:', data.message);
        rejected = true;
        ws1.close();
        resolve();
      }
    });
  });

  if (!rejected) {
    console.error('❌ Failed: Wrong access key was not rejected!');
    server.stop();
    process.exit(1);
  }

  // 2. Test correct access key
  const ws2 = new WebSocket('ws://127.0.0.1:9531');
  let accepted = false;

  await new Promise((resolve) => {
    ws2.on('open', () => {
      ws2.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          name: 'LegitPlayer',
          avatar: '👑',
          isHost: true,
          accessKey: 'super_secret_123'
        }
      }));
    });

    ws2.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.type === 'STATE_UPDATE') {
        const player = data.state?.players?.find(p => p.name === 'LegitPlayer');
        if (player) {
          console.log('✅ Correctly accepted valid access key, player joined!');
          accepted = true;
          ws2.close();
          resolve();
        }
      }
    });
  });

  server.stop();

  if (accepted) {
    console.log('🎉 All server auth tests passed successfully!');
    process.exit(0);
  } else {
    console.error('❌ Failed: Valid access key did not join room!');
    process.exit(1);
  }
}

runAuthTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
