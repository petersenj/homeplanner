<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const RoomScene3D = defineAsyncComponent(() => import('~/components/RoomScene3D.vue'))

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
type RoomEdge = { id: number; start: Point; end: Point; label: Point; labelAngle: number; length: number }

const SCALE = 100
const VIEW_WIDTH = 960
const VIEW_HEIGHT = 680
const defaultRoomPoints: Point[] = [
  { x: 125, y: 95 },
  { x: 775, y: 95 },
  { x: 775, y: 575 },
  { x: 125, y: 575 },
]
const view = ref<'2d' | '3d'>('2d')
const activeTool = ref<'select' | 'room' | 'wall' | 'measure' | 'window' | 'door' | 'cube' | 'furniture'>('select')
const selectedCategory = ref('All items')
const selectedId = ref<number | null>(null)
const pendingPoint = ref<Point | null>(null)
const roomPoints = ref<Point[]>(defaultRoomPoints.map((point) => ({ ...point })))
const drawingRoomPoints = ref<Point[]>([])
const drawingCursor = ref<Point | null>(null)
const roomDrawingError = ref('')
const zoom = ref(1)
const wallSegments = ref<Wall[]>([])
const measurements = ref<Measurement[]>([])
const nextId = ref(10)
const showGrid = ref(true)
const showDimensions = ref(true)
const sidebarOpen = ref(true)
const isDragging = ref(false)
const activePointerId = ref<number | null>(null)
const dragOffset = ref<Point>({ x: 0, y: 0 })
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
const roomBounds = computed(() => {
  const xs = roomPoints.value.map((point) => point.x)
  const ys = roomPoints.value.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  }
})
const roomArea = computed(() => roomAreaFor(roomPoints.value))
const roomCenter = computed(() => {
  let x = 0
  let y = 0
  let crossSum = 0
  for (let index = 0; index < roomPoints.value.length; index++) {
    const point = roomPoints.value[index]!
    const next = roomPoints.value[(index + 1) % roomPoints.value.length]!
    const cross = point.x * next.y - next.x * point.y
    crossSum += cross
    x += (point.x + next.x) * cross
    y += (point.y + next.y) * cross
  }
  if (Math.abs(crossSum) < 0.001) return { ...roomBounds.value, x: roomBounds.value.x + roomBounds.value.width / 2, y: roomBounds.value.y + roomBounds.value.height / 2 }
  return { x: x / (3 * crossSum), y: y / (3 * crossSum) }
})
const totalArea = computed(() => (roomArea.value / SCALE ** 2).toFixed(1))
const roomPolygon = computed(() => roomPoints.value.map((point) => `${point.x},${point.y}`).join(' '))
const roomEdges = computed<RoomEdge[]>(() => {
  const signedArea = roomPoints.value.reduce((area, point, index) => {
    const next = roomPoints.value[(index + 1) % roomPoints.value.length]!
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
  const orientation = Math.sign(signedArea) || 1
  return roomPoints.value.map((start, index) => {
    const end = roomPoints.value[(index + 1) % roomPoints.value.length]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    const offset = 20
    const labelAngle = Math.atan2(dy, dx) * 180 / Math.PI
    const readableAngle = labelAngle > 90 || labelAngle < -90 ? labelAngle + 180 : labelAngle
    return {
      id: index,
      start,
      end,
      label: {
        x: (start.x + end.x) / 2 + (dy / (length || 1)) * offset * orientation,
        y: (start.y + end.y) / 2 - (dx / (length || 1)) * offset * orientation,
      },
      labelAngle: readableAngle,
      length: length / SCALE,
    }
  })
})
const planViewBox = computed(() => {
  const width = VIEW_WIDTH / zoom.value
  const height = VIEW_HEIGHT / zoom.value
  return `${(VIEW_WIDTH - width) / 2} ${(VIEW_HEIGHT - height) / 2} ${width} ${height}`
})

function isPointInsideRoom(point: Point) {
  let inside = false
  for (let index = 0, previous = roomPoints.value.length - 1; index < roomPoints.value.length; previous = index++) {
    const current = roomPoints.value[index]!
    const last = roomPoints.value[previous]!
    const crosses = (current.y > point.y) !== (last.y > point.y)
      && point.x < ((last.x - current.x) * (point.y - current.y)) / (last.y - current.y) + current.x
    if (crosses) inside = !inside
  }
  return inside
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return Math.abs(value) < 0.001 ? 0 : value > 0 ? 1 : 2
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  const onSegment = (start: Point, point: Point, end: Point) => point.x >= Math.min(start.x, end.x) - 0.001
    && point.x <= Math.max(start.x, end.x) + 0.001
    && point.y >= Math.min(start.y, end.y) - 0.001
    && point.y <= Math.max(start.y, end.y) + 0.001
  if (abC !== abD && cdA !== cdB) return true
  return (abC === 0 && onSegment(a, c, b))
    || (abD === 0 && onSegment(a, d, b))
    || (cdA === 0 && onSegment(c, a, d))
    || (cdB === 0 && onSegment(c, b, d))
}

function isSimpleRoom(points: Point[]) {
  for (let first = 0; first < points.length; first++) {
    const firstEnd = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second++) {
      const secondEnd = (second + 1) % points.length
      if (first === second || firstEnd === second || secondEnd === first) continue
      if (segmentsIntersect(points[first]!, points[firstEnd]!, points[second]!, points[secondEnd]!)) return false
    }
  }
  return true
}

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
  const longestEdge = roomEdges.value.reduce((longest, edge) => edge.length > longest.length ? edge : longest, roomEdges.value[0]!)
  const mountingEdge = kind === 'door' ? roomEdges.value[1] ?? longestEdge : longestEdge
  const edgeAngle = Math.atan2(mountingEdge.end.y - mountingEdge.start.y, mountingEdge.end.x - mountingEdge.start.x) * 180 / Math.PI
  const defaultPoint = kind === 'window' || kind === 'door'
    ? { x: (mountingEdge.start.x + mountingEdge.end.x) / 2, y: (mountingEdge.start.y + mountingEdge.end.y) / 2 }
    : roomCenter.value
  const item: PlanItem = {
    id,
    kind,
    x: at?.x ?? defaultPoint.x,
    y: at?.y ?? defaultPoint.y,
    width,
    depth,
    height,
    rotation: kind === 'window' || kind === 'door' ? edgeAngle : 0,
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

function svgPoint(event: MouseEvent | PointerEvent, svg = event.currentTarget as SVGSVGElement): Point {
  const matrix = svg.getScreenCTM()
  if (!matrix) return { ...roomCenter.value }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

function onCanvasClick(event: MouseEvent) {
  if ((event.target as Element).closest('.plan-item')) return
  const rawPoint = svgPoint(event)
  const point = {
    x: Math.max(20, Math.min(VIEW_WIDTH - 20, Math.round(rawPoint.x / 10) * 10)),
    y: Math.max(20, Math.min(VIEW_HEIGHT - 20, Math.round(rawPoint.y / 10) * 10)),
  }
  if (activeTool.value === 'room') {
    const previous = drawingRoomPoints.value.at(-1)
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 10) return
    roomDrawingError.value = ''
    drawingRoomPoints.value.push(point)
    return
  }
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

function itemPointerDown(event: PointerEvent, item: PlanItem) {
  event.stopPropagation()
  selectedId.value = item.id
  if (activeTool.value !== 'select') return
  if (!event.isPrimary || event.button !== 0) return
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (svg) {
    const point = svgPoint(event, svg)
    dragOffset.value = { x: item.x - point.x, y: item.y - point.y }
  }
  if (svg?.setPointerCapture) svg.setPointerCapture(event.pointerId)
  activePointerId.value = event.pointerId
  isDragging.value = true
}

function onCanvasPointerMove(event: PointerEvent) {
  if (activeTool.value === 'room' && drawingRoomPoints.value.length > 0) {
    drawingCursor.value = svgPoint(event)
  }
  if (!isDragging.value || selectedId.value === null || activePointerId.value !== event.pointerId) return
  const pointerPoint = svgPoint(event)
  const point = { x: pointerPoint.x + dragOffset.value.x, y: pointerPoint.y + dragOffset.value.y }
  if (isPointInsideRoom(point)) {
    const item = items.value.find((entry) => entry.id === selectedId.value)
    if (item) {
      item.x = point.x
      item.y = point.y
    }
  }
}

function stopDragging() {
  isDragging.value = false
  activePointerId.value = null
}

function beginRoomDrawing() {
  if (items.value.length || wallSegments.value.length || measurements.value.length) {
    if (!window.confirm('Draw a new room? This will replace the current room and remove its furniture, walls, and measurements.')) return
  }
  drawingRoomPoints.value = []
  drawingCursor.value = null
  roomDrawingError.value = ''
  pendingPoint.value = null
  selectedId.value = null
  activeTool.value = 'room'
  view.value = '2d'
}

function finishRoomDrawing() {
  const points = drawingRoomPoints.value
  if (points.length < 3) {
    roomDrawingError.value = 'Add at least three corners to close the room.'
    return
  }
  if (roomAreaFor(points) < 100) {
    roomDrawingError.value = 'The room is too small. Draw a larger outline.'
    return
  }
  if (!isSimpleRoom(points)) {
    roomDrawingError.value = 'Room edges cannot cross. Adjust the outline and try again.'
    return
  }
  roomPoints.value = points.map((point) => ({ ...point }))
  items.value = []
  wallSegments.value = []
  measurements.value = []
  drawingRoomPoints.value = []
  drawingCursor.value = null
  roomDrawingError.value = ''
  activeTool.value = 'select'
}

function roomAreaFor(points: Point[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

function cancelRoomDrawing() {
  drawingRoomPoints.value = []
  drawingCursor.value = null
  roomDrawingError.value = ''
  activeTool.value = 'select'
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

function onCanvasWheel(event: WheelEvent) {
  if (view.value !== '2d') return
  event.preventDefault()
  changeZoom(event.deltaY > 0 ? -0.1 : 0.1)
}

function exportPlan() {
  const plan = {
    name: 'Living room',
    units: 'cm',
    room: {
      width: roomBounds.value.width,
      depth: roomBounds.value.height,
      points: roomPoints.value,
      area: roomArea.value,
    },
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

function clearPlan() {
  if (!window.confirm('Start a new empty room plan? This will remove all placed items, walls, and measurements.')) return
  items.value = []
  wallSegments.value = []
  measurements.value = []
  selectedId.value = null
}

onMounted(() => {
  window.addEventListener('pointerup', stopDragging)
  window.addEventListener('pointercancel', stopDragging)
  const savedPlan = window.localStorage.getItem('roomwise-plan-v1')
  if (savedPlan) {
    try {
      const plan = JSON.parse(savedPlan) as { items?: PlanItem[]; walls?: Wall[]; measurements?: Measurement[]; roomPoints?: Point[] }
      if (Array.isArray(plan.items) && Array.isArray(plan.walls) && Array.isArray(plan.measurements)) {
        items.value = plan.items
        wallSegments.value = plan.walls
        measurements.value = plan.measurements
        if (Array.isArray(plan.roomPoints) && plan.roomPoints.length >= 3) roomPoints.value = plan.roomPoints
        nextId.value = Math.max(10, ...items.value.map((item) => item.id + 1), ...wallSegments.value.map((wall) => wall.id + 1), ...measurements.value.map((measurement) => measurement.id + 1))
      } else {
        console.warn('Saved room plan has an invalid structure and was not restored.')
      }
    } catch (error) {
      console.error('Could not restore the saved room plan.', error)
    }
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', stopDragging)
  window.removeEventListener('pointercancel', stopDragging)
})
watch([items, wallSegments, measurements, roomPoints], () => {
  if (import.meta.client) {
    window.localStorage.setItem('roomwise-plan-v1', JSON.stringify({
      items: items.value,
      walls: wallSegments.value,
      measurements: measurements.value,
      roomPoints: roomPoints.value,
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
          <div class="section-heading"><span class="section-eyebrow">ROOMS</span><button class="icon-button add-room" aria-label="Draw a new room" title="Draw a new room" @click="beginRoomDrawing">+</button></div>
          <button class="room-row active-room"><span class="room-dot"></span><span>Living room</span><span class="room-area">{{ totalArea }} m²</span></button>
          <button class="room-row muted-room" @click="beginRoomDrawing"><span class="room-dot empty-dot"></span><span>+ Draw a new room</span></button>
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
        <div v-if="view === '2d'" class="tool-actions">
          <span class="tool-hint" v-if="activeTool === 'room'">Click room corners, then finish</span>
          <span class="tool-hint" v-else-if="activeTool === 'wall'">Click two points to draw a wall</span>
          <span class="tool-hint" v-else-if="activeTool === 'measure'">Click two points to measure</span>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'select' }" title="Select and move" @click="selectTool('select')"><svg viewBox="0 0 20 20"><path d="m5 3 10 8-5 .7-2.5 5L5 3Z"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'room' }" title="Draw a new room" @click="beginRoomDrawing"><svg viewBox="0 0 20 20"><path d="m4 5 7-2 5 4v8l-7 2-5-4V5Zm7-2v8m5-4-5 4m-7-6 7 2"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'wall' }" title="Draw wall" @click="selectTool('wall')"><svg viewBox="0 0 20 20"><path d="M4 5h12v10H4zM4 10h5m3 0h4"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'measure' }" title="Measure length" @click="selectTool('measure')"><svg viewBox="0 0 20 20"><path d="M4 14 14 4l3 3L7 17l-3-3Zm3-1 2 2m1-5 2 2m1-5 2 2"/></svg></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button" :class="{ 'tool-active': showGrid }" title="Toggle grid" @click="showGrid = !showGrid"><svg viewBox="0 0 20 20"><path d="M4 4h12v12H4zM4 10h12M10 4v12"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': showDimensions }" title="Toggle dimensions" @click="showDimensions = !showDimensions"><svg viewBox="0 0 20 20"><path d="M4 10h12m-3-3 3 3-3 3M7 7l-3 3 3 3"/></svg></button>
          <span class="toolbar-divider"></span><button class="zoom-button" aria-label="Zoom out" @click="changeZoom(-0.1)">−</button><span class="zoom-level">{{ Math.round(zoom * 100) }}%</span><button class="zoom-button" aria-label="Zoom in" @click="changeZoom(0.1)">+</button>
        </div>
      </div>
      <div class="canvas-area">
        <div class="canvas-label"><span class="canvas-status"></span> {{ view === '2d' ? 'FLOOR PLAN' : 'INTERACTIVE 3D' }} <span class="label-divider">·</span> {{ view === '2d' ? 'LIVING ROOM' : 'DRAG TO ORBIT' }}</div>
        <div class="canvas-card" :class="{ 'immersive-card': view === '3d' }" @wheel="onCanvasWheel">
          <svg v-if="view === '2d'" class="plan-svg" :viewBox="planViewBox" @click="onCanvasClick" @pointermove="onCanvasPointerMove" @pointerup="stopDragging" @pointercancel="stopDragging" @lostpointercapture="stopDragging">
            <defs>
              <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e9e7e1" stroke-width="0.8"/></pattern>
              <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#443a2e" flood-opacity=".09"/></filter>
            </defs>
            <rect width="960" height="680" fill="#f7f6f2"/>
            <rect v-if="showGrid" width="960" height="680" fill="url(#grid)"/>
            <polygon :points="roomPolygon" fill="#f5eee4" stroke="#c6b9a8" stroke-width="1.5"/>
            <line v-for="edge in roomEdges" :key="`room-edge-${edge.id}`" :x1="edge.start.x" :y1="edge.start.y" :x2="edge.end.x" :y2="edge.end.y" stroke="#45443f" stroke-width="10" stroke-linecap="square"/>
            <g v-if="showDimensions" class="room-dimensions room-edge-dimensions">
              <text v-for="edge in roomEdges" :key="`room-dimension-${edge.id}`" :x="edge.label.x" :y="edge.label.y" text-anchor="middle" :transform="`rotate(${edge.labelAngle} ${edge.label.x} ${edge.label.y})`">{{ edge.length.toFixed(2) }} m</text>
            </g>
            <g v-for="wall in wallSegments" :key="`wall-${wall.id}`">
              <line :x1="wall.start.x" :y1="wall.start.y" :x2="wall.end.x" :y2="wall.end.y" stroke="#45443f" stroke-width="10" stroke-linecap="square"/>
              <line :x1="wall.start.x" :y1="wall.start.y" :x2="wall.end.x" :y2="wall.end.y" stroke="#c6b9a8" stroke-width="1"/>
            </g>
            <g v-for="measurement in measurements" :key="`measure-${measurement.id}`">
              <line :x1="measurement.start.x" :y1="measurement.start.y" :x2="measurement.end.x" :y2="measurement.end.y" stroke="#628c75" stroke-width="2" stroke-dasharray="5 4"/>
              <circle :cx="measurement.start.x" :cy="measurement.start.y" r="3" fill="#628c75"/><circle :cx="measurement.end.x" :cy="measurement.end.y" r="3" fill="#628c75"/>
              <rect :x="(measurement.start.x + measurement.end.x) / 2 - 32" :y="(measurement.start.y + measurement.end.y) / 2 - 17" width="64" height="22" rx="6" fill="#fff" stroke="#d8e3da"/>
              <text :x="(measurement.start.x + measurement.end.x) / 2" :y="(measurement.start.y + measurement.end.y) / 2 - 2" text-anchor="middle" class="measure-label">{{ formatLength(measurement.start, measurement.end) }}</text>
            </g>
            <g v-if="pendingPoint" class="pending-point"><circle :cx="pendingPoint.x" :cy="pendingPoint.y" r="6"/><circle :cx="pendingPoint.x" :cy="pendingPoint.y" r="12"/></g>
            <g v-if="activeTool === 'room' && drawingRoomPoints.length">
              <polyline :points="[...drawingRoomPoints, ...(drawingCursor ? [drawingCursor] : [])].map((point) => `${point.x},${point.y}`).join(' ')" fill="none" stroke="#668371" stroke-width="4" stroke-dasharray="9 5" stroke-linecap="round" stroke-linejoin="round"/>
              <circle v-for="(point, index) in drawingRoomPoints" :key="`room-point-${index}`" :cx="point.x" :cy="point.y" r="7" fill="#fff" stroke="#668371" stroke-width="3"/>
            </g>
            <g v-for="item in items" :key="item.id" class="plan-item" :class="{ 'is-selected': selectedId === item.id, 'is-dragging': isDragging && selectedId === item.id }" :transform="`translate(${item.x} ${item.y}) rotate(${item.rotation})`" @pointerdown="itemPointerDown($event, item)" @click.stop="selectedId = item.id">
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
            <text :x="roomBounds.x + roomBounds.width / 2" :y="roomBounds.y + roomBounds.height + 35" text-anchor="middle" class="room-caption">LIVING ROOM · {{ totalArea }} M²</text>
          </svg>

          <ClientOnly v-else>
            <RoomScene3D
              :items="items"
              :walls="wallSegments"
              :room-points="roomPoints"
              :room-width="roomBounds.width"
              :room-depth="roomBounds.height"
              :room-x="roomBounds.x"
              :room-y="roomBounds.y"
              :selected-id="selectedId"
              @select="selectedId = $event"
            />
          </ClientOnly>
          <div v-if="activeTool === 'room'" class="room-draw-banner">
            <div><strong>Draw your room</strong><span>Click each corner around the room. Add at least 3 corners.</span><small v-if="roomDrawingError">{{ roomDrawingError }}</small></div>
            <span class="corner-count">{{ drawingRoomPoints.length }} corners</span>
            <button class="room-cancel-button" @click="cancelRoomDrawing">Cancel</button>
            <button class="room-finish-button" :disabled="drawingRoomPoints.length < 3" @click="finishRoomDrawing">Finish room</button>
          </div>
          <template v-if="view === '2d'">
            <div class="canvas-compass"><span>N</span><svg viewBox="0 0 20 28"><path d="M10 2 16 25 10 20 4 25 10 2Z" fill="#628c75"/></svg></div>
            <div class="canvas-scale"><span class="scale-line"></span><span>1 m</span></div>
          </template>
        </div>
        <div class="canvas-footer"><span v-if="view === '2d'"><span class="keyboard-hint">⌘</span> + scroll to zoom</span><span v-else>Drag to orbit · right-drag to pan · scroll to zoom</span><span class="footer-separator">·</span><span>{{ placedCount }} objects</span><span class="footer-separator">·</span><span>{{ totalArea }} m² floor area</span><span class="footer-spacer"></span><button @click="clearPlan">Reset plan</button></div>
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
