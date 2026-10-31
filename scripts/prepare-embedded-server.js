const fs = require('fs');
const path = require('path');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function prepareEmbeddedServer(projectRoot, cordovaRoot) {
  const wwwDir = path.join(cordovaRoot, 'www');
  const nodeProjDir = path.join(wwwDir, 'nodejs-project');
  const serverDir = path.join(projectRoot, 'server');
  const distDir = path.join(projectRoot, 'dist');
  const nodeModulesDir = path.join(projectRoot, 'node_modules');

  // 1. Recreate nodejs-project directory
  if (fs.existsSync(nodeProjDir)) {
    fs.rmSync(nodeProjDir, { recursive: true, force: true });
  }
  fs.mkdirSync(nodeProjDir, { recursive: true });

  // 2. Copy all server files
  for (const entry of fs.readdirSync(serverDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(serverDir, entry.name), path.join(nodeProjDir, entry.name));
    }
  }

  // 3. Copy dist/ so LAN devices can load the web client from the embedded server
  copyDirRecursive(distDir, path.join(nodeProjDir, 'dist'));

  // 4. Create main.js
  const mainJsContent = [
    "process.on('uncaughtException', (err) => {",
    "  console.error('[EmbeddedServer] Uncaught exception:', err);",
    "});",
    "process.on('unhandledRejection', (reason, p) => {",
    "  console.error('[EmbeddedServer] Unhandled rejection:', reason);",
    "});",
    "const EmbeddedServer = require('./embedded-server.js');",
    "const server = new EmbeddedServer(9527);",
    "server.start();",
    "process.on('SIGTERM', () => {",
    "  server.stop();",
    "  process.exit(0);",
    "});",
    ""
  ].join('\n');
  fs.writeFileSync(path.join(nodeProjDir, 'main.js'), mainJsContent, 'utf8');

  // 5. Create package.json
  const packageJson = {
    name: "liarsbar-embedded-server",
    version: "1.0.0",
    description: "Embedded Node.js server for Liar's Bar app",
    main: "main.js",
    dependencies: {
      "ws": "^8.18.0",
      "qrcode": "^1.5.4"
    }
  };
  fs.writeFileSync(path.join(nodeProjDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');

  // 6. Copy runtime dependencies (ws, qrcode, pngjs, dijkstrajs)
  const targetModulesDir = path.join(nodeProjDir, 'node_modules');
  fs.mkdirSync(targetModulesDir, { recursive: true });
  const requiredDeps = ['ws', 'qrcode', 'pngjs', 'dijkstrajs'];
  for (const dep of requiredDeps) {
    const depSrc = path.join(nodeModulesDir, dep);
    if (fs.existsSync(depSrc)) {
      copyDirRecursive(depSrc, path.join(targetModulesDir, dep));
    }
  }

  // 7. Copy start-nodejs.js to www
  const startNodejsSrc = path.join(projectRoot, 'scripts', 'start-nodejs.js');
  fs.copyFileSync(startNodejsSrc, path.join(wwwDir, 'start-nodejs.js'));

  console.log('✅ Embedded Node.js project prepared successfully at:', nodeProjDir);
}

if (require.main === module) {
  const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
  const cordovaRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.join(projectRoot, 'cordova-app');
  prepareEmbeddedServer(projectRoot, cordovaRoot);
}

module.exports = { prepareEmbeddedServer };
