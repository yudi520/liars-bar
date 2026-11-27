<template>
  <div class="room-code-pill" title="点击复制房间码，分享给朋友输码入座" @click="copyCode">
    <span class="rc-label">🎫 房间码</span>
    <span class="rc-code">#{{ roomId }}</span>
    <span v-if="copied" class="rc-copied">已复制 ✓</span>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  roomId: { type: String, default: '' }
});

const copied = ref(false);
let copiedTimer = null;

function copyCode() {
  const code = (props.roomId || '').toUpperCase();
  if (!code) return;
  const flash = () => {
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(flash).catch(() => fallbackCopy(code, flash));
  } else {
    fallbackCopy(code, flash);
  }
}

function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch (_) {}
}
</script>

<style scoped>
.room-code-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(245, 158, 11, 0.1));
  border: 1px solid rgba(251, 191, 36, 0.55);
  border-radius: 20px;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  white-space: nowrap;
}

.room-code-pill:hover {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.18));
  border-color: #fbbf24;
  transform: translateY(-1px);
}

.rc-label {
  font-size: 11px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 1px;
}

.rc-code {
  font-size: 14px;
  font-weight: 800;
  color: #fef3c7;
  letter-spacing: 2.5px;
  font-family: 'Courier New', monospace;
}

.rc-copied {
  font-size: 11px;
  font-weight: 800;
  color: #4ade80;
}
</style>
