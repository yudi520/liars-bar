const EmbeddedServer = require('../server/embedded-server.js');

process.env.PORT = '9530';
process.env.SERVER_ACCESS_KEY = 'test_secret_key';
process.env.IS_PUBLIC_CLOUD = 'true';

const server = new EmbeddedServer();
console.log('Server Port:', server.port);
console.log('Server AccessKey:', server.accessKey);
const info = server.getServerInfo();
console.log('Server Info:', info);

if (server.port === 9530 && server.accessKey === 'test_secret_key' && info.requireAccessKey === true) {
  console.log('✅ EmbeddedServer environment test passed!');
  process.exit(0);
} else {
  console.error('❌ EmbeddedServer environment test failed!');
  process.exit(1);
}
