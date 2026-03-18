<template>
  <div class="app-shell">
    <AppHeader />
    <div class="shell-subheader">
      <StatusLine
        :stepNum="stepNum"
        :stepName="stepName"
        :status="status"
      />
      <ViewSwitcher :modelValue="viewMode" @update:modelValue="$emit('update:viewMode', $event)" />
    </div>
    <main class="shell-content">
      <div class="panel-wrapper left" :style="leftPanelStyle">
        <slot name="graph"></slot>
      </div>
      <div class="panel-wrapper right" :style="rightPanelStyle">
        <div class="workbench-scroll">
          <slot name="workbench"></slot>
        </div>
      </div>
    </main>
    <SystemLog :logs="systemLogs" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppHeader from './AppHeader.vue'
import ViewSwitcher from './ViewSwitcher.vue'
import StatusLine from './StatusLine.vue'
import SystemLog from './SystemLog.vue'

const props = defineProps({
  stepNum: { type: [Number, String], required: true },
  stepName: { type: String, required: true },
  status: { type: String, default: 'pending' },
  viewMode: { type: String, default: 'split' },
  systemLogs: { type: Array, default: () => [] }
})

defineEmits(['update:viewMode'])

const leftPanelStyle = computed(() => {
  if (props.viewMode === 'graph') return { width: '100%', opacity: 1, transform: 'translateX(0)' }
  if (props.viewMode === 'workbench') return { width: '0%', opacity: 0, transform: 'translateX(-20px)', overflow: 'hidden' }
  return { width: '50%', opacity: 1, transform: 'translateX(0)' }
})

const rightPanelStyle = computed(() => {
  if (props.viewMode === 'workbench') return { width: '100%', opacity: 1, transform: 'translateX(0)' }
  if (props.viewMode === 'graph') return { width: '0%', opacity: 0, transform: 'translateX(20px)', overflow: 'hidden' }
  return { width: '50%', opacity: 1, transform: 'translateX(0)' }
})
</script>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.shell-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: var(--border);
  background: var(--bg);
  padding-right: var(--space-4);
  flex-shrink: 0;
}

.shell-content {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.panel-wrapper {
  height: 100%;
  overflow: hidden;
  transition: width var(--transition-slow), opacity var(--transition-base), transform var(--transition-base);
  will-change: width, opacity, transform;
}

.panel-wrapper.left {
  border-right: var(--border);
}

.panel-wrapper.right {
  overflow: hidden;
}

.workbench-scroll {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-4);
}
</style>
