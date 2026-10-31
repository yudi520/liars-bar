const fs = require('fs');
const path = require('path');

function injectCordovaHead(filePath) {
  const resolvedPath = path.resolve(filePath);
  let html = fs.readFileSync(resolvedPath, 'utf8');

  if (!html.includes('<head>')) {
    throw new Error(`Missing <head> in ${resolvedPath}`);
  }

  // Remove any stale injections
  html = html.replace(/<!-- Cordova script -->\s*<script src="cordova.js"><\/script>\s*<!-- Node.js startup script -->\s*<script src="start-nodejs.js"><\/script>/g, '');
  html = html.replace(/<!-- Cordova & Embedded Node.js -->\s*<script src="cordova.js"><\/script>\s*<script src="start-nodejs.js"><\/script>/g, '');
  html = html.replace(/<script src="cordova.js"><\/script>\s*<script src="start-nodejs.js"><\/script>/g, '');

  const injection = [
    '    <!-- Cordova & Embedded Node.js -->',
    '    <script src="cordova.js"></script>',
    '    <script src="start-nodejs.js"></script>'
  ].join('\n');

  html = html.replace('<head>', `<head>\n${injection}`);

  fs.writeFileSync(resolvedPath, html, 'utf8');

  const verified = fs.readFileSync(resolvedPath, 'utf8');
  if (!verified.includes('start-nodejs.js')) {
    throw new Error(`Verification failed for ${resolvedPath}`);
  }
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/inject-cordova-head.js <index.html>');
    process.exit(1);
  }

  injectCordovaHead(target);
  console.log(`Successfully injected cordova and start-nodejs scripts at top of head in ${target}`);
}

module.exports = { injectCordovaHead };
