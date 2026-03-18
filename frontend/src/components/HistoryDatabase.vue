<template>
  <div class="history-section">
    <div class="section-label">HISTORY</div>
    <div v-if="projects.length === 0 && !loading" class="history-empty">
      <span class="empty-text">no simulation records</span>
    </div>
    <div v-else-if="loading" class="history-loading">
      <span class="loading-text">loading...</span>
    </div>
    <div v-else class="history-grid">
      <div
        v-for="project in projects"
        :key="project.simulation_id"
        class="history-card"
        @click="navigateToProject(project)"
      >
        <div class="card-id">{{ formatSimulationId(project.simulation_id) }}</div>
        <div class="card-title">{{ getSimulationTitle(project.simulation_requirement) }}</div>
        <div class="card-files">
          <span v-if="project.files && project.files.length > 0">
            {{ project.files.length }} files
          </span>
          <span v-else>no files</span>
        </div>
        <div class="card-footer">
          <span class="card-date">{{ formatDate(project.created_at) }}</span>
          <span class="card-progress" :class="getProgressClass(project)">
            {{ formatRounds(project) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="selectedProject" class="modal-overlay" @click.self="closeModal">
          <div class="modal-content">
            <div class="modal-header">
              <span class="modal-id">{{ formatSimulationId(selectedProject.simulation_id) }}</span>
              <span class="modal-progress" :class="getProgressClass(selectedProject)">
                {{ formatRounds(selectedProject) }}
              </span>
              <button class="modal-close" @click="closeModal">&times;</button>
            </div>
            <div class="modal-body">
              <div class="modal-section">
                <div class="label">REQUIREMENT</div>
                <div class="modal-requirement">{{ selectedProject.simulation_requirement || 'None' }}</div>
              </div>
              <div class="modal-section">
                <div class="label">FILES</div>
                <div v-if="selectedProject.files && selectedProject.files.length > 0" class="modal-files">
                  <div v-for="(file, i) in selectedProject.files" :key="i" class="modal-file-item">
                    <span class="file-prefix">&gt;</span>
                    <span>{{ file.filename }}</span>
                  </div>
                </div>
                <div v-else class="empty-text">no files</div>
              </div>
            </div>
            <hr class="divider">
            <div class="modal-actions">
              <button class="btn" @click="goToProject" :disabled="!selectedProject.project_id">
                01 GRAPH BUILD
              </button>
              <button class="btn" @click="goToSimulation">
                02 ENVIRONMENT
              </button>
              <button class="btn" @click="goToReport" :disabled="!selectedProject.report_id">
                04 REPORT
              </button>
            </div>
            <div class="modal-hint">
              steps 3 and 5 do not support history replay
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSimulationHistory } from '../api/simulation'

const router = useRouter()
const route = useRoute()

const projects = ref([])
const loading = ref(true)
const selectedProject = ref(null)

const getProgressClass = (simulation) => {
  const current = simulation.current_round || 0
  const total = simulation.total_rounds || 0
  if (total === 0 || current === 0) return 'not-started'
  return current >= total ? 'completed' : 'in-progress'
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  try { return new Date(dateStr).toISOString().slice(0, 10) }
  catch { return dateStr?.slice(0, 10) || '' }
}

const getSimulationTitle = (req) => {
  if (!req) return 'Untitled Simulation'
  return req.length > 30 ? req.slice(0, 30) + '...' : req
}

const formatSimulationId = (id) => {
  if (!id) return 'SIM_UNKNOWN'
  return `SIM_${id.replace('sim_', '').slice(0, 6).toUpperCase()}`
}

const formatRounds = (simulation) => {
  const current = simulation.current_round || 0
  const total = simulation.total_rounds || 0
  if (total === 0) return 'not started'
  return `${current}/${total} rounds`
}

const navigateToProject = (simulation) => { selectedProject.value = simulation }
const closeModal = () => { selectedProject.value = null }

const goToProject = () => {
  if (selectedProject.value?.project_id) {
    router.push({ name: 'Process', params: { projectId: selectedProject.value.project_id } })
    closeModal()
  }
}

const goToSimulation = () => {
  if (selectedProject.value?.simulation_id) {
    router.push({ name: 'Simulation', params: { simulationId: selectedProject.value.simulation_id } })
    closeModal()
  }
}

const goToReport = () => {
  if (selectedProject.value?.report_id) {
    router.push({ name: 'Report', params: { reportId: selectedProject.value.report_id } })
    closeModal()
  }
}

const loadHistory = async () => {
  try {
    loading.value = true
    const response = await getSimulationHistory(20)
    if (response.success) { projects.value = response.data || [] }
  } catch (error) {
    console.error('Failed to load history:', error)
    projects.value = []
  } finally {
    loading.value = false
  }
}

watch(() => route.path, (newPath) => { if (newPath === '/') loadHistory() })

onMounted(() => { loadHistory() })
</script>

<style scoped>
.history-section {
  margin-top: var(--space-8);
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}

.history-card {
  background: var(--bg-raised);
  border: var(--border);
  padding: var(--space-4);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.history-card:hover {
  border-color: var(--accent-dim);
}

.card-id {
  font-size: var(--font-size-xs);
  color: var(--text-faint);
  letter-spacing: 0.08em;
  margin-bottom: var(--space-2);
}

.card-title {
  font-size: var(--font-size-sm);
  color: var(--text);
  font-weight: 700;
  margin-bottom: var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-card:hover .card-title {
  color: var(--accent);
}

.card-files {
  font-size: var(--font-size-xs);
  color: var(--text-dim);
  margin-bottom: var(--space-3);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-2);
  border-top: var(--border);
  font-size: var(--font-size-xs);
}

.card-date {
  color: var(--text-faint);
}

.card-progress.completed { color: var(--success); }
.card-progress.in-progress { color: var(--warning); }
.card-progress.not-started { color: var(--text-faint); }

.history-empty,
.history-loading {
  padding: var(--space-8);
  text-align: center;
}

.empty-text,
.loading-text {
  color: var(--text-faint);
  font-size: var(--font-size-sm);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: var(--bg-raised);
  border: var(--border);
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  font-family: var(--font-mono);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: var(--border);
}

.modal-id {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text);
}

.modal-progress {
  font-size: var(--font-size-xs);
  color: var(--text-dim);
}

.modal-progress.completed { color: var(--success); }
.modal-progress.in-progress { color: var(--warning); }
.modal-progress.not-started { color: var(--text-faint); }

.modal-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: var(--font-size-lg);
  cursor: pointer;
  padding: 0;
}

.modal-close:hover {
  color: var(--text);
}

.modal-body {
  padding: var(--space-4);
}

.modal-section {
  margin-bottom: var(--space-4);
}

.modal-requirement {
  padding: var(--space-3);
  background: var(--bg-surface);
  border: var(--border);
  font-size: var(--font-size-sm);
  color: var(--text-dim);
  line-height: 1.6;
}

.modal-files {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.modal-file-item {
  font-size: var(--font-size-sm);
  color: var(--text-dim);
  padding: var(--space-1) 0;
}

.file-prefix {
  color: var(--accent);
  margin-right: var(--space-2);
}

.modal-actions {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-4);
}

.modal-hint {
  padding: 0 var(--space-4) var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--text-faint);
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
</style>
