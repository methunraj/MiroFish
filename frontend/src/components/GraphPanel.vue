<template>
  <div class="graph-panel">
    <div class="panel-header">
      <span class="panel-title">Graph Relationship Visualization</span>
      <!-- Top toolbar (Internal Top Right) -->
      <div class="header-tools">
        <button class="tool-btn" @click="$emit('refresh')" :disabled="loading" title="Refresh graph">
          <span class="icon-refresh" :class="{ 'spinning': loading }">↻</span>
          <span class="btn-text">Refresh</span>
        </button>
        <button class="tool-btn" @click="$emit('toggle-maximize')" title="Maximize/Restore">
          <span class="icon-maximize">⛶</span>
        </button>
      </div>
    </div>
    
    <div class="graph-container" ref="graphContainer">
      <!-- Graph visualization -->
      <div v-if="graphData" class="graph-view">
        <svg ref="graphSvg" class="graph-svg"></svg>
        
        <!-- Building/simulating hint -->
        <div v-if="currentPhase === 1 || isSimulating" class="graph-building-hint">
          <div class="memory-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="memory-icon">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-4.04z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-4.04z" />
            </svg>
          </div>
          {{ isSimulating ? 'GraphRAG long/short-term memory updating in real-time' : 'Updating in real-time...' }}
        </div>
        
        <!-- Post-simulation hint -->
        <div v-if="showSimulationFinishedHint" class="graph-building-hint finished-hint">
          <div class="hint-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hint-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <span class="hint-text">Still processing some content, recommend manual graph refresh later</span>
          <button class="hint-close-btn" @click="dismissFinishedHint" title="Close hint">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <!-- Node/edge detail panel -->
        <div v-if="selectedItem" class="detail-panel">
          <div class="detail-panel-header">
            <span class="detail-title">{{ selectedItem.type === 'node' ? 'Node Details' : 'Relationship' }}</span>
            <span v-if="selectedItem.type === 'node'" class="detail-type-badge" :style="{ background: selectedItem.color, color: '#fff' }">
              {{ selectedItem.entityType }}
            </span>
            <button class="detail-close" @click="closeDetailPanel">×</button>
          </div>
          
          <!-- Node details -->
          <div v-if="selectedItem.type === 'node'" class="detail-content">
            <div class="detail-row">
              <span class="detail-label">Name:</span>
              <span class="detail-value">{{ selectedItem.data.name }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">UUID:</span>
              <span class="detail-value uuid-text">{{ selectedItem.data.uuid }}</span>
            </div>
            <div class="detail-row" v-if="selectedItem.data.created_at">
              <span class="detail-label">Created:</span>
              <span class="detail-value">{{ formatDateTime(selectedItem.data.created_at) }}</span>
            </div>
            
            <!-- Properties -->
            <div class="detail-section" v-if="selectedItem.data.attributes && Object.keys(selectedItem.data.attributes).length > 0">
              <div class="section-title">Properties:</div>
              <div class="properties-list">
                <div v-for="(value, key) in selectedItem.data.attributes" :key="key" class="property-item">
                  <span class="property-key">{{ key }}:</span>
                  <span class="property-value">{{ value || 'None' }}</span>
                </div>
              </div>
            </div>
            
            <!-- Summary -->
            <div class="detail-section" v-if="selectedItem.data.summary">
              <div class="section-title">Summary:</div>
              <div class="summary-text">{{ selectedItem.data.summary }}</div>
            </div>
            
            <!-- Labels -->
            <div class="detail-section" v-if="selectedItem.data.labels && selectedItem.data.labels.length > 0">
              <div class="section-title">Labels:</div>
              <div class="labels-list">
                <span v-for="label in selectedItem.data.labels" :key="label" class="label-tag">
                  {{ label }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Edge details -->
          <div v-else class="detail-content">
            <!-- Self-loop group details -->
            <template v-if="selectedItem.data.isSelfLoopGroup">
              <div class="edge-relation-header self-loop-header">
                {{ selectedItem.data.source_name }} - Self Relations
                <span class="self-loop-count">{{ selectedItem.data.selfLoopCount }} items</span>
              </div>
              
              <div class="self-loop-list">
                <div 
                  v-for="(loop, idx) in selectedItem.data.selfLoopEdges" 
                  :key="loop.uuid || idx" 
                  class="self-loop-item"
                  :class="{ expanded: expandedSelfLoops.has(loop.uuid || idx) }"
                >
                  <div 
                    class="self-loop-item-header"
                    @click="toggleSelfLoop(loop.uuid || idx)"
                  >
                    <span class="self-loop-index">#{{ idx + 1 }}</span>
                    <span class="self-loop-name">{{ loop.name || loop.fact_type || 'RELATED' }}</span>
                    <span class="self-loop-toggle">{{ expandedSelfLoops.has(loop.uuid || idx) ? '−' : '+' }}</span>
                  </div>
                  
                  <div class="self-loop-item-content" v-show="expandedSelfLoops.has(loop.uuid || idx)">
                    <div class="detail-row" v-if="loop.uuid">
                      <span class="detail-label">UUID:</span>
                      <span class="detail-value uuid-text">{{ loop.uuid }}</span>
                    </div>
                    <div class="detail-row" v-if="loop.fact">
                      <span class="detail-label">Fact:</span>
                      <span class="detail-value fact-text">{{ loop.fact }}</span>
                    </div>
                    <div class="detail-row" v-if="loop.fact_type">
                      <span class="detail-label">Type:</span>
                      <span class="detail-value">{{ loop.fact_type }}</span>
                    </div>
                    <div class="detail-row" v-if="loop.created_at">
                      <span class="detail-label">Created:</span>
                      <span class="detail-value">{{ formatDateTime(loop.created_at) }}</span>
                    </div>
                    <div v-if="loop.episodes && loop.episodes.length > 0" class="self-loop-episodes">
                      <span class="detail-label">Episodes:</span>
                      <div class="episodes-list compact">
                        <span v-for="ep in loop.episodes" :key="ep" class="episode-tag small">{{ ep }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            
            <!-- Regular edge details -->
            <template v-else>
              <div class="edge-relation-header">
                {{ selectedItem.data.source_name }} → {{ selectedItem.data.name || 'RELATED_TO' }} → {{ selectedItem.data.target_name }}
              </div>
              
              <div class="detail-row">
                <span class="detail-label">UUID:</span>
                <span class="detail-value uuid-text">{{ selectedItem.data.uuid }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Label:</span>
                <span class="detail-value">{{ selectedItem.data.name || 'RELATED_TO' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">{{ selectedItem.data.fact_type || 'Unknown' }}</span>
              </div>
              <div class="detail-row" v-if="selectedItem.data.fact">
                <span class="detail-label">Fact:</span>
                <span class="detail-value fact-text">{{ selectedItem.data.fact }}</span>
              </div>
              
              <!-- Episodes -->
              <div class="detail-section" v-if="selectedItem.data.episodes && selectedItem.data.episodes.length > 0">
                <div class="section-title">Episodes:</div>
                <div class="episodes-list">
                  <span v-for="ep in selectedItem.data.episodes" :key="ep" class="episode-tag">
                    {{ ep }}
                  </span>
                </div>
              </div>
              
              <div class="detail-row" v-if="selectedItem.data.created_at">
                <span class="detail-label">Created:</span>
                <span class="detail-value">{{ formatDateTime(selectedItem.data.created_at) }}</span>
              </div>
              <div class="detail-row" v-if="selectedItem.data.valid_at">
                <span class="detail-label">Valid From:</span>
                <span class="detail-value">{{ formatDateTime(selectedItem.data.valid_at) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      
      <!-- Loading state -->
      <div v-else-if="loading" class="graph-state">
        <div class="loading-spinner"></div>
        <p>Loading graph data...</p>
      </div>
      
      <!-- Waiting/empty state -->
      <div v-else class="graph-state">
        <div class="empty-icon">❖</div>
        <p class="empty-text">Waiting for ontology generation...</p>
      </div>
    </div>

    <!-- Bottom Left Legend -->
    <div v-if="graphData && entityTypes.length" class="graph-legend">
      <span class="legend-title">Entity Types</span>
      <div class="legend-items">
        <div class="legend-item" v-for="type in entityTypes" :key="type.name">
          <span class="legend-dot" :style="{ background: type.color }"></span>
          <span class="legend-label">{{ type.name }}</span>
        </div>
      </div>
    </div>
    
    <!-- Show edge labels toggle -->
    <div v-if="graphData" class="edge-labels-toggle">
      <label class="toggle-switch">
        <input type="checkbox" v-model="showEdgeLabels" />
        <span class="slider"></span>
      </label>
      <span class="toggle-label">Show Edge Labels</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  graphData: Object,
  loading: Boolean,
  currentPhase: Number,
  isSimulating: Boolean
})

const emit = defineEmits(['refresh', 'toggle-maximize'])

const graphContainer = ref(null)
const graphSvg = ref(null)
const selectedItem = ref(null)
const showEdgeLabels = ref(true) // Show edge labels by default
const expandedSelfLoops = ref(new Set()) // Expanded self-loop items
const showSimulationFinishedHint = ref(false) // Post-simulation hint
const wasSimulating = ref(false) // Track whether was simulating before

// Dismiss post-simulation hint
const dismissFinishedHint = () => {
  showSimulationFinishedHint.value = false
}

// Watch isSimulating changes to detect simulation end
watch(() => props.isSimulating, (newValue, oldValue) => {
  if (wasSimulating.value && !newValue) {
    // Changed from simulating to non-simulating, show end hint
    showSimulationFinishedHint.value = true
  }
  wasSimulating.value = newValue
}, { immediate: true })

// Toggle self-loop expand/collapse state
const toggleSelfLoop = (id) => {
  const newSet = new Set(expandedSelfLoops.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  expandedSelfLoops.value = newSet
}

// Compute entity types for legend
const entityTypes = computed(() => {
  if (!props.graphData?.nodes) return []
  const typeMap = {}
  // Aesthetic color palette
  const colors = ['#FF6B35', '#004E89', '#7B2D8E', '#1A936F', '#C5283D', '#E9724C', '#3498db', '#9b59b6', '#27ae60', '#f39c12']
  
  props.graphData.nodes.forEach(node => {
    const type = node.labels?.find(l => l !== 'Entity') || 'Entity'
    if (!typeMap[type]) {
      typeMap[type] = { name: type, count: 0, color: colors[Object.keys(typeMap).length % colors.length] }
    }
    typeMap[type].count++
  })
  return Object.values(typeMap)
})

// Format datetime
const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    })
  } catch {
    return dateStr
  }
}

const closeDetailPanel = () => {
  selectedItem.value = null
  expandedSelfLoops.value = new Set() // Reset expanded state
}

let currentSimulation = null
let linkLabelsRef = null
let linkLabelBgRef = null

const renderGraph = () => {
  if (!graphSvg.value || !props.graphData) return
  
  // Stop previous simulation
  if (currentSimulation) {
    currentSimulation.stop()
  }
  
  const container = graphContainer.value
  const width = container.clientWidth
  const height = container.clientHeight
  
  const svg = d3.select(graphSvg.value)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    
  svg.selectAll('*').remove()
  
  const nodesData = props.graphData.nodes || []
  const edgesData = props.graphData.edges || []
  
  if (nodesData.length === 0) return

  // Prep data
  const nodeMap = {}
  nodesData.forEach(n => nodeMap[n.uuid] = n)
  
  const nodes = nodesData.map(n => ({
    id: n.uuid,
    name: n.name || 'Unnamed',
    type: n.labels?.find(l => l !== 'Entity') || 'Entity',
    rawData: n
  }))
  
  const nodeIds = new Set(nodes.map(n => n.id))
  
  // Process edge data, calculate edge count and index per node pair
  const edgePairCount = {}
  const selfLoopEdges = {} // Self-loop edges grouped by node
  const tempEdges = edgesData
    .filter(e => nodeIds.has(e.source_node_uuid) && nodeIds.has(e.target_node_uuid))
  
  // Count edges per node pair, collect self-loop edges
  tempEdges.forEach(e => {
    if (e.source_node_uuid === e.target_node_uuid) {
      // Self-loop - collect into array
      if (!selfLoopEdges[e.source_node_uuid]) {
        selfLoopEdges[e.source_node_uuid] = []
      }
      selfLoopEdges[e.source_node_uuid].push({
        ...e,
        source_name: nodeMap[e.source_node_uuid]?.name,
        target_name: nodeMap[e.target_node_uuid]?.name
      })
    } else {
      const pairKey = [e.source_node_uuid, e.target_node_uuid].sort().join('_')
      edgePairCount[pairKey] = (edgePairCount[pairKey] || 0) + 1
    }
  })
  
  // Track current edge index for each node pair
  const edgePairIndex = {}
  const processedSelfLoopNodes = new Set() // Processed self-loop nodes
  
  const edges = []
  
  tempEdges.forEach(e => {
    const isSelfLoop = e.source_node_uuid === e.target_node_uuid
    
    if (isSelfLoop) {
      // Self-loop edge - add only one merged self-loop per node
      if (processedSelfLoopNodes.has(e.source_node_uuid)) {
        return // Already processed, skip
      }
      processedSelfLoopNodes.add(e.source_node_uuid)
      
      const allSelfLoops = selfLoopEdges[e.source_node_uuid]
      const nodeName = nodeMap[e.source_node_uuid]?.name || 'Unknown'
      
      edges.push({
        source: e.source_node_uuid,
        target: e.target_node_uuid,
        type: 'SELF_LOOP',
        name: `Self Relations (${allSelfLoops.length})`,
        curvature: 0,
        isSelfLoop: true,
        rawData: {
          isSelfLoopGroup: true,
          source_name: nodeName,
          target_name: nodeName,
          selfLoopCount: allSelfLoops.length,
          selfLoopEdges: allSelfLoops // Store all self-loop edge details
        }
      })
      return
    }
    
    const pairKey = [e.source_node_uuid, e.target_node_uuid].sort().join('_')
    const totalCount = edgePairCount[pairKey]
    const currentIndex = edgePairIndex[pairKey] || 0
    edgePairIndex[pairKey] = currentIndex + 1
    
    // Check if edge direction matches normalized direction (source UUID < target UUID)
    const isReversed = e.source_node_uuid > e.target_node_uuid
    
    // Calculate curvature: spread multiple edges, single edge is straight
    let curvature = 0
    if (totalCount > 1) {
      // Distribute curvature evenly for clear distinction
      // Curvature range increases with edge count, more edges = larger range
      const curvatureRange = Math.min(1.2, 0.6 + totalCount * 0.15)
      curvature = ((currentIndex / (totalCount - 1)) - 0.5) * curvatureRange * 2
      
      // If edge direction is reversed from normalized, flip curvature
      // This ensures all edges distribute in the same reference frame without overlap
      if (isReversed) {
        curvature = -curvature
      }
    }
    
    edges.push({
      source: e.source_node_uuid,
      target: e.target_node_uuid,
      type: e.fact_type || e.name || 'RELATED',
      name: e.name || e.fact_type || 'RELATED',
      curvature,
      isSelfLoop: false,
      pairIndex: currentIndex,
      pairTotal: totalCount,
      rawData: {
        ...e,
        source_name: nodeMap[e.source_node_uuid]?.name,
        target_name: nodeMap[e.target_node_uuid]?.name
      }
    })
  })
    
  // Color scale
  const colorMap = {}
  entityTypes.value.forEach(t => colorMap[t.name] = t.color)
  const getColor = (type) => colorMap[type] || '#737373'

  // Simulation - dynamically adjust node spacing based on edge count
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(d => {
      // Dynamically adjust distance based on edge count between this node pair
      // Base distance 150, add 40 per additional edge
      const baseDistance = 150
      const edgeCount = d.pairTotal || 1
      return baseDistance + (edgeCount - 1) * 50
    }))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(50))
    // Add center gravity to pull isolated node clusters toward center
    .force('x', d3.forceX(width / 2).strength(0.04))
    .force('y', d3.forceY(height / 2).strength(0.04))
  
  currentSimulation = simulation

  const g = svg.append('g')
  
  // Zoom
  svg.call(d3.zoom().extent([[0, 0], [width, height]]).scaleExtent([0.1, 4]).on('zoom', (event) => {
    g.attr('transform', event.transform)
  }))

  // Links - use path for curved lines
  const linkGroup = g.append('g').attr('class', 'links')
  
  // Calculate curved path
  const getLinkPath = (d) => {
    const sx = d.source.x, sy = d.source.y
    const tx = d.target.x, ty = d.target.y
    
    // Detect self-loop
    if (d.isSelfLoop) {
      // Self-loop: draw an arc from node back to itself
      const loopRadius = 30
      // Start from right side of node, loop back
      const x1 = sx + 8  // Start offset
      const y1 = sy - 4
      const x2 = sx + 8  // End offset
      const y2 = sy + 4
      // Draw self-loop using arc (sweep-flag=1 clockwise)
      return `M${x1},${y1} A${loopRadius},${loopRadius} 0 1,1 ${x2},${y2}`
    }
    
    if (d.curvature === 0) {
      // Straight line
      return `M${sx},${sy} L${tx},${ty}`
    }
    
    // Calculate curve control point - dynamically adjust based on edge count and distance
    const dx = tx - sx, dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Perpendicular offset from line direction, calculated by distance ratio to ensure curves are visible
    // More edges = higher proportion of distance as offset
    const pairTotal = d.pairTotal || 1
    const offsetRatio = 0.25 + pairTotal * 0.05 // Base 25%, add 5% per additional edge
    const baseOffset = Math.max(35, dist * offsetRatio)
    const offsetX = -dy / dist * d.curvature * baseOffset
    const offsetY = dx / dist * d.curvature * baseOffset
    const cx = (sx + tx) / 2 + offsetX
    const cy = (sy + ty) / 2 + offsetY
    
    return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
  }
  
  // Calculate curve midpoint (for label positioning)
  const getLinkMidpoint = (d) => {
    const sx = d.source.x, sy = d.source.y
    const tx = d.target.x, ty = d.target.y
    
    // Detect self-loop
    if (d.isSelfLoop) {
      // Self-loop label position: right of node
      return { x: sx + 70, y: sy }
    }
    
    if (d.curvature === 0) {
      return { x: (sx + tx) / 2, y: (sy + ty) / 2 }
    }
    
    // Quadratic Bezier curve midpoint at t=0.5
    const dx = tx - sx, dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const pairTotal = d.pairTotal || 1
    const offsetRatio = 0.25 + pairTotal * 0.05
    const baseOffset = Math.max(35, dist * offsetRatio)
    const offsetX = -dy / dist * d.curvature * baseOffset
    const offsetY = dx / dist * d.curvature * baseOffset
    const cx = (sx + tx) / 2 + offsetX
    const cy = (sy + ty) / 2 + offsetY
    
    // Quadratic Bezier curve formula B(t) = (1-t)^2*P0 + 2(1-t)tP1 + t^2*P2, t=0.5
    const midX = 0.25 * sx + 0.5 * cx + 0.25 * tx
    const midY = 0.25 * sy + 0.5 * cy + 0.25 * ty
    
    return { x: midX, y: midY }
  }
  
  const link = linkGroup.selectAll('path')
    .data(edges)
    .enter().append('path')
    .attr('stroke', '#C0C0C0')
    .attr('stroke-width', 1.5)
    .attr('fill', 'none')
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation()
      // Reset previously selected edge styles
      linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5)
      linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
      linkLabels.attr('fill', 'var(--text-dim)')
      // Highlight currently selected edge
      d3.select(event.target).attr('stroke', '#3498db').attr('stroke-width', 3)
      
      selectedItem.value = {
        type: 'edge',
        data: d.rawData
      }
    })

  // Link labels background (white background for clearer text)
  const linkLabelBg = linkGroup.selectAll('rect')
    .data(edges)
    .enter().append('rect')
    .attr('fill', 'rgba(255,255,255,0.95)')
    .attr('rx', 3)
    .attr('ry', 3)
    .style('cursor', 'pointer')
    .style('pointer-events', 'all')
    .style('display', showEdgeLabels.value ? 'block' : 'none')
    .on('click', (event, d) => {
      event.stopPropagation()
      linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5)
      linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
      linkLabels.attr('fill', 'var(--text-dim)')
      // Highlight the corresponding edge
      link.filter(l => l === d).attr('stroke', '#3498db').attr('stroke-width', 3)
      d3.select(event.target).attr('fill', 'rgba(52, 152, 219, 0.1)')
      
      selectedItem.value = {
        type: 'edge',
        data: d.rawData
      }
    })

  // Link labels
  const linkLabels = linkGroup.selectAll('text')
    .data(edges)
    .enter().append('text')
    .text(d => d.name)
    .attr('font-size', '9px')
    .attr('fill', '#666')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .style('cursor', 'pointer')
    .style('pointer-events', 'all')
    .style('font-family', 'system-ui, sans-serif')
    .style('display', showEdgeLabels.value ? 'block' : 'none')
    .on('click', (event, d) => {
      event.stopPropagation()
      linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5)
      linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
      linkLabels.attr('fill', 'var(--text-dim)')
      // Highlight the corresponding edge
      link.filter(l => l === d).attr('stroke', '#3498db').attr('stroke-width', 3)
      d3.select(event.target).attr('fill', '#3498db')
      
      selectedItem.value = {
        type: 'edge',
        data: d.rawData
      }
    })
  
  // Save refs for external show/hide control
  linkLabelsRef = linkLabels
  linkLabelBgRef = linkLabelBg

  // Nodes group
  const nodeGroup = g.append('g').attr('class', 'nodes')
  
  // Node circles
  const node = nodeGroup.selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('r', 10)
    .attr('fill', d => getColor(d.type))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2.5)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (event, d) => {
        // Only record position, do not restart simulation (distinguish click from drag)
        d.fx = d.x
        d.fy = d.y
        d._dragStartX = event.x
        d._dragStartY = event.y
        d._isDragging = false
      })
      .on('drag', (event, d) => {
        // Detect actual drag start (movement beyond threshold)
        const dx = event.x - d._dragStartX
        const dy = event.y - d._dragStartY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (!d._isDragging && distance > 3) {
          // Only restart simulation when actual drag is detected
          d._isDragging = true
          simulation.alphaTarget(0.3).restart()
        }
        
        if (d._isDragging) {
          d.fx = event.x
          d.fy = event.y
        }
      })
      .on('end', (event, d) => {
        // Only let simulation slow down if actually dragged
        if (d._isDragging) {
          simulation.alphaTarget(0)
        }
        d.fx = null
        d.fy = null
        d._isDragging = false
      })
    )
    .on('click', (event, d) => {
      event.stopPropagation()
      // Reset all node styles
      node.attr('stroke', '#fff').attr('stroke-width', 2.5)
      linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5)
      // Highlight selected node
      d3.select(event.target).attr('stroke', '#E91E63').attr('stroke-width', 4)
      // Highlight edges connected to this node
      link.filter(l => l.source.id === d.id || l.target.id === d.id)
        .attr('stroke', '#E91E63')
        .attr('stroke-width', 2.5)
      
      selectedItem.value = {
        type: 'node',
        data: d.rawData,
        entityType: d.type,
        color: getColor(d.type)
      }
    })
    .on('mouseenter', (event, d) => {
      if (!selectedItem.value || selectedItem.value.data?.uuid !== d.rawData.uuid) {
        d3.select(event.target).attr('stroke', '#D4D4D4').attr('stroke-width', 3)
      }
    })
    .on('mouseleave', (event, d) => {
      if (!selectedItem.value || selectedItem.value.data?.uuid !== d.rawData.uuid) {
        d3.select(event.target).attr('stroke', '#fff').attr('stroke-width', 2.5)
      }
    })

  // Node Labels
  const nodeLabels = nodeGroup.selectAll('text')
    .data(nodes)
    .enter().append('text')
    .text(d => d.name.length > 8 ? d.name.substring(0, 8) + '…' : d.name)
    .attr('font-size', '11px')
    .attr('fill', '#D4D4D4')
    .attr('font-weight', '500')
    .attr('dx', 14)
    .attr('dy', 4)
    .style('pointer-events', 'none')
    .style('font-family', 'system-ui, sans-serif')

  simulation.on('tick', () => {
    // Update curved paths
    link.attr('d', d => getLinkPath(d))
    
    // Update edge label positions (no rotation, horizontal is clearer)
    linkLabels.each(function(d) {
      const mid = getLinkMidpoint(d)
      d3.select(this)
        .attr('x', mid.x)
        .attr('y', mid.y)
        .attr('transform', '') // Remove rotation, keep horizontal
    })
    
    // Update edge label backgrounds
    linkLabelBg.each(function(d, i) {
      const mid = getLinkMidpoint(d)
      const textEl = linkLabels.nodes()[i]
      const bbox = textEl.getBBox()
      d3.select(this)
        .attr('x', mid.x - bbox.width / 2 - 4)
        .attr('y', mid.y - bbox.height / 2 - 2)
        .attr('width', bbox.width + 8)
        .attr('height', bbox.height + 4)
        .attr('transform', '') // Remove rotation
    })

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)

    nodeLabels
      .attr('x', d => d.x)
      .attr('y', d => d.y)
  })
  
  // Click blank area to close detail panel
  svg.on('click', () => {
    selectedItem.value = null
    node.attr('stroke', '#fff').attr('stroke-width', 2.5)
    linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5)
    linkLabelBg.attr('fill', 'rgba(255,255,255,0.95)')
    linkLabels.attr('fill', '#666')
  })
}

watch(() => props.graphData, () => {
  nextTick(renderGraph)
}, { deep: true })

// Watch edge label show/hide toggle
watch(showEdgeLabels, (newVal) => {
  if (linkLabelsRef) {
    linkLabelsRef.style('display', newVal ? 'block' : 'none')
  }
  if (linkLabelBgRef) {
    linkLabelBgRef.style('display', newVal ? 'block' : 'none')
  }
})

const handleResize = () => {
  nextTick(renderGraph)
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (currentSimulation) {
    currentSimulation.stop()
  }
})
</script>

<style scoped>
.graph-panel {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--bg);
  background-image: radial-gradient(var(--text-faint) 1px, transparent 1px);
  background-size: 24px 24px;
  overflow: hidden;
  font-family: var(--font-mono);
}

.panel-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: var(--space-3) var(--space-4);
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, var(--bg) 60%, transparent);
  pointer-events: none;
}

.panel-title {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  pointer-events: auto;
}

.header-tools {
  pointer-events: auto;
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.tool-btn {
  height: 28px;
  padding: 0 var(--space-3);
  border: var(--border);
  background: var(--bg-raised);
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  cursor: pointer;
  color: var(--text-dim);
  transition: all var(--transition-fast);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
}

.tool-btn:hover {
  background: var(--bg-surface);
  color: var(--text);
  border-color: var(--text-dim);
}

.tool-btn .btn-text {
  font-size: var(--font-size-xs);
}

.icon-refresh.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.graph-container {
  width: 100%;
  height: 100%;
}

.graph-view, .graph-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.graph-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.2;
}

/* Entity Types Legend - Bottom Left */
.graph-legend {
  position: absolute;
  bottom: var(--space-6);
  left: var(--space-6);
  background: var(--bg-raised);
  padding: var(--space-3) var(--space-4);
  border-radius: 0;
  border: var(--border);
  z-index: 10;
  font-family: var(--font-mono);
}

.legend-title {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--accent);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  max-width: 320px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-dim);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  white-space: nowrap;
}

/* Edge Labels Toggle - Top Right */
.edge-labels-toggle {
  position: absolute;
  top: 60px;
  right: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg-raised);
  padding: var(--space-2) var(--space-3);
  border-radius: 0;
  border: var(--border);
  z-index: 10;
  font-family: var(--font-mono);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--text-faint);
  border-radius: 0;
  transition: 0.3s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: var(--text);
  border-radius: 0;
  transition: 0.3s;
}

input:checked + .slider {
  background-color: var(--accent-dim);
}

input:checked + .slider:before {
  transform: translateX(18px);
}

.toggle-label {
  font-size: var(--font-size-xs);
  color: var(--text-dim);
}

/* Detail Panel - Right Side */
.detail-panel {
  position: absolute;
  top: 60px;
  right: var(--space-4);
  width: 320px;
  max-height: calc(100% - 100px);
  background: var(--bg-raised);
  border: var(--border);
  border-radius: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  z-index: 20;
  display: flex;
  flex-direction: column;
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-surface);
  border-bottom: var(--border);
  flex-shrink: 0;
}

.detail-title {
  font-weight: 700;
  color: var(--text);
  font-size: var(--font-size-sm);
}

.detail-type-badge {
  padding: 2px var(--space-2);
  border-radius: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  margin-left: auto;
  margin-right: var(--space-3);
  border: var(--border-accent);
  color: var(--accent);
}

.detail-close {
  background: none;
  border: none;
  font-size: var(--font-size-lg);
  cursor: pointer;
  color: var(--text-faint);
  line-height: 1;
  padding: 0;
  transition: color var(--transition-fast);
}

.detail-close:hover {
  color: var(--text);
}

.detail-content {
  padding: var(--space-4);
  overflow-y: auto;
  flex: 1;
}

.detail-row {
  margin-bottom: var(--space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.detail-label {
  color: var(--text-dim);
  font-size: var(--font-size-xs);
  font-weight: 700;
  min-width: 80px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  color: var(--text);
  flex: 1;
  word-break: break-word;
}

.detail-value.uuid-text {
  font-size: var(--font-size-xs);
  color: var(--text-dim);
}

.detail-value.fact-text {
  line-height: 1.5;
  color: var(--text-dim);
}

.detail-section {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: var(--border);
}

.section-title {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--text-dim);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.properties-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.property-item {
  display: flex;
  gap: var(--space-2);
}

.property-key {
  color: var(--text-dim);
  font-weight: 700;
  min-width: 90px;
  font-size: var(--font-size-xs);
}

.property-value {
  color: var(--text);
  flex: 1;
}

.summary-text {
  line-height: 1.6;
  color: var(--text-dim);
  font-size: var(--font-size-xs);
}

.labels-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.label-tag {
  display: inline-block;
  padding: 2px var(--space-2);
  background: var(--bg-surface);
  border: var(--border);
  border-radius: 0;
  font-size: var(--font-size-xs);
  color: var(--text-dim);
}

.episodes-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.episode-tag {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  background: var(--bg-surface);
  border: var(--border);
  border-radius: 0;
  font-size: var(--font-size-xs);
  color: var(--text-dim);
  word-break: break-all;
}

/* Edge relation header */
.edge-relation-header {
  background: var(--bg-surface);
  padding: var(--space-3);
  border-radius: 0;
  margin-bottom: var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
  border: var(--border);
}

/* Building hint */
.graph-building-hint {
  position: absolute;
  bottom: 160px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-raised);
  color: var(--text);
  padding: var(--space-2) var(--space-4);
  border-radius: 0;
  font-size: var(--font-size-xs);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: var(--border-accent);
  font-weight: 400;
  letter-spacing: 0.05em;
  z-index: 100;
  font-family: var(--font-mono);
}

.memory-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: breathe 2s ease-in-out infinite;
}

.memory-icon {
  width: 18px;
  height: 18px;
  color: var(--success);
}

@keyframes breathe {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

/* Post-simulation hint styles */
.graph-building-hint.finished-hint {
  background: var(--bg-raised);
  border: var(--border);
}

.finished-hint .hint-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.finished-hint .hint-icon {
  width: 18px;
  height: 18px;
  color: var(--text);
}

.finished-hint .hint-text {
  flex: 1;
  white-space: nowrap;
}

.hint-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: var(--bg-surface);
  border: var(--border);
  border-radius: 0;
  cursor: pointer;
  color: var(--text-dim);
  transition: all var(--transition-fast);
  margin-left: var(--space-2);
  flex-shrink: 0;
}

.hint-close-btn:hover {
  background: var(--bg-surface);
  color: var(--text);
}

/* Loading spinner */
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 2px solid var(--text-faint);
  border-top-color: var(--accent);
  border-radius: 0;
  animation: spin 1s linear infinite;
  margin: 0 auto var(--space-4);
}

/* Self-loop styles */
.self-loop-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg-surface);
  border: var(--border);
}

.self-loop-count {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--text-dim);
  background: var(--bg-raised);
  padding: 2px var(--space-2);
}

.self-loop-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.self-loop-item {
  background: var(--bg-raised);
  border: var(--border);
}

.self-loop-item-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.self-loop-item-header:hover {
  background: var(--text-faint);
}

.self-loop-item.expanded .self-loop-item-header {
  background: var(--bg-surface);
}

.self-loop-index {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--text-dim);
  background: var(--text-faint);
  padding: 1px var(--space-1);
}

.self-loop-name {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--text);
  flex: 1;
}

.self-loop-toggle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-dim);
  background: var(--text-faint);
  transition: all var(--transition-fast);
}

.self-loop-item.expanded .self-loop-toggle {
  background: var(--text-dim);
  color: var(--text);
}

.self-loop-item-content {
  padding: var(--space-3);
  border-top: var(--border);
}

.self-loop-item-content .detail-row {
  margin-bottom: var(--space-2);
}

.self-loop-item-content .detail-label {
  font-size: var(--font-size-xs);
  min-width: 60px;
}

.self-loop-item-content .detail-value {
  font-size: var(--font-size-xs);
}

.self-loop-episodes {
  margin-top: var(--space-2);
}

.episodes-list.compact {
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.episode-tag.small {
  padding: 2px var(--space-1);
  font-size: var(--font-size-xs);
}
</style>
