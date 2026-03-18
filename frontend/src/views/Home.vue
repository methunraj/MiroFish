<template>
  <div class="home-page">
    <!-- Top Bar -->
    <header class="home-header">
      <div class="header-left">
        <img :src="logoSrc" alt="PW" class="header-icon" />
        <span class="header-brand">PARALLEL WORLD</span>
      </div>
      <div class="header-right">
        <ThemeToggle />
      </div>
    </header>

    <!-- Scrollable Content -->
    <div class="home-scroll">
      <!-- Tagline -->
      <section class="hero-section">
        <p class="tagline">
          Upload documents. Build a knowledge graph.<br>
          Simulate social dynamics. Get insights.
        </p>
      </section>

      <!-- Upload Console -->
      <section class="console-section">
        <div class="console-grid">
          <!-- Left: Files -->
          <div class="console-panel files-panel">
            <div class="section-label">FILES</div>
            <div
              class="upload-zone"
              :class="{ 'drag-over': isDragOver, 'has-files': files.length > 0 }"
              @dragover.prevent="handleDragOver"
              @dragleave.prevent="isDragOver = false"
              @drop.prevent="handleDrop"
              @click="triggerFileInput"
            >
              <input
                ref="fileInput"
                type="file"
                multiple
                accept=".pdf,.md,.txt"
                @change="handleFileSelect"
                style="display: none"
                :disabled="loading"
              />
              <div v-if="files.length === 0" class="upload-placeholder">
                <p class="upload-text">drop files here</p>
                <p class="upload-formats">.pdf .md .txt</p>
              </div>
              <div v-else class="file-list">
                <div v-for="(file, i) in files" :key="i" class="file-entry">
                  <span class="file-prefix">&gt;</span>
                  <span class="file-name">{{ file.name }}</span>
                  <button @click.stop="removeFile(i)" class="file-remove">&times;</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Requirement -->
          <div class="console-panel req-panel">
            <div class="section-label">REQUIREMENT</div>
            <textarea
              v-model="formData.simulationRequirement"
              class="mono-textarea"
              placeholder="describe your simulation scenario and goals..."
              rows="8"
              :disabled="loading"
            ></textarea>
            <button
              class="btn-primary start-btn"
              :disabled="!canSubmit || loading"
              @click="startSimulation"
            >
              <span v-if="!loading">[ START ENGINE ]</span>
              <span v-else>[ INITIALIZING... ]</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Workflow -->
      <section class="workflow-section">
        <div class="section-label">WORKFLOW</div>
        <div class="workflow-grid">
          <div v-for="step in workflowSteps" :key="step.num" class="workflow-step" :class="step.status">
            <span class="step-num">{{ step.num }}</span>
            <span class="step-name">{{ step.name }}</span>
            <span class="step-desc">{{ step.desc }}</span>
          </div>
        </div>
      </section>

      <!-- History -->
      <HistoryDatabase />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import ThemeToggle from '../components/ThemeToggle.vue'
import HistoryDatabase from '../components/HistoryDatabase.vue'

const router = useRouter()
const { isDark } = useTheme()

const logoSrc = computed(() => {
  return isDark.value
    ? new URL('../assets/logo/icon-dark.svg', import.meta.url).href
    : new URL('../assets/logo/icon-light.svg', import.meta.url).href
})

const formData = ref({ simulationRequirement: '' })
const files = ref([])
const loading = ref(false)
const isDragOver = ref(false)
const fileInput = ref(null)

const canSubmit = computed(() => {
  return formData.value.simulationRequirement.trim() !== '' && files.value.length > 0
})

const workflowSteps = [
  { num: '01', name: 'GRAPH BUILD', desc: 'extract entities from documents', status: 'pending' },
  { num: '02', name: 'ENVIRONMENT', desc: 'configure parameters', status: 'pending' },
  { num: '03', name: 'SIMULATION', desc: 'run agents on platforms', status: 'pending' },
  { num: '04', name: 'REPORT', desc: 'generate analysis', status: 'pending' },
  { num: '05', name: 'INTERACTION', desc: 'chat with simulated entities', status: 'pending' }
]

const triggerFileInput = () => { if (!loading.value) fileInput.value?.click() }
const handleFileSelect = (e) => addFiles(Array.from(e.target.files))
const handleDragOver = () => { if (!loading.value) isDragOver.value = true }
const handleDrop = (e) => {
  isDragOver.value = false
  if (loading.value) return
  addFiles(Array.from(e.dataTransfer.files))
}

const addFiles = (newFiles) => {
  const valid = newFiles.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase()
    return ['pdf', 'md', 'txt'].includes(ext)
  })
  files.value.push(...valid)
}

const removeFile = (index) => { files.value.splice(index, 1) }

const startSimulation = () => {
  if (!canSubmit.value || loading.value) return
  import('../store/pendingUpload.js').then(({ setPendingUpload }) => {
    setPendingUpload(files.value, formData.value.simulationRequirement)
    router.push({ name: 'Process', params: { projectId: 'new' } })
  })
}
</script>

<style scoped>
.home-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.home-header {
  height: var(--header-h);
  min-height: var(--header-h);
  border-bottom: var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--bg);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
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

.home-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-8) var(--space-6) var(--space-12);
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}

/* Tagline */
.tagline {
  font-size: var(--font-size-2xl);
  color: var(--text);
  line-height: 1.5;
  text-align: center;
  margin-bottom: var(--space-10);
}

/* Console */
.console-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.console-panel {
  background: var(--bg-raised);
  border: var(--border);
  padding: var(--space-4);
}

.upload-zone {
  border: var(--border);
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color var(--transition-fast);
  padding: var(--space-4);
}

.upload-zone:hover,
.upload-zone.drag-over {
  border-color: var(--accent-dim);
}

.upload-placeholder {
  text-align: center;
}

.upload-text {
  color: var(--text-dim);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-2);
}

.upload-formats {
  color: var(--text-faint);
  font-size: var(--font-size-xs);
}

.file-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.file-entry {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: var(--font-size-sm);
}

.file-prefix {
  color: var(--accent);
  user-select: none;
}

.file-name {
  flex: 1;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-remove {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: var(--font-size-md);
  padding: 0 var(--space-1);
}

.file-remove:hover {
  color: var(--error);
}

.start-btn {
  width: 100%;
  margin-top: var(--space-4);
  padding: var(--space-3);
  font-size: var(--font-size-sm);
  letter-spacing: 0.12em;
  font-weight: 700;
}

/* Workflow */
.workflow-section {
  margin-top: var(--space-10);
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.workflow-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  border: var(--border);
  background: var(--bg-raised);
}

.workflow-step .step-num {
  font-size: var(--font-size-xs);
  color: var(--text-faint);
  letter-spacing: 0.1em;
}

.workflow-step .step-name {
  font-size: var(--font-size-sm);
  color: var(--text);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.workflow-step .step-desc {
  font-size: var(--font-size-xs);
  color: var(--text-dim);
}

/* Responsive */
@media (max-width: 768px) {
  .console-grid {
    grid-template-columns: 1fr;
  }

  .home-scroll {
    padding: var(--space-4) var(--space-3) var(--space-8);
  }
}
</style>
