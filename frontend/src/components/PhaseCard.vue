<template>
  <div class="phase-card" :class="{ 'phase-active': active }">
    <div class="phase-header">
      <span class="phase-indicator">{{ active ? '\25C8' : '\25C7' }}</span>
      <span class="phase-title">{{ title }}</span>
    </div>
    <div class="phase-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  active: { type: Boolean, default: false }
})
</script>

<style scoped>
.phase-card {
  background: var(--bg-raised);
  border: var(--border);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}

.phase-active {
  border-color: var(--accent-dim);
}

.phase-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: var(--border);
}

.phase-indicator {
  font-size: var(--font-size-sm);
  color: var(--text-faint);
}

.phase-active .phase-indicator {
  color: var(--accent);
}

.phase-title {
  font-size: var(--font-size-xs);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.phase-active .phase-title {
  color: var(--text);
}

.phase-body {
  font-size: var(--font-size-sm);
  color: var(--text-dim);
  line-height: 1.6;
}

.phase-body :deep(.phase-row) {
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) 0;
}

.phase-body :deep(.phase-row + .phase-row) {
  border-top: var(--border);
}
</style>
