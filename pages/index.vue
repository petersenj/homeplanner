<script setup lang="ts">
type Point = { x: number; y: number }
type FurnitureKind = 'chair' | 'table' | 'cupboard' | 'shelf' | 'cube' | 'window' | 'door'
type PlanItem = {
  id: number
  kind: FurnitureKind
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation: number
  name?: string
  color?: string
}
type Wall = { id: number; start: Point; end: Point }
type Measurement = { id: number; start: Point; end: Point }

const SCALE = 100
const VIEW_WIDTH = 960
const VIEW_HEIGHT = 680
const room = { x: 125, y: 95, width: 650, height: 480 }
const view = ref<'2d' | '3d'>('2d')
const activeTool = ref<'select' | 'wall' | 'measure' | 'window' | 'door' | 'cube' | 'furniture'>('select')
const selectedCategory = ref('All items')
const selectedId = ref<number | null>(null)
const pendingPoint = ref<Point | null>(null)
const zoom = ref(1)
const wallSegments = ref<Wall[]>([])
const measurements = ref<Measurement[]>([])
const nextId = ref(10)
const showGrid = ref(true)
const showDimensions = ref(true)
const sidebarOpen = ref(true)
const isDragging = ref(false)
const items = ref<PlanItem[]>([
  { id: 1, kind: 'table', x: 395, y: 305, width: 150, depth: 90, height: 75, rotation: 0 },
  { id: 2, kind: 'chair', x: 345, y: 280, width: 48, depth: 48, height: 88, rotation: 0 },
  { id: 3, kind: 'chair', x: 545, y: 280, width: 48, depth: 48, height: 88, rotation: 0 },
  { id: 4, kind: 'chair', x: 345, y: 385, width: 48, depth: 48, height: 88, rotation: 180 },
  { id: 5, kind: 'chair', x: 545, y: 385, width: 48, depth: 48, height: 88, rotation: 180 },
  { id: 6, kind: 'cupboard', x: 220, y: 140, width: 130, depth: 48, height: 190, rotation: 0 },
  { id: 7, kind: 'shelf', x: 700, y: 240, width: 42, depth: 150, height: 175, rotation: 0 },
])

const catalog = [
  { kind: 'chair' as const, label: 'Chair', detail: '48 × 48 cm', icon: 'chair' },
  { kind: 'table' as const, label: 'Table', detail: '150 × 90 cm', icon: 'table' },
  { kind: 'cupboard' as const, label: 'Cupboard', detail: '130 × 48 cm', icon: 'cupboard' },
  { kind: 'shelf' as const, label: 'Shelf', detail: '42 × 150 cm', icon: 'shelf' },
]
const categoryItems = computed(() => selectedCategory.value === 'All items'
  ? catalog
  : catalog)
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
const placedCount = computed(() => items.value.length)
const totalArea = ((room.width / SCALE) * (room.height / SCALE)).toFixed(1)
const planViewBox = computed(() => {
  const width = VIEW_WIDTH / zoom.value
  const height = VIEW_HEIGHT / zoom.value
  return `${(VIEW_WIDTH - width) / 2} ${(VIEW_HEIGHT - height) / 2} ${width} ${height}`
})

function dimensions(kind: FurnitureKind) {
  const sizes: Record<FurnitureKind, [number, number, number]> = {
    chair: [48, 48, 88],
    table: [150, 90, 75],
    cupboard: [130, 48, 190],
    shelf: [42, 150, 175],
    cube: [80, 80, 80],
    window: [110, 12, 130],
    door: [90, 15, 205],
  }
  return sizes[kind]
}

function addItem(kind: FurnitureKind, at?: Point) {
  const [width, depth, height] = dimensions(kind)
  const id = nextId.value++
  const defaultPoint = kind === 'window'
    ? { x: room.x + room.width / 2, y: room.y + 15 }
    : kind === 'door'
      ? { x: room.x + room.width - 15, y: room.y + room.height * 0.72 }
      : { x: room.x + room.width / 2, y: room.y + room.height / 2 }
  const item: PlanItem = {
    id,
    kind,
    x: at?.x ?? defaultPoint.x,
    y: at?.y ?? defaultPoint.y,
    width,
    depth,
    height,
    rotation: kind === 'door' ? 90 : 0,
  }
  items.value.push(item)
  selectedId.value = id
  activeTool.value = 'select'
  pendingPoint.value = null
}

function selectTool(tool: typeof activeTool.value) {
  activeTool.value = tool
  pendingPoint.value = null
  selectedId.value = null
}

function svgPoint(event: MouseEvent): Point {
  const svg = event.currentTarget as SVGSVGElement
  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: room.x + room.width / 2, y: room.y + room.height / 2 }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

function onCanvasClick(event: MouseEvent) {
  if ((event.target as Element).closest('.plan-item')) return
  const point = svgPoint(event)
  if (activeTool.value === 'wall') {
    if (!pendingPoint.value) pendingPoint.value = point
    else {
      wallSegments.value.push({ id: nextId.value++, start: pendingPoint.value, end: point })
      pendingPoint.value = null
    }
    return
  }
  if (activeTool.value === 'measure') {
    if (!pendingPoint.value) pendingPoint.value = point
    else {
      measurements.value.push({ id: nextId.value++, start: pendingPoint.value, end: point })
      pendingPoint.value = null
    }
    return
  }
  if (activeTool.value === 'window' || activeTool.value === 'door' || activeTool.value === 'cube') {
    addItem(activeTool.value, point)
    return
  }
  selectedId.value = null
}

function itemClick(event: MouseEvent, item: PlanItem) {
  event.stopPropagation()
  selectedId.value = item.id
  if (activeTool.value !== 'select') return
  isDragging.value = true
}

function onCanvasMove(event: MouseEvent) {
  if (!isDragging.value || selectedId.value === null) return
  const point = svgPoint(event)
  const item = items.value.find((entry) => entry.id === selectedId.value)
  if (item) {
    item.x = Math.max(room.x + 18, Math.min(room.x + room.width - 18, point.x))
    item.y = Math.max(room.y + 18, Math.min(room.y + room.height - 18, point.y))
  }
}

function stopDragging() {
  isDragging.value = false
}

function addCatalogItem(kind: FurnitureKind) {
  addItem(kind)
}

function removeSelected() {
  if (selectedId.value === null) return
  items.value = items.value.filter((item) => item.id !== selectedId.value)
  selectedId.value = null
}

function rotateSelected() {
  if (selectedItem.value) selectedItem.value.rotation = (selectedItem.value.rotation + 90) % 360
}

function changeZoom(amount: number) {
  zoom.value = Math.min(2.5, Math.max(0.5, Math.round((zoom.value + amount) * 10) / 10))
}

function exportPlan() {
  const plan = {
    name: 'Living room',
    units: 'cm',
    room: { width: room.width, depth: room.height },
    items: items.value,
    walls: wallSegments.value,
    measurements: measurements.value,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'living-room-plan.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatLength(start: Point, end: Point) {
  const meters = Math.hypot(end.x - start.x, end.y - start.y) / SCALE
  return `${meters.toFixed(2)} m`
}

function itemColor(kind: FurnitureKind) {
  const colors: Record<FurnitureKind, string> = {
    chair: '#c98d65', table: '#b28a63', cupboard: '#818d77', shelf: '#a88c72',
    cube: '#8097a8', window: '#77b9c1', door: '#c98d65',
  }
  return colors[kind]
}

function itemLabel(kind: FurnitureKind) {
  return catalog.find((entry) => entry.kind === kind)?.label ?? (kind === 'cube' ? 'Cube' : kind[0].toUpperCase() + kind.slice(1))
}

function projected(x: number, y: number, z = 0): Point {
  return { x: 480 + (x - y) * 0.62, y: 140 + (x + y) * 0.32 - z }
}

function polygon(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function isoBox(item: PlanItem) {
  const rad = item.rotation * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const corners = [
    [-item.width / 2, -item.depth / 2],
    [item.width / 2, -item.depth / 2],
    [item.width / 2, item.depth / 2],
    [-item.width / 2, item.depth / 2],
  ].map(([x, y]) => ({
    x: item.x + (x ?? 0) * cos - (y ?? 0) * sin,
    y: item.y + (x ?? 0) * sin + (y ?? 0) * cos,
  }))
  const bottom = corners.map((point) => projected(point.x, point.y))
  const top = corners.map((point) => projected(point.x, point.y, item.height))
  return { bottom, top }
}

function itemFootprint(item: PlanItem) {
  const box = isoBox(item)
  return polygon(box.bottom)
}

function clearPlan() {
  if (!window.confirm('Start a new empty room plan? This will remove all placed items, walls, and measurements.')) return
  items.value = []
  wallSegments.value = []
  measurements.value = []
  selectedId.value = null
}

onMounted(() => {
  window.addEventListener('mouseup', stopDragging)
  const savedPlan = window.localStorage.getItem('roomwise-plan-v1')
  if (savedPlan) {
    try {
      const plan = JSON.parse(savedPlan) as { items?: PlanItem[]; walls?: Wall[]; measurements?: Measurement[] }
      if (Array.isArray(plan.items) && Array.isArray(plan.walls) && Array.isArray(plan.measurements)) {
        items.value = plan.items
        wallSegments.value = plan.walls
        measurements.value = plan.measurements
        nextId.value = Math.max(10, ...items.value.map((item) => item.id + 1), ...wallSegments.value.map((wall) => wall.id + 1), ...measurements.value.map((measurement) => measurement.id + 1))
      } else {
        console.warn('Saved room plan has an invalid structure and was not restored.')
      }
    } catch (error) {
      console.error('Could not restore the saved room plan.', error)
    }
  }
})
onBeforeUnmount(() => window.removeEventListener('mouseup', stopDragging))
watch([items, wallSegments, measurements], () => {
  if (import.meta.client) {
    window.localStorage.setItem('roomwise-plan-v1', JSON.stringify({
      items: items.value,
      walls: wallSegments.value,
      measurements: measurements.value,
    }))
  }
}, { deep: true })
</script>

<template>
  <main class="app-shell">
    <aside v-if="sidebarOpen" class="sidebar">
      <a class="brand" href="#" aria-label="Roomwise home">
        <span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 15.5 16 6l11 9.5v10H5v-10Z"/><path d="M12 25.5v-8h8v8"/></svg></span>
        <span>roomwise<span class="brand-period">.</span><small>YOUR SPACE, REIMAGINED</small></span>
      </a>
      <div class="sidebar-scroll">
        <div class="sidebar-section project-section">
          <div class="section-eyebrow">YOUR PROJECT</div>
          <button class="project-select"><span class="project-avatar">M</span><span class="project-copy"><strong>My apartment</strong><small>Living room</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
        </div>

        <div class="sidebar-section room-section">
          <div class="section-heading"><span class="section-eyebrow">ROOMS</span>          <button class="icon-button add-room" aria-label="Start new room" title="Start new room" @click="clearPlan">+</button></div>
          <button class="room-row active-room"><span class="room-dot"></span><span>Living room</span><span class="room-area">{{ totalArea }} m²</span></button>
          <button class="room-row muted-room" @click="clearPlan"><span class="room-dot empty-dot"></span><span>+ Start new room</span></button>
        </div>

        <div class="sidebar-section furniture-section">
          <div class="section-heading"><span class="section-eyebrow">FURNITURE & OBJECTS</span><span class="count-pill">{{ placedCount }}</span></div>
          <div class="category-switcher">
            <button v-for="category in ['All items', 'Furniture']" :key="category" :class="{ active: selectedCategory === category }" @click="selectedCategory = category">{{ category }}</button>
          </div>
          <div class="catalog-grid">
            <button v-for="entry in categoryItems" :key="entry.kind" class="catalog-card" @click="addCatalogItem(entry.kind)">
              <span class="catalog-icon" :class="`icon-${entry.icon}`">
                <svg v-if="entry.kind === 'chair'" viewBox="0 0 42 42"><path d="M13 11h16v13H13zM11 24h20v4H11zM14 28l-2 8m16-8 2 8M13 18H9v7m20-7h4v7"/></svg>
                <svg v-else-if="entry.kind === 'table'" viewBox="0 0 42 42"><path d="M8 15h26v4H8zm4 4v14m18-14v14M7 33h28"/></svg>
                <svg v-else-if="entry.kind === 'cupboard'" viewBox="0 0 42 42"><path d="M11 7h20v29H11zm10 0v29m-7-17h2m8 0h2M8 36h26"/></svg>
                <svg v-else viewBox="0 0 42 42"><path d="M11 7h20v29H11zm-3 9h26m-26 9h26m-26 9h26M14 11h3m8 0h3m-14 9h3m8 0h3m-14 9h3m8 0h3"/></svg>
              </span>
              <strong>{{ entry.label }}</strong><small>{{ entry.detail }}</small>
              <span class="catalog-plus">+</span>
            </button>
          </div>
          <div class="section-heading geometry-heading"><span class="section-eyebrow">GEOMETRY</span><span class="new-pill">NEW</span></div>
          <button class="geometry-card" @click="selectTool('cube')"><span class="cube-icon">◇</span><span><strong>Cube</strong><small>Custom-sized object</small></span><span class="geometry-plus">+</span></button>
          <div class="structure-heading">WALL DETAILS</div>
          <button class="geometry-card" @click="addItem('window')"><span class="detail-icon window-detail">↔</span><span><strong>Window</strong><small>110 × 12 cm</small></span><span class="geometry-plus">+</span></button>
          <button class="geometry-card structure-card" @click="addItem('door')"><span class="detail-icon door-detail">⌒</span><span><strong>Door</strong><small>90 × 15 cm</small></span><span class="geometry-plus">+</span></button>
          <div class="import-card import-planned" aria-disabled="true"><span class="import-icon">↥</span><span><strong>Import 3D model</strong><small>Model import coming soon</small></span></div>
        </div>

        <div class="sidebar-section list-section">
          <div class="section-heading"><span class="section-eyebrow">IN YOUR ROOM</span><span class="count-text">{{ placedCount }} items</span></div>
          <button v-for="item in items.slice(0, 5)" :key="item.id" class="placed-row" :class="{ 'placed-active': selectedId === item.id }" @click="selectedId = item.id">
            <span class="placed-dot" :style="{ background: item.color || itemColor(item.kind) }"></span><span>{{ item.name || itemLabel(item.kind) }}</span>
            <span class="placed-dim">{{ item.width }} × {{ item.depth }}</span>
          </button>
          <p v-if="items.length > 5" class="more-items">+ {{ items.length - 5 }} more in your room</p>
          <p v-if="!items.length" class="empty-items">Your room is ready for its first piece.</p>
        </div>
      </div>
      <div class="sidebar-bottom"><div class="avatar">J</div><span><strong>Jan's workspace</strong><small>Personal plan</small></span><button class="icon-button more-button" aria-label="More options">···</button></div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="breadcrumbs"><button class="mobile-menu icon-button" aria-label="Toggle sidebar" @click="sidebarOpen = !sidebarOpen">☰</button><span>My apartment</span><span class="crumb-divider">/</span><strong>Living room</strong><span class="saved-state"><span></span> All changes saved</span></div>
        <div class="top-actions">
          <button class="top-icon disabled-icon" title="Undo is not available yet" aria-label="Undo" disabled>↶</button><button class="top-icon disabled-icon" title="Redo is not available yet" aria-label="Redo" disabled>↷</button>
          <span class="action-divider"></span><button class="export-button" @click="exportPlan">Export JSON <span>↗</span></button>
        </div>
      </header>
      <div class="toolbar-row">
        <div class="view-switch"><button :class="{ selected: view === '2d' }" @click="view = '2d'"><span class="view-2d-icon">▦</span>2D plan</button><button :class="{ selected: view === '3d' }" @click="view = '3d'"><span class="view-3d-icon">◇</span>3D view</button></div>
        <div class="tool-actions">
          <span class="tool-hint" v-if="activeTool === 'wall'">Click two points to draw a wall</span>
          <span class="tool-hint" v-else-if="activeTool === 'measure'">Click two points to measure</span>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'select' }" title="Select and move" @click="selectTool('select')"><svg viewBox="0 0 20 20"><path d="m5 3 10 8-5 .7-2.5 5L5 3Z"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'wall' }" title="Draw wall" @click="selectTool('wall')"><svg viewBox="0 0 20 20"><path d="M4 5h12v10H4zM4 10h5m3 0h4"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'measure' }" title="Measure length" @click="selectTool('measure')"><svg viewBox="0 0 20 20"><path d="M4 14 14 4l3 3L7 17l-3-3Zm3-1 2 2m1-5 2 2m1-5 2 2"/></svg></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button" :class="{ 'tool-active': showGrid }" title="Toggle grid" @click="showGrid = !showGrid"><svg viewBox="0 0 20 20"><path d="M4 4h12v12H4zM4 10h12M10 4v12"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': showDimensions }" title="Toggle dimensions" @click="showDimensions = !showDimensions"><svg viewBox="0 0 20 20"><path d="M4 10h12m-3-3 3 3-3 3M7 7l-3 3 3 3"/></svg></button>
          <span class="toolbar-divider"></span><button class="zoom-button" aria-label="Zoom out" @click="changeZoom(-0.1)">−</button><span class="zoom-level">{{ Math.round(zoom * 100) }}%</span><button class="zoom-button" aria-label="Zoom in" @click="changeZoom(0.1)">+</button>
        </div>
      </div>
      <div class="canvas-area">
        <div class="canvas-label"><span class="canvas-status"></span> {{ view === '2d' ? 'FLOOR PLAN' : '3D PREVIEW' }} <span class="label-divider">·</span> LIVING ROOM</div>
        <div class="canvas-card" @wheel.prevent="changeZoom($event.deltaY > 0 ? -0.1 : 0.1)">
          <svg v-if="view === '2d'" class="plan-svg" :viewBox="planViewBox" @click="onCanvasClick" @mousemove="onCanvasMove">
            <defs>
              <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e9e7e1" stroke-width="0.8"/></pattern>
              <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#443a2e" flood-opacity=".09"/></filter>
            </defs>
            <rect width="960" height="680" fill="#f7f6f2"/>
            <rect v-if="showGrid" width="960" height="680" fill="url(#grid)"/>
            <rect :x="room.x" :y="room.y" :width="room.width" :height="room.height" fill="#f5eee4" stroke="#45443f" stroke-width="10"/>
            <rect :x="room.x + 8" :y="room.y + 8" :width="room.width - 16" :height="room.height - 16" fill="none" stroke="#c6b9a8" stroke-width="1.5"/>
            <line :x1="room.x + 50" :y1="room.y" :x2="room.x + 160" :y2="room.y" stroke="#75b7bd" stroke-width="13"/>
            <line :x1="room.x + 50" :y1="room.y - 6" :x2="room.x + 160" :y2="room.y - 6" stroke="#f7f6f2" stroke-width="3"/>
            <line :x1="room.x + 50" :y1="room.y + 6" :x2="room.x + 160" :y2="room.y + 6" stroke="#f7f6f2" stroke-width="3"/>
            <line :x1="room.x + room.width" :y1="room.y + 310" :x2="room.x + room.width" :y2="room.y + 400" stroke="#f7f6f2" stroke-width="13"/>
            <path :d="`M ${room.x + room.width} ${room.y + 400} A 90 90 0 0 0 ${room.x + room.width - 90} ${room.y + 310}`" fill="none" stroke="#c98d65" stroke-width="2"/>
            <line :x1="room.x + room.width" :y1="room.y + 310" :x2="room.x + room.width - 90" :y2="room.y + 310" stroke="#c98d65" stroke-width="3"/>
            <g v-for="wall in wallSegments" :key="`wall-${wall.id}`">
              <line :x1="wall.start.x" :y1="wall.start.y" :x2="wall.end.x" :y2="wall.end.y" stroke="#45443f" stroke-width="10" stroke-linecap="square"/>
              <line :x1="wall.start.x" :y1="wall.start.y" :x2="wall.end.x" :y2="wall.end.y" stroke="#c6b9a8" stroke-width="1"/>
            </g>
            <g v-if="showDimensions" class="room-dimensions">
              <line :x1="room.x" :y1="room.y - 28" :x2="room.x + room.width" :y2="room.y - 28" stroke="#99958c" stroke-width="1"/>
              <path :d="`M ${room.x} ${room.y - 33}v10m${room.width} -10v10`" stroke="#99958c" stroke-width="1"/>
              <rect :x="room.x + room.width / 2 - 35" :y="room.y - 40" width="70" height="22" rx="5" fill="#f7f6f2"/>
              <text :x="room.x + room.width / 2" :y="room.y - 25" text-anchor="middle">{{ (room.width / SCALE).toFixed(2) }} m</text>
              <line :x1="room.x - 28" :y1="room.y" :x2="room.x - 28" :y2="room.y + room.height" stroke="#99958c" stroke-width="1"/>
              <path :d="`M ${room.x - 33} ${room.y}h10m-10 ${room.height}h10`" stroke="#99958c" stroke-width="1"/>
              <rect :x="room.x - 64" :y="room.y + room.height / 2 - 12" width="70" height="23" rx="5" fill="#f7f6f2"/>
              <text :x="room.x - 30" :y="room.y + room.height / 2 + 4" text-anchor="middle">{{ (room.height / SCALE).toFixed(2) }} m</text>
            </g>
            <g v-for="measurement in measurements" :key="`measure-${measurement.id}`">
              <line :x1="measurement.start.x" :y1="measurement.start.y" :x2="measurement.end.x" :y2="measurement.end.y" stroke="#628c75" stroke-width="2" stroke-dasharray="5 4"/>
              <circle :cx="measurement.start.x" :cy="measurement.start.y" r="3" fill="#628c75"/><circle :cx="measurement.end.x" :cy="measurement.end.y" r="3" fill="#628c75"/>
              <rect :x="(measurement.start.x + measurement.end.x) / 2 - 32" :y="(measurement.start.y + measurement.end.y) / 2 - 17" width="64" height="22" rx="6" fill="#fff" stroke="#d8e3da"/>
              <text :x="(measurement.start.x + measurement.end.x) / 2" :y="(measurement.start.y + measurement.end.y) / 2 - 2" text-anchor="middle" class="measure-label">{{ formatLength(measurement.start, measurement.end) }}</text>
            </g>
            <g v-if="pendingPoint" class="pending-point"><circle :cx="pendingPoint.x" :cy="pendingPoint.y" r="6"/><circle :cx="pendingPoint.x" :cy="pendingPoint.y" r="12"/></g>
            <g v-for="item in items" :key="item.id" class="plan-item" :class="{ 'is-selected': selectedId === item.id }" :transform="`translate(${item.x} ${item.y}) rotate(${item.rotation})`" @click="itemClick($event, item)">
              <g v-if="item.kind === 'chair'" filter="url(#soft-shadow)">
                <rect x="-22" y="-20" width="44" height="37" rx="11" :fill="item.color || '#d8b69a'" stroke="#a78366" stroke-width="1.5"/>
                <rect x="-18" y="-18" width="36" height="9" rx="5" fill="#e6cbb5"/>
                <path d="M-17 12v10m34-10v10" stroke="#9a7457" stroke-width="3" stroke-linecap="round"/>
              </g>
              <g v-else-if="item.kind === 'table'" filter="url(#soft-shadow)">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" rx="9" fill="#bd9a72" stroke="#94734f" stroke-width="2"/>
                <rect :x="-item.width / 2 + 7" :y="-item.depth / 2 + 7" :width="item.width - 14" :height="item.depth - 14" rx="5" fill="#c9aa86"/>
                <path :d="`M${-item.width / 2 + 15} ${item.depth / 2 - 6}v13m${item.width - 30} -13v13`" stroke="#94734f" stroke-width="5" stroke-linecap="round"/>
              </g>
              <g v-else-if="item.kind === 'cupboard' || item.kind === 'shelf'">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" rx="5" :fill="item.color || (item.kind === 'shelf' ? '#c5ae96' : '#99a08e')" stroke="#777c6c" stroke-width="1.5"/>
                <line v-if="item.kind === 'cupboard'" y1="-10" y2="10" stroke="#e0e0d4" stroke-width="2"/>
                <circle v-if="item.kind === 'cupboard'" cx="4" cy="0" r="1.5" fill="#777c6c"/>
                <g v-if="item.kind === 'shelf'" stroke="#8d7964" stroke-width="1"><line :x1="-item.width / 2 + 5" :y1="-item.depth / 4" :x2="item.width / 2 - 5" :y2="-item.depth / 4"/><line :x1="-item.width / 2 + 5" :y1="item.depth / 4" :x2="item.width / 2 - 5" :y2="item.depth / 4"/></g>
              </g>
              <g v-else-if="item.kind === 'window'"><rect :x="-item.width / 2" y="-6" :width="item.width" height="12" rx="2" fill="#77b9c1" stroke="#3f8e98" stroke-width="2"/><path :d="`M${-item.width / 2 + 4} 0h${item.width - 8}`" stroke="#e9fbfb" stroke-width="2"/></g>
              <g v-else-if="item.kind === 'door'"><rect :x="-item.width / 2" y="-7" :width="item.width" height="14" rx="2" fill="#c98d65" stroke="#986746" stroke-width="1.5"/><circle :cx="item.width / 2 - 10" cy="0" r="2" fill="#f3dfbb"/></g>
              <g v-else filter="url(#soft-shadow)">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" rx="7" :fill="item.color || '#94a9b8'" stroke="#6c8494" stroke-width="2"/>
                <path :d="`M${-item.width / 2 + 8} ${-item.depth / 2 + 8}h${item.width - 16}v${item.depth - 16}h${-item.width + 16}z`" fill="none" stroke="#d7e1e7"/>
              </g>
              <rect v-if="selectedId === item.id" :x="-item.width / 2 - 6" :y="-item.depth / 2 - 6" :width="item.width + 12" :height="item.depth + 12" rx="12" fill="none" stroke="#668774" stroke-width="2" stroke-dasharray="4 3"/>
              <title>{{ item.name || itemLabel(item.kind) }} · {{ item.width }} × {{ item.depth }} cm</title>
            </g>
            <text :x="room.x + room.width / 2" :y="room.y + room.height + 35" text-anchor="middle" class="room-caption">LIVING ROOM · {{ totalArea }} M²</text>
          </svg>

          <svg v-else class="plan-svg iso-svg" :viewBox="planViewBox">
            <defs><pattern id="iso-grid" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="skewY(-28) scale(1,.75)"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e9e7e1" stroke-width="1"/></pattern></defs>
            <rect width="960" height="680" fill="#f7f6f2"/>
            <polygon :points="polygon([projected(room.x, room.y), projected(room.x + room.width, room.y), projected(room.x + room.width, room.y + room.height), projected(room.x, room.y + room.height)])" fill="#f5eee4" stroke="#d8cfc2" stroke-width="2"/>
            <g v-for="wall in wallSegments" :key="`iso-wall-${wall.id}`">
              <polygon :points="polygon([projected(wall.start.x, wall.start.y), projected(wall.end.x, wall.end.y), projected(wall.end.x, wall.end.y, 150), projected(wall.start.x, wall.start.y, 150)])" fill="#d9d2c7" stroke="#aba397" stroke-width="1.5"/>
            </g>
            <g>
              <polygon :points="polygon([projected(room.x, room.y), projected(room.x + room.width, room.y), projected(room.x + room.width, room.y, 170), projected(room.x, room.y, 170)])" fill="#e0d9cd" stroke="#b8aea0" stroke-width="1.5"/>
              <polygon :points="polygon([projected(room.x, room.y), projected(room.x, room.y + room.height), projected(room.x, room.y + room.height, 170), projected(room.x, room.y, 170)])" fill="#d4ccbf" stroke="#b8aea0" stroke-width="1.5"/>
              <polygon :points="polygon([projected(room.x + 50, room.y), projected(room.x + 160, room.y), projected(room.x + 160, room.y, 170), projected(room.x + 50, room.y, 170)])" fill="#a9d5d7" stroke="#75b7bd" stroke-width="2"/>
            </g>
            <g v-for="item in items" :key="`iso-${item.id}`" class="iso-item">
              <polygon :points="polygon(isoBox(item).bottom)" :fill="item.color || itemColor(item.kind)" opacity=".42" stroke="#776c5d" stroke-width="1"/>
              <polygon :points="polygon([isoBox(item).bottom[0]!, isoBox(item).bottom[1]!, isoBox(item).top[1]!, isoBox(item).top[0]!])" :fill="item.color || itemColor(item.kind)" stroke="#776c5d" stroke-width="1.5"/>
              <polygon :points="polygon([isoBox(item).bottom[1]!, isoBox(item).bottom[2]!, isoBox(item).top[2]!, isoBox(item).top[1]!])" :fill="item.color || itemColor(item.kind)" opacity=".78" stroke="#776c5d" stroke-width="1.5"/>
              <polygon :points="polygon(isoBox(item).top)" :fill="item.color || itemColor(item.kind)" opacity=".92" stroke="#776c5d" stroke-width="1.5"/>
              <text :x="projected(item.x, item.y).x" :y="projected(item.x, item.y).y - item.height - 12" text-anchor="middle" class="iso-label">{{ item.name || itemLabel(item.kind) }}</text>
            </g>
            <text x="480" y="618" text-anchor="middle" class="room-caption">LIVING ROOM · {{ totalArea }} M²</text>
          </svg>
          <div class="canvas-compass"><span>N</span><svg viewBox="0 0 20 28"><path d="M10 2 16 25 10 20 4 25 10 2Z" fill="#628c75"/></svg></div>
          <div class="canvas-scale"><span class="scale-line"></span><span>1 m</span></div>
        </div>
        <div class="canvas-footer"><span><span class="keyboard-hint">⌘</span> + scroll to zoom</span><span class="footer-separator">·</span><span>{{ placedCount }} objects</span><span class="footer-separator">·</span><span>{{ totalArea }} m² floor area</span><span class="footer-spacer"></span><button @click="clearPlan">Reset plan</button></div>
      </div>
      <aside v-if="selectedItem" class="inspector">
        <div class="inspector-heading"><div><span class="section-eyebrow">SELECTED OBJECT</span><h2>{{ selectedItem.name || itemLabel(selectedItem.kind) }}</h2></div><button class="icon-button" aria-label="Close inspector" @click="selectedId = null">×</button></div>
        <label class="property-label">Name<input v-model="selectedItem.name" :placeholder="itemLabel(selectedItem.kind)"></label>
        <div class="property-row"><label class="property-label">Width <span>cm</span><input v-model.number="selectedItem.width" type="number" min="1"></label><label class="property-label">Depth <span>cm</span><input v-model.number="selectedItem.depth" type="number" min="1"></label></div>
        <div class="property-row"><label class="property-label">Height <span>cm</span><input v-model.number="selectedItem.height" type="number" min="1"></label><label class="property-label">Rotation <span>°</span><input :value="selectedItem.rotation" type="number" readonly></label></div>
        <button class="rotate-button" @click="rotateSelected">↻ <span>Rotate 90°</span></button>
        <button class="delete-button" @click="removeSelected">Remove object</button>
      </aside>
      <div v-if="activeTool === 'cube' && view === '2d'" class="placement-tip">Click anywhere in the room to place your cube <button @click="selectTool('select')">Cancel</button></div>
    </section>
  </main>
</template>
