<template>
  <header class="app-header">
    <div class="header-left" @click="$router.push('/')">
      <img :src="logoSrc" alt="PW" class="header-icon" />
      <span class="header-brand">PARALLEL WORLD</span>
    </div>
    <div class="header-right">
      <ThemeToggle />
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from '../composables/useTheme'
import ThemeToggle from './ThemeToggle.vue'

const { isDark } = useTheme()

const logoSrc = computed(() => {
  return isDark.value
    ? new URL('../assets/logo/icon-dark.svg', import.meta.url).href
    : new URL('../assets/logo/icon-light.svg', import.meta.url).href
})
</script>

<style scoped>
.app-header {
  height: var(--header-h);
  min-height: var(--header-h);
  border-bottom: var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--bg);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
}

.header-icon {
  width: 28px;
  height: 28px;
}

.header-brand {
  font-size: var(--font-size-md);
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text);
}

.header-right {
  display: flex;
  align-items: center;
}
</style>
