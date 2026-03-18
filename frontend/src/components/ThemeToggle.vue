<template>
  <button class="theme-toggle" @click="toggle" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
    <span v-if="isDark" class="icon">&#9788;</span>
    <span v-else class="icon">&#9790;</span>
  </button>
</template>

<script setup>
import { useTheme } from '../composables/useTheme'

const { isDark, toggle } = useTheme()
</script>

<style scoped>
.theme-toggle {
  background: transparent;
  border: var(--border);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-dim);
  padding: 0;
}

.theme-toggle:hover {
  color: var(--accent);
  border-color: var(--accent-dim);
}

.icon {
  font-size: 16px;
  line-height: 1;
}
</style>
