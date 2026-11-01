<script setup lang="ts">
import { getCatalogItem } from '~/catalog'
import type { CatalogItem } from '~/catalog/types'
import type { DragMeasurement, LiveMeasurement, Measurement, Point, RoomEdge, Wall } from '~/types/planner'

type PlanItem = CatalogItem

const props = defineProps<{
  viewBox: string
  viewWidth: number
  viewHeight: number
  gridSize: number
  scale: number
  zoom: number
  panOffset: Point
  showGrid: boolean
  allRooms: Point[][]
  showDimensions: boolean
  roomEdges: RoomEdge[]
  roomDimensionLabels: Array<{ id: string; label: Point; labelAngle: number; text: string }>
  roomLabelPoints: Point[]
  roomNames: string[]
  roomDisplayName: (name: string | undefined, index: number) => string
  roomAreaFor: (points: Point[]) => number
  wallSegments: Wall[]
  showCustomMeasurements: boolean
  measurements: Measurement[]
  fixedSizeLabelTransform: (point: Point, rotation?: number) => string
  fixedSizeGroupTransform: (point: Point) => string
  formatLength: (start: Point, end: Point) => string
  t: (key: string) => string
  liveMeasurement: LiveMeasurement | null
  pendingPoint: Point | null
  activeTool: string
  drawingRoomPoints: Point[]
  drawingCursor: Point | null
  drawingCursorSnapsToWall: boolean
  roomDraftMeasurement: LiveMeasurement | null
  drawingCursorClosesRoom: boolean
  items: PlanItem[]
  selectedId: number | null
  isDragging: boolean
  itemLabel: (kind: string) => string
  roomCorners: Point[]
  roomCornerDrag: { corner: Point } | null
  samePoint: (first: Point, second: Point) => boolean
  dragMeasurements: DragMeasurement[]
  roomPoints: Point[]
  roomBounds: { x: number; y: number; width: number; height: number }
  totalArea: string
}>()

const emit = defineEmits<{
  canvasClick: [event: MouseEvent]
  canvasPointerMove: [event: PointerEvent]
  canvasPointerStop: []
  updatePanOffset: [offset: Point]
  canvasContextMenu: [event: MouseEvent]
  measurementDelete: [id: number]
  itemPointerDown: [event: PointerEvent, item: PlanItem]
  itemSelect: [id: number]
  rotationPointerDown: [event: PointerEvent, item: PlanItem]
  roomCornerPointerDown: [event: PointerEvent, corner: Point]
  removeRoomCorner: [corner: Point]
}>()

const isPanning = ref(false)
const activePanPointer = ref<number | null>(null)
const panStartPointer = ref<Point>({ x: 0, y: 0 })
const panStartOffset = ref<Point>({ x: 0, y: 0 })
const hoveredMeasurementId = ref<number | null>(null)
let measurementHoverTimeout: ReturnType<typeof setTimeout> | undefined
const displayRotations = reactive(new Map<number, number>())
const rotationAnimations = new Map<number, { startedAt: number; startRotation: number; endRotation: number; finalRotation: number }>()
let rotationFrame = 0
const renderItems = computed(() => [...props.items].sort(
  (first, second) => (first.floorOffset ?? 0) + first.height - ((second.floorOffset ?? 0) + second.height),
))

function showMeasurementDelete(id: number) {
  if (measurementHoverTimeout) clearTimeout(measurementHoverTimeout)
  hoveredMeasurementId.value = id
}

function hideMeasurementDeleteLater(id: number) {
  if (measurementHoverTimeout) clearTimeout(measurementHoverTimeout)
  measurementHoverTimeout = setTimeout(() => {
    if (hoveredMeasurementId.value === id) hoveredMeasurementId.value = null
    measurementHoverTimeout = undefined
  }, 350)
}

function startPan(event: PointerEvent) {
  if (event.button !== 2 || !event.isPrimary) return
  event.preventDefault()
  const svg = event.currentTarget as SVGSVGElement
  svg.setPointerCapture(event.pointerId)
  activePanPointer.value = event.pointerId
  panStartPointer.value = { x: event.clientX, y: event.clientY }
  panStartOffset.value = { ...props.panOffset }
  isPanning.value = true
}

function movePan(event: PointerEvent) {
  if (!isPanning.value || activePanPointer.value !== event.pointerId) {
    emit('canvasPointerMove', event)
    return
  }
  const svg = event.currentTarget as SVGSVGElement
  const bounds = svg.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const viewBoxWidth = props.viewWidth / props.zoom
  const viewBoxHeight = props.viewHeight / props.zoom
  emit('updatePanOffset', {
    x: panStartOffset.value.x - (event.clientX - panStartPointer.value.x) * viewBoxWidth / bounds.width,
    y: panStartOffset.value.y - (event.clientY - panStartPointer.value.y) * viewBoxHeight / bounds.height,
  })
}

function stopPan() {
  isPanning.value = false
  activePanPointer.value = null
}

function scheduleRotationFrame() {
  if (!rotationFrame) rotationFrame = window.requestAnimationFrame(animateRotations)
}

function animateRotations(timestamp: number) {
  rotationFrame = 0
  for (const [id, animation] of rotationAnimations) {
    const progress = Math.min((timestamp - animation.startedAt) / 180, 1)
    const eased = 1 - (1 - progress) ** 3
    displayRotations.set(id, animation.startRotation + (animation.endRotation - animation.startRotation) * eased)
    if (progress >= 1) {
      displayRotations.set(id, animation.finalRotation)
      rotationAnimations.delete(id)
    }
  }
  if (rotationAnimations.size) scheduleRotationFrame()
}

watch(() => props.items.map((item) => [item.id, item.rotation] as const), (rotations) => {
  const activeIds = new Set(rotations.map(([id]) => id))
  for (const id of displayRotations.keys()) {
    if (!activeIds.has(id)) {
      displayRotations.delete(id)
      rotationAnimations.delete(id)
    }
  }
  for (const [id, rotation] of rotations) {
    const targetRotation = ((rotation % 360) + 360) % 360
    const startRotation = displayRotations.get(id)
    if (startRotation === undefined) {
      displayRotations.set(id, targetRotation)
      continue
    }
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayRotations.set(id, targetRotation)
      rotationAnimations.delete(id)
      continue
    }
    const delta = ((targetRotation - ((startRotation % 360) + 360) % 360 + 540) % 360) - 180
    if (Math.abs(delta) < 0.001) {
      displayRotations.set(id, targetRotation)
      rotationAnimations.delete(id)
      continue
    }
    rotationAnimations.set(id, {
      startedAt: performance.now(),
      startRotation,
      endRotation: startRotation + delta,
      finalRotation: targetRotation,
    })
  }
  if (rotationAnimations.size && typeof window !== 'undefined') scheduleRotationFrame()
}, { immediate: true, flush: 'sync' })

onBeforeUnmount(() => {
  if (measurementHoverTimeout) clearTimeout(measurementHoverTimeout)
  if (rotationFrame) window.cancelAnimationFrame(rotationFrame)
  rotationAnimations.clear()
})
</script>

<template>
  <svg
    class="plan-svg"
    :class="{ 'is-panning': isPanning }"
    :viewBox="viewBox"
    @click="emit('canvasClick', $event)"
    @pointerdown="startPan"
    @pointermove="movePan"
    @pointerup="stopPan(); emit('canvasPointerStop')"
    @pointercancel="stopPan(); emit('canvasPointerStop')"
    @lostpointercapture="stopPan(); emit('canvasPointerStop')"
    @contextmenu="emit('canvasContextMenu', $event)"
  >
    <defs>
      <pattern id="grid" :width="gridSize" :height="gridSize" patternUnits="userSpaceOnUse"><path :d="`M ${gridSize} 0 L 0 0 0 ${gridSize}`" fill="none" stroke="#a9a7a1" stroke-width="0.8"/></pattern>
      <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#443a2e" flood-opacity=".09"/></filter>
    </defs>
    <rect :width="viewWidth" :height="viewHeight" fill="#f7f6f2"/>
    <rect v-if="showGrid" :width="viewWidth" :height="viewHeight" fill="url(#grid)"/>
    <polygon v-for="(room, index) in allRooms" :key="`room-floor-${index}`" :points="room.map((point) => `${point.x},${point.y}`).join(' ')" fill="#f5eee4" stroke="#c6b9a8" stroke-width="1.5"/>
    <line v-for="edge in roomEdges" :key="`room-edge-${edge.id}`" :x1="edge.start.x" :y1="edge.start.y" :x2="edge.end.x" :y2="edge.end.y" stroke="#45443f" stroke-width="10" stroke-linecap="square"/>
    <g v-if="showDimensions">
      <g class="room-dimensions room-edge-dimensions">
        <text v-for="dimension in roomDimensionLabels" :key="`room-dimension-${dimension.id}`" :x="dimension.label.x" :y="dimension.label.y" text-anchor="middle" :transform="fixedSizeLabelTransform(dimension.label, dimension.labelAngle)">{{ dimension.text }}</text>
      </g>
      <g v-for="(labelPoint, index) in roomLabelPoints" :key="`room-name-${index}`" :transform="fixedSizeGroupTransform(labelPoint)" class="room-plan-label">
        <text text-anchor="middle" class="room-name-label">{{ roomDisplayName(roomNames[index], index) }}</text>
        <text y="15" text-anchor="middle" class="room-area-label">{{ (roomAreaFor(allRooms[index]!) / scale ** 2).toFixed(1) }} m²</text>
      </g>
    </g>
    <g v-for="wall in wallSegments" :key="`wall-${wall.id}`">
      <line :x1="wall.start.x" :y1="wall.start.y" :x2="wall.end.x" :y2="wall.end.y" stroke="#45443f" stroke-width="10" stroke-linecap="square"/>
      <line :x1="wall.start.x" :y1="wall.start.y" :x2="wall.end.x" :y2="wall.end.y" stroke="#c6b9a8" stroke-width="1"/>
    </g>
    <g
      v-if="showCustomMeasurements"
      v-for="measurement in measurements"
      :key="`measure-${measurement.id}`"
      class="saved-measurement"
      @pointerenter="showMeasurementDelete(measurement.id)"
      @pointerleave="hideMeasurementDeleteLater(measurement.id)"
    >
      <line :x1="measurement.start.x" :y1="measurement.start.y" :x2="measurement.end.x" :y2="measurement.end.y" stroke="transparent" stroke-width="12" pointer-events="stroke"/>
      <line :x1="measurement.start.x" :y1="measurement.start.y" :x2="measurement.end.x" :y2="measurement.end.y" stroke="#628c75" stroke-width="2" stroke-dasharray="5 4"/>
      <circle :cx="measurement.start.x" :cy="measurement.start.y" r="3" fill="#628c75"/><circle :cx="measurement.end.x" :cy="measurement.end.y" r="3" fill="#628c75"/>
      <g :transform="fixedSizeGroupTransform({ x: (measurement.start.x + measurement.end.x) / 2, y: (measurement.start.y + measurement.end.y) / 2 })" pointer-events="none">
        <rect x="-32" y="-17" width="64" height="22" rx="6" fill="#fff" stroke="#d8e3da"/>
        <text y="-2" text-anchor="middle" class="measure-label">{{ formatLength(measurement.start, measurement.end) }}</text>
      </g>
      <g
        v-if="hoveredMeasurementId === measurement.id"
        class="measurement-delete-control"
        :transform="`${fixedSizeGroupTransform({ x: (measurement.start.x + measurement.end.x) / 2, y: (measurement.start.y + measurement.end.y) / 2 })} translate(40 -17)`"
        role="button"
        tabindex="0"
        :aria-label="`${t('Delete')} ${formatLength(measurement.start, measurement.end)} ${t('measurement')}`"
        @pointerenter="showMeasurementDelete(measurement.id)"
        @pointerleave="hideMeasurementDeleteLater(measurement.id)"
        @pointerdown.stop
        @click.stop.prevent="emit('measurementDelete', measurement.id)"
        @keydown.enter.stop.prevent="emit('measurementDelete', measurement.id)"
        @keydown.space.stop.prevent="emit('measurementDelete', measurement.id)"
      >
        <title>{{ t('Delete measurement') }}</title>
        <circle r="12" fill="transparent"/>
        <circle r="10" fill="#fff" stroke="#d8e3da"/>
        <path d="m-3-3 6 6m0-6-6 6" stroke="#a45e55" stroke-width="1.8" stroke-linecap="round"/>
      </g>
    </g>
    <g v-if="showCustomMeasurements && liveMeasurement" class="live-measurement" pointer-events="none">
      <line :x1="liveMeasurement.start.x" :y1="liveMeasurement.start.y" :x2="liveMeasurement.end.x" :y2="liveMeasurement.end.y" stroke="#4f8063" stroke-width="2" stroke-dasharray="5 4"/>
      <circle :cx="liveMeasurement.start.x" :cy="liveMeasurement.start.y" r="3" fill="#4f8063"/>
      <circle :cx="liveMeasurement.end.x" :cy="liveMeasurement.end.y" r="3" fill="#4f8063"/>
      <g :transform="fixedSizeGroupTransform(liveMeasurement.label)">
        <rect x="-32" y="-17" width="64" height="22" rx="6" fill="#fff" stroke="#cbd9ce"/>
        <text y="-2" text-anchor="middle" class="measure-label">{{ liveMeasurement.text }}</text>
      </g>
    </g>
    <g v-if="pendingPoint" class="pending-point"><circle :cx="pendingPoint.x" :cy="pendingPoint.y" r="6"/><circle :cx="pendingPoint.x" :cy="pendingPoint.y" r="12"/></g>
    <g v-if="(activeTool === 'room' || activeTool === 'addRoom') && (drawingRoomPoints.length || drawingCursor)">
      <polyline :points="[...drawingRoomPoints, ...(drawingCursor ? [drawingCursor] : [])].map((point) => `${point.x},${point.y}`).join(' ')" fill="none" stroke="#668371" stroke-width="4" stroke-dasharray="9 5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle v-for="(point, index) in drawingRoomPoints" :key="`room-point-${index}`" :cx="point.x" :cy="point.y" r="7" fill="#fff" stroke="#668371" stroke-width="3"/>
      <circle v-if="drawingCursor && drawingCursorSnapsToWall" :cx="drawingCursor.x" :cy="drawingCursor.y" r="9" fill="#e5f1e8" stroke="#4f8063" stroke-width="3"/>
      <g v-if="showDimensions && roomDraftMeasurement" class="room-draft-measurement" pointer-events="none">
        <line :x1="roomDraftMeasurement.start.x" :y1="roomDraftMeasurement.start.y" :x2="roomDraftMeasurement.end.x" :y2="roomDraftMeasurement.end.y" stroke="#4f8063" stroke-width="1.5" stroke-dasharray="5 4"/>
        <g :transform="fixedSizeGroupTransform(roomDraftMeasurement.label)">
          <rect x="-31" y="-12" width="62" height="22" rx="6" fill="#fff" stroke="#cbd9ce"/>
          <text y="3" text-anchor="middle" class="measure-label">{{ roomDraftMeasurement.text }}</text>
        </g>
      </g>
      <text v-if="drawingCursorClosesRoom" :x="drawingCursor?.x" :y="(drawingCursor?.y || 0) - 14" :transform="fixedSizeLabelTransform({ x: drawingCursor?.x || 0, y: (drawingCursor?.y || 0) - 14 })" text-anchor="middle" fill="#4f8063" font-size="10" font-weight="700">{{ t(activeTool === 'addRoom' ? 'FINISH ON WALL' : 'CLOSE ROOM') }}</text>
      <text v-else-if="activeTool === 'addRoom' && !drawingRoomPoints.length && drawingCursorSnapsToWall" :x="drawingCursor?.x" :y="(drawingCursor?.y || 0) - 14" :transform="fixedSizeLabelTransform({ x: drawingCursor?.x || 0, y: (drawingCursor?.y || 0) - 14 })" text-anchor="middle" fill="#4f8063" font-size="10" font-weight="700">{{ t('START HERE') }}</text>
    </g>
    <g v-for="item in renderItems" :key="item.id" class="plan-item" :class="{ 'is-selected': selectedId === item.id, 'is-dragging': isDragging && selectedId === item.id }" :transform="`translate(${item.x} ${item.y})`" @pointerdown="emit('itemPointerDown', $event, item)" @click.stop="emit('itemSelect', item.id)">
      <g :transform="`rotate(${displayRotations.get(item.id) ?? item.rotation})`">
        <FurniturePlanGraphic :item="item" />
        <rect v-if="selectedId === item.id" :x="-item.width / 2 - 6" :y="-item.depth / 2 - 6" :width="item.width + 12" :height="item.depth + 12" rx="12" fill="none" stroke="#668774" stroke-width="2" stroke-dasharray="4 3"/>
        <g
          v-if="selectedId === item.id && !getCatalogItem(item.kind).wallMounted"
          class="rotation-handle"
          :transform="`translate(${item.width / 2 + 14} ${-item.depth / 2 - 14}) rotate(${-item.rotation})`"
          @pointerdown="emit('rotationPointerDown', $event, item)"
          @click.stop
        >
          <title>{{ t('Drag to rotate · 10° steps · hold Shift for 1° steps') }}</title>
          <circle r="11" fill="#fff" stroke="#668774" stroke-width="1.5"/>
          <path d="M-4.7-4.7a6.7 6.7 0 1 1-1.8 6.9M-6.2-6.4v3.8h3.8" fill="none" stroke="#668774" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <title>{{ item.name || itemLabel(item.kind) }} · {{ item.width }} × {{ item.depth }} cm</title>
      </g>
    </g>
    <g v-if="activeTool === 'select' && roomCorners.length" class="room-corner-handles">
      <g
        v-for="(corner, index) in roomCorners"
        :key="`room-corner-${index}`"
        class="room-corner-handle"
        :transform="`translate(${corner.x} ${corner.y})`"
        :class="{ 'is-dragging': roomCornerDrag && samePoint(roomCornerDrag.corner, corner) }"
        :aria-label="t('Drag room corner to reshape · right-click to remove')"
        @pointerdown="emit('roomCornerPointerDown', $event, corner)"
        @click.stop
        @contextmenu.stop.prevent="emit('removeRoomCorner', corner)"
      >
        <title>{{ t('Drag room corner to reshape · right-click to remove') }}</title>
        <circle r="12" class="room-corner-hit-area"/>
        <circle r="6" class="room-corner-point"/>
      </g>
    </g>
    <g v-for="measurement in (showDimensions ? dragMeasurements : [])" :key="measurement.id" class="drag-measurement" pointer-events="none">
      <line :x1="measurement.start.x" :y1="measurement.start.y" :x2="measurement.end.x" :y2="measurement.end.y" stroke="#4f8063" stroke-width="1.5" stroke-dasharray="5 4"/>
      <circle :cx="measurement.start.x" :cy="measurement.start.y" r="2.5" fill="#4f8063"/>
      <circle :cx="measurement.end.x" :cy="measurement.end.y" r="2.5" fill="#4f8063"/>
      <g :transform="fixedSizeGroupTransform(measurement.label)">
        <rect x="-31" y="-12" width="62" height="22" rx="6" fill="#fff" stroke="#cbd9ce"/>
        <text y="3" text-anchor="middle" class="measure-label">{{ measurement.text }}</text>
      </g>
    </g>
    <text v-if="roomPoints.length" :x="roomBounds.x + roomBounds.width / 2" :y="roomBounds.y + roomBounds.height + 35" :transform="fixedSizeLabelTransform({ x: roomBounds.x + roomBounds.width / 2, y: roomBounds.y + roomBounds.height + 35 })" text-anchor="middle" class="room-caption">{{ allRooms.length }} {{ t(allRooms.length === 1 ? 'ROOM' : 'ROOMS') }} · {{ totalArea }} M²</text>
  </svg>
</template>
