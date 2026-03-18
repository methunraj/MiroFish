<template>
  <div class="status-line">
    <div class="status-left">
      <span class="step-label">{{ stepNum }} {{ stepName }}</span>
    </div>
    <div class="status-right">
      <span class="status-indicator" :class="statusClass">
        {{ statusSymbol }} {{ statusText }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  stepNum: { type: [Number, String], required: true },
  stepName: { type: String, required: true },
  status: { type: String, default: 'pending' } // pending | active | completed | error
})

const statusClass = computed(() => `status-${props.status}`)

const statusSymbol = computed(() => {
  switch (props.status) {
    case 'completed': return '◆'
    case 'active': return '◈'
    case 'error': return '✖'
    default: return '○'
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'completed': return 'done'
    case 'active': return 'active'
    case 'error': return 'error'
    default: return 'pending'
  }
})
</script>

<style scoped>
.status-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  border-bottom: var(--border);
  background: var(--bg);
  font-size: var(--font-size-sm);
}

.step-label {
  color: var(--text);
  letter-spacing: 0.05em;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pending { color: var(--text-dim); }
.status-active { color: var(--accent); }
.status-completed { color: var(--success); }
.status-error { color: var(--error); }
</style>
