/**
 * test-multi-room-e2e-runall.js
 * 双模式验收 runner（跨平台）：依次以多房间 / 单间模式运行 e2e 子进程。
 */

const { spawnSync } = require('child_process');
const path = require('path');

function runMode(multi) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'test-multi-room-e2e.js')], {
    env: { ...process.env, MULTI_ROOM_ENABLED: multi ? 'true' : 'false' },
    stdio: 'inherit'
  });
  return result.status === 0;
}

console.log('\n========== 阶段 1/2：多房间模式（MULTI_ROOM_ENABLED=true） ==========');
const multiOk = runMode(true);
console.log('\n========== 阶段 2/2：单间模式（MULTI_ROOM_ENABLED=false，APK 等价现状） ==========');
const singleOk = runMode(false);

if (multiOk && singleOk) {
  console.log('\n🎉 双模式 e2e 验收全部通过！');
  process.exit(0);
} else {
  console.error('\n❌ 双模式 e2e 验收存在失败项');
  process.exit(1);
}
