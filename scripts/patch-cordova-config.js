const fs = require('fs');

function patchCordovaConfig(configPath) {
  let xml = fs.readFileSync(configPath, 'utf8');

  if (xml.includes('StatusBarOverlaysWebView')) {
    xml = xml.replace(/<preference name="StatusBarOverlaysWebView" value="[^"]*" \/>/g, '<preference name="StatusBarOverlaysWebView" value="false" />');
  } else {
    xml = xml.replace('</widget>', '    <preference name="StatusBarOverlaysWebView" value="false" />\n</widget>');
  }

  if (xml.includes('StatusBarBackgroundColor')) {
    xml = xml.replace(/<preference name="StatusBarBackgroundColor" value="[^"]*" \/>/g, '<preference name="StatusBarBackgroundColor" value="#ffffff" />');
  } else {
    xml = xml.replace('</widget>', '    <preference name="StatusBarBackgroundColor" value="#ffffff" />\n</widget>');
  }

  if (xml.includes('name="Fullscreen"')) {
    xml = xml.replace(/<preference name="Fullscreen" value="[^"]*" \/>/g, '<preference name="Fullscreen" value="true" />');
  } else {
    xml = xml.replace('</widget>', '    <preference name="Fullscreen" value="true" />\n</widget>');
  }

  if (xml.includes('name="Orientation"')) {
    xml = xml.replace(/<preference name="Orientation" value="[^"]*" \/>/g, '<preference name="Orientation" value="landscape" />');
  } else {
    xml = xml.replace('</widget>', '    <preference name="Orientation" value="landscape" />\n</widget>');
  }

  // 关键：移除 scheme=http 与 hostname，保持与 rps-royale 一致的 https 默认资产桥，确保 deviceready 与 NodeJS 插件原生通信正常
  xml = xml.replace(/<preference name="scheme" value="[^"]*" \/>\r?\n?/g, '');
  xml = xml.replace(/<preference name="hostname" value="[^"]*" \/>\r?\n?/g, '');

  fs.writeFileSync(configPath, xml, 'utf8');
  console.log(`Patched Cordova preferences in ${configPath}`);

  const pathModule = require('path');
  const platformConfigPath = pathModule.join(pathModule.dirname(configPath), 'platforms/android/app/src/main/res/xml/config.xml');
  if (fs.existsSync(platformConfigPath)) {
    let pXml = fs.readFileSync(platformConfigPath, 'utf8');
    pXml = pXml.replace(/<preference name="scheme" value="[^"]*" \/>\r?\n?/g, '');
    pXml = pXml.replace(/<preference name="hostname" value="[^"]*" \/>\r?\n?/g, '');
    fs.writeFileSync(platformConfigPath, pXml, 'utf8');
    console.log(`Patched platform config.xml in ${platformConfigPath}`);
  }
}

if (require.main === module) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: node scripts/patch-cordova-config.js <config.xml>');
    process.exit(1);
  }
  patchCordovaConfig(configPath);
}

module.exports = { patchCordovaConfig };
