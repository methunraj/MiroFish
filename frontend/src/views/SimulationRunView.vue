<template>
  <AppShell
    stepNum="03"
    stepName="SIMULATION"
    :status="shellStatus"
    v-model:viewMode="viewMode"
    :systemLogs="systemLogs"
  >
    <template #graph>
      <GraphPanel
        :graphData="graphData"
        :loading="graphLoading"
        :currentPhase="3"
        :isSimulating="isSimulating"
        @refresh="refreshGraph"
        @toggle-maximize="toggleMaximize('graph')"
      />
    </template>
    <template #workbench>
      <Step3Simulation
        :simulationId="currentSimulationId"
        :maxRounds="maxRounds"
        :minutesPerRound="minutesPerRound"
        :projectData="projectData"
        :graphData="graphData"
        :systemLogs="systemLogs"
        @go-back="handleGoBack"
        @next-step="handleNextStep"
        @add-log="addLog"
        @update-status="updateStatus"
      />
    </template>
  </AppShell>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import GraphPanel from '../components/GraphPanel.vue'
import Step3Simulation from '../components/Step3Simulation.vue'
import { getProject, getGraphData } from '../api/graph'
import { getSimulation, getSimulationConfig, stopSimulation, closeSimulationEnv, getEnvStatus } from '../api/simulation'

const route = useRoute()
const router = useRouter()

const props = defineProps({ simulationId: String })

const viewMode = ref('split')
const currentSimulationId = ref(route.params.simulationId)
const maxRounds = ref(route.query.maxRounds ? parseInt(route.query.maxRounds) : null)
const minutesPerRound = ref(30)
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

const isSimulating = computed(() => currentStatus.value === 'processing')

const addLog = (msg) => {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0')
  systemLogs.value.push({ time, msg })
  if (systemLogs.value.length > 200) systemLogs.value.shift()
}

const updateStatus = (status) => { currentStatus.value = status }

const toggleMaximize = (target) => {
  viewMode.value = viewMode.value === target ? 'split' : target
}

const handleGoBack = async () => {
  addLog('Preparing to return to Step 2, closing simulation...')
  stopGraphRefresh()

  try {
    const envStatusRes = await getEnvStatus({ simulation_id: currentSimulationId.value })
    if (envStatusRes.success && envStatusRes.data?.env_alive) {
      addLog('Closing simulation env...')
      try {
        await closeSimulationEnv({ simulation_id: currentSimulationId.value, timeout: 10 })
        addLog('Simulation env closed')
      } catch (closeErr) {
        addLog('Failed to close simulation env, trying force stop...')
        try {
          await stopSimulation({ simulation_id: currentSimulationId.value })
          addLog('Simulation force stopped')
        } catch (stopErr) {
          addLog(`Force stop failed: ${stopErr.message}`)
        }
      }
    } else {
      if (isSimulating.value) {
        addLog('Stopping simulation process...')
        try {
          await stopSimulation({ simulation_id: currentSimulationId.value })
          addLog('Simulation stopped')
        } catch (err) { addLog(`Failed to stop simulation: ${err.message}`) }
      }
    }
  } catch (err) {
    addLog(`Failed to check simulation status: ${err.message}`)
  }

  router.push({ name: 'Simulation', params: { simulationId: currentSimulationId.value } })
}

const handleNextStep = () => {
  addLog('Entering Step 4: Report Generation')
}

const loadSimulationData = async () => {
  try {
    addLog(`Loading simulation data: ${currentSimulationId.value}`)
    const simRes = await getSimulation(currentSimulationId.value)
    if (simRes.success && simRes.data) {
      try {
        const configRes = await getSimulationConfig(currentSimulationId.value)
        if (configRes.success && configRes.data?.time_config?.minutes_per_round) {
          minutesPerRound.value = configRes.data.time_config.minutes_per_round
          addLog(`Time config: ${minutesPerRound.value} minutes per round`)
        }
      } catch (configErr) {
        addLog(`Failed to get time config, using default: ${minutesPerRound.value} min/round`)
      }

      if (simRes.data.project_id) {
        const projRes = await getProject(simRes.data.project_id)
        if (projRes.success && projRes.data) {
          projectData.value = projRes.data
          addLog(`Project loaded: ${projRes.data.project_id}`)
          if (projRes.data.graph_id) { await loadGraph(projRes.data.graph_id) }
        }
      }
    } else {
      addLog(`Failed to load simulation data: ${simRes.error || "Unknown error"}`)
    }
  } catch (err) {
    addLog(`Load error: ${err.message}`)
  }
}

const loadGraph = async (graphId) => {
  if (!isSimulating.value) { graphLoading.value = true }
  try {
    const res = await getGraphData(graphId)
    if (res.success) {
      graphData.value = res.data
      if (!isSimulating.value) { addLog('Graph data loaded successfully') }
    }
  } catch (err) {
    addLog(`Failed to load graph: ${err.message}`)
  } finally {
    graphLoading.value = false
  }
}

const refreshGraph = () => {
  if (projectData.value?.graph_id) { loadGraph(projectData.value.graph_id) }
}

let graphRefreshTimer = null

const startGraphRefresh = () => {
  if (graphRefreshTimer) return
  addLog('Starting real-time graph refresh (30s)')
  graphRefreshTimer = setInterval(refreshGraph, 30000)
}

const stopGraphRefresh = () => {
  if (graphRefreshTimer) { clearInterval(graphRefreshTimer); graphRefreshTimer = null; addLog('Stopped real-time graph refresh') }
}

watch(isSimulating, (val) => {
  if (val) startGraphRefresh()
  else stopGraphRefresh()
}, { immediate: true })

onMounted(() => {
  addLog('SimulationRunView initialized')
  if (maxRounds.value) { addLog(`Custom simulation rounds: ${maxRounds.value}`) }
  loadSimulationData()
})

onUnmounted(() => { stopGraphRefresh() })
</script>
