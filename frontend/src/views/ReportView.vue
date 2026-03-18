<template>
  <AppShell
    stepNum="04"
    stepName="REPORT"
    :status="shellStatus"
    v-model:viewMode="viewMode"
    :systemLogs="systemLogs"
  >
    <template #graph>
      <GraphPanel
        :graphData="graphData"
        :loading="graphLoading"
        :currentPhase="4"
        :isSimulating="false"
        @refresh="refreshGraph"
        @toggle-maximize="toggleMaximize('graph')"
      />
    </template>
    <template #workbench>
      <Step4Report
        :reportId="currentReportId"
        :simulationId="simulationId"
        :systemLogs="systemLogs"
        @add-log="addLog"
        @update-status="updateStatus"
      />
    </template>
  </AppShell>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import GraphPanel from '../components/GraphPanel.vue'
import Step4Report from '../components/Step4Report.vue'
import { getProject, getGraphData } from '../api/graph'
import { getSimulation } from '../api/simulation'
import { getReport } from '../api/report'

const route = useRoute()
const router = useRouter()

const props = defineProps({ reportId: String })

const viewMode = ref('workbench')
const currentReportId = ref(route.params.reportId)
const simulationId = ref(null)
const projectData = ref(null)
const graphData = ref(null)
const graphLoading = ref(false)
const systemLogs = ref([])
const currentStatus = ref('processing')

const shellStatus = computed(() => {
  if (currentStatus.value === 'error') return 'error'
  if (currentStatus.value === 'completed') return 'completed'
  return 'active'
})

const addLog = (msg) => {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0')
  systemLogs.value.push({ time, msg })
  if (systemLogs.value.length > 200) systemLogs.value.shift()
}

const updateStatus = (status) => { currentStatus.value = status }

const toggleMaximize = (target) => {
  viewMode.value = viewMode.value === target ? 'split' : target
}

const loadReportData = async () => {
  try {
    addLog(`Loading report data: ${currentReportId.value}`)
    const reportRes = await getReport(currentReportId.value)
    if (reportRes.success && reportRes.data) {
      simulationId.value = reportRes.data.simulation_id
      if (simulationId.value) {
        const simRes = await getSimulation(simulationId.value)
        if (simRes.success && simRes.data) {
          if (simRes.data.project_id) {
            const projRes = await getProject(simRes.data.project_id)
            if (projRes.success && projRes.data) {
              projectData.value = projRes.data
              addLog(`Project loaded: ${projRes.data.project_id}`)
              if (projRes.data.graph_id) { await loadGraph(projRes.data.graph_id) }
            }
          }
        }
      }
    } else {
      addLog(`Failed to get report info: ${reportRes.error || "Unknown error"}`)
    }
  } catch (err) {
    addLog(`Load error: ${err.message}`)
  }
}

const loadGraph = async (graphId) => {
  graphLoading.value = true
  try {
    const res = await getGraphData(graphId)
    if (res.success) { graphData.value = res.data; addLog('Graph data loaded successfully') }
  } catch (err) {
    addLog(`Failed to load graph: ${err.message}`)
  } finally {
    graphLoading.value = false
  }
}

const refreshGraph = () => {
  if (projectData.value?.graph_id) { loadGraph(projectData.value.graph_id) }
}

watch(() => route.params.reportId, (newId) => {
  if (newId && newId !== currentReportId.value) {
    currentReportId.value = newId
    loadReportData()
  }
}, { immediate: true })

onMounted(() => {
  addLog('ReportView initialized')
  loadReportData()
})
</script>
