<template>
  <div class="view-switcher">
    <button
      v-for="mode in modes"
      :key="mode.value"
      class="switch-btn"
      :class="{ active: modelValue === mode.value }"
      @click="$emit('update:modelValue', mode.value)"
    >
      {{ mode.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: 'split' }
})

defineEmits(['update:modelValue'])

const modes = [
  { value: 'graph', label: 'GRAPH' },
  { value: 'split', label: 'SPLIT' },
  { value: 'workbench', label: 'WORKBENCH' }
]
</script>

<style scoped>
.view-switcher {
  display: flex;
  gap: 0;
  border: var(--border);
}

.switch-btn {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-3);
  background: transparent;
  color: var(--text-dim);
  border: none;
  border-right: var(--border);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-transform: uppercase;
}

.switch-btn:last-child {
  border-right: none;
}

.switch-btn.active {
  background: var(--bg-surface);
  color: var(--accent);
}

.switch-btn:hover:not(.active) {
  color: var(--text);
}
</style>
