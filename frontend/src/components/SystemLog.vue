<template>
  <div class="system-log" ref="logContainer">
    <div class="log-header">
      <span class="log-title">system log</span>
      <span class="log-count">{{ logs.length }} entries</span>
    </div>
    <div class="log-entries" ref="logEntries">
      <div v-for="(entry, i) in logs" :key="i" class="log-entry">
        <span class="log-prefix">&gt;</span>
        <span class="log-time">{{ entry.time }}</span>
        <span class="log-msg">{{ entry.msg }}</span>
      </div>
      <div v-if="logs.length === 0" class="log-empty">no log entries</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  logs: { type: Array, default: () => [] }
})

const logContainer = ref(null)
const logEntries = ref(null)

watch(() => props.logs.length, async () => {
  await nextTick()
  if (logEntries.value) {
    logEntries.value.scrollTop = logEntries.value.scrollHeight
  }
})
</script>

<style scoped>
.system-log {
  height: var(--system-log-h);
  min-height: var(--system-log-h);
  border-top: var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-4);
  border-bottom: var(--border);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  flex-shrink: 0;
}

.log-entries {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-xs);
}

.log-entry {
  display: flex;
  gap: var(--space-2);
  padding: 1px 0;
  line-height: 1.5;
}

.log-prefix {
  color: var(--accent);
  flex-shrink: 0;
  user-select: none;
}

.log-time {
  color: var(--text-faint);
  flex-shrink: 0;
  min-width: 90px;
}

.log-msg {
  color: var(--text-dim);
}

.log-empty {
  color: var(--text-faint);
  font-style: italic;
  padding: var(--space-2) 0;
}
</style>
