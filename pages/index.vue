<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const RoomScene3D = defineAsyncComponent(() => import('~/components/RoomScene3D.vue'))
const { language, setLanguage, t } = useAppLanguage()

type Point = { x: number; y: number }
type FurnitureKind = 'chair' | 'table' | 'cupboard' | 'shelf' | 'cube' | 'window' | 'door'
type FurnitureSide = 'top' | 'right' | 'bottom' | 'left'
type PlanItem = {
  id: number
  kind: FurnitureKind
  x: number
  y: number
  width: number
  depth: number
  height: number
  floorOffset?: number
  rotation: number
  name?: string
  color?: string
}
type Wall = { id: number; start: Point; end: Point }
type Measurement = { id: number; start: Point; end: Point }
type RoomEdge = { id: string; start: Point; end: Point; label: Point; labelAngle: number; length: number; orientations: number[] }
type DragMeasurement = { id: string; start: Point; end: Point; label: Point; text: string }

const SCALE = 100
const VIEW_WIDTH = 960
const VIEW_HEIGHT = 680
const FURNITURE_WALL_SNAP_DISTANCE = 25
const WALL_THICKNESS = 12
const FURNITURE_WALL_CLEARANCE = 1
const FURNITURE_WALL_MIN_DISTANCE = WALL_THICKNESS / 2 + FURNITURE_WALL_CLEARANCE
const defaultRoomPoints: Point[] = [
  { x: 125, y: 95 },
  { x: 775, y: 95 },
  { x: 775, y: 575 },
  { x: 125, y: 575 },
]
const view = ref<'2d' | '3d'>('2d')
const activeTool = ref<'select' | 'room' | 'addRoom' | 'measure' | 'window' | 'door' | 'cube' | 'furniture'>('select')
const selectedCategory = ref('All items')
const selectedWallCategory = ref('All items')
const selectedId = ref<number | null>(null)
const pendingPoint = ref<Point | null>(null)
const measurementCursor = ref<Point | null>(null)
const hoveredMeasurementId = ref<number | null>(null)
const roomPoints = ref<Point[]>(defaultRoomPoints.map((point) => ({ ...point })))
const additionalRoomPoints = ref<Point[][]>([])
const roomNames = ref<string[]>(['Room 1'])
const drawingRoomPoints = ref<Point[]>([])
const drawingCursor = ref<Point | null>(null)
const drawingCursorClosesRoom = ref(false)
const drawingCursorSnapsToWall = ref(false)
const roomDrawingError = ref('')
const showNewFloorplanConfirmation = ref(false)
const projectMenuOpen = ref(false)
const zoom = ref(1)
const panOffset = ref<Point>({ x: 0, y: 0 })
const wallSegments = ref<Wall[]>([])
const measurements = ref<Measurement[]>([])
let measurementHoverTimeout: ReturnType<typeof setTimeout> | undefined
const nextId = ref(10)
const showGrid = ref(true)
const showDimensions = ref(true)
const showCustomMeasurements = ref(true)
const expandedRoomItems = ref<Record<number, boolean>>({})
const sidebarOpen = ref(true)
const canvasCard = ref<HTMLDivElement | null>(null)
const canvasCardWidth = ref(0)
let canvasResizeObserver: ResizeObserver | undefined
const isDragging = ref(false)
const isRotating = ref(false)
const isPanning = ref(false)
const activePointerId = ref<number | null>(null)
const panStartPointer = ref<Point>({ x: 0, y: 0 })
const panStartOffset = ref<Point>({ x: 0, y: 0 })
const dragOffset = ref<Point>({ x: 0, y: 0 })
const rotationStartPointerAngle = ref(0)
const rotationStartItemAngle = ref(0)
const ignoreNextCanvasClick = ref(false)
const heldArrowKeys = new Set<string>()
let keyboardMoveFrame = 0
let keyboardMoveStartedAt = 0
let keyboardMoveLastFrame = 0
const items = ref<PlanItem[]>([
  { id: 1, kind: 'table', x: 395, y: 305, width: 120, depth: 60, height: 75, rotation: 0 },
  { id: 2, kind: 'chair', x: 345, y: 280, width: 48, depth: 48, height: 88, rotation: 0 },
  { id: 3, kind: 'chair', x: 545, y: 280, width: 48, depth: 48, height: 88, rotation: 0 },
  { id: 4, kind: 'chair', x: 345, y: 385, width: 48, depth: 48, height: 88, rotation: 180 },
  { id: 5, kind: 'chair', x: 545, y: 385, width: 48, depth: 48, height: 88, rotation: 180 },
  { id: 6, kind: 'cupboard', x: 220, y: 140, width: 100, depth: 60, height: 190, rotation: 0 },
  { id: 7, kind: 'shelf', x: 700, y: 240, width: 100, depth: 40, height: 175, rotation: 0 },
])

const catalog = [
  { kind: 'chair' as const, label: 'Chair', detail: '48 × 48 cm', icon: 'chair' },
  { kind: 'table' as const, label: 'Table', detail: '120 × 60 cm', icon: 'table' },
  { kind: 'cupboard' as const, label: 'Cupboard', detail: '100 × 60 cm', icon: 'cupboard' },
  { kind: 'shelf' as const, label: 'Shelf', detail: '100 × 40 cm', icon: 'shelf' },
  { kind: 'cube' as const, label: 'Cube', detail: '100 × 100 cm', icon: 'cube' },
]
const categoryItems = computed(() => selectedCategory.value === 'All items'
  ? catalog
  : catalog.filter((entry) => selectedCategory.value === 'Misc'
    ? entry.kind === 'cube'
    : entry.kind !== 'cube'))
const wallDetailCategories = ['All items', 'Windows', 'Doors']
const wallDetailItems = computed(() => {
  if (selectedWallCategory.value === 'Windows') return ['window'] as const
  if (selectedWallCategory.value === 'Doors') return ['door'] as const
  return ['window', 'door'] as const
})
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
const placedCount = computed(() => items.value.length)
const roomBounds = computed(() => {
  const points = allRoomPoints.value.flat()
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  }
})
const liveMeasurement = computed(() => {
  const start = pendingPoint.value
  const end = measurementCursor.value
  if (activeTool.value !== 'measure' || !start || !end) return null
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const offset = 16
  return {
    start,
    end,
    label: {
      x: (start.x + end.x) / 2 + (dy / (length || 1)) * offset,
      y: (start.y + end.y) / 2 - (dx / (length || 1)) * offset,
    },
    text: `${(length / SCALE).toFixed(2)} m`,
  }
})
const allRooms = computed(() => roomPoints.value.length ? [roomPoints.value, ...additionalRoomPoints.value] : [])
const roomLabelPoints = computed(() => allRooms.value.map((room) => {
  let x = 0
  let y = 0
  let crossSum = 0
  for (let index = 0; index < room.length; index++) {
    const point = room[index]!
    const next = room[(index + 1) % room.length]!
    const cross = point.x * next.y - next.x * point.y
    crossSum += cross
    x += (point.x + next.x) * cross
    y += (point.y + next.y) * cross
  }
  if (Math.abs(crossSum) < 0.001) {
    return {
      x: room.reduce((sum, point) => sum + point.x, 0) / room.length,
      y: room.reduce((sum, point) => sum + point.y, 0) / room.length,
    }
  }
  return { x: x / (3 * crossSum), y: y / (3 * crossSum) }
}))
const allRoomPoints = computed(() => allRooms.value.flat())
const roomArea = computed(() => allRooms.value.reduce((area, room) => area + roomAreaFor(room), 0))
const roomItems = computed(() => allRooms.value.map((room, index) => ({
  index,
  items: items.value.filter((item) => roomIndexForItem(item) === index),
})))
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
const roomEdges = computed<RoomEdge[]>(() => {
  const edges: RoomEdge[] = []
  const seen = new Map<string, RoomEdge>()
  allRooms.value.forEach((room, roomIndex) => {
    const signedArea = room.reduce((area, point, index) => {
      const next = room[(index + 1) % room.length]!
      return area + point.x * next.y - next.x * point.y
    }, 0) / 2
    const orientation = Math.sign(signedArea) || 1
    room.forEach((start, index) => {
      const end = room[(index + 1) % room.length]!
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lengthSquared = dx * dx + dy * dy
      const cuts = allRoomPoints.value.flatMap((point) => {
        const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (lengthSquared || 1)
        const cross = Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx)
        return t > 0.001 && t < 0.999 && cross < 0.1 ? [{ point, t }] : []
      })
      const splitPoints = [
        start,
        ...cuts.sort((a, b) => a.t - b.t).map((cut) => cut.point),
        end,
      ]
      for (let segmentIndex = 0; segmentIndex < splitPoints.length - 1; segmentIndex++) {
        const segmentStart = splitPoints[segmentIndex]!
        const segmentEnd = splitPoints[segmentIndex + 1]!
        const startKey = `${segmentStart.x.toFixed(2)},${segmentStart.y.toFixed(2)}`
        const endKey = `${segmentEnd.x.toFixed(2)},${segmentEnd.y.toFixed(2)}`
        const edgeKey = [startKey, endKey].sort().join('|')
        const existingEdge = seen.get(edgeKey)
        if (existingEdge) {
          existingEdge.orientations.push(orientation)
          continue
        }
        const segmentDx = segmentEnd.x - segmentStart.x
        const segmentDy = segmentEnd.y - segmentStart.y
        const length = Math.hypot(segmentDx, segmentDy)
        const offset = 20
        const labelAngle = Math.atan2(segmentDy, segmentDx) * 180 / Math.PI
        const readableAngle = labelAngle > 90 || labelAngle < -90 ? labelAngle + 180 : labelAngle
        const edge: RoomEdge = {
          id: `${roomIndex}-${index}-${segmentIndex}`,
          start: segmentStart,
          end: segmentEnd,
          orientations: [orientation],
          label: {
            x: (segmentStart.x + segmentEnd.x) / 2 + (segmentDy / (length || 1)) * offset * orientation,
            y: (segmentStart.y + segmentEnd.y) / 2 - (segmentDx / (length || 1)) * offset * orientation,
          },
          labelAngle: readableAngle,
          length: length / SCALE,
        }
        edges.push(edge)
        seen.set(edgeKey, edge)
      }
    })
  })
  return edges
})
const roomDimensionLabels = computed(() => roomEdges.value.flatMap((edge) => {
  const dx = edge.end.x - edge.start.x
  const dy = edge.end.y - edge.start.y
  const edgeLength = Math.hypot(dx, dy)
  const openings = items.value
    .filter((item) => item.kind === 'door' || item.kind === 'window')
    .flatMap((item) => {
      const projected = projectPointToSegment({ x: item.x, y: item.y }, edge.start, edge.end)
      if (Math.hypot(projected.x - item.x, projected.y - item.y) > 10) return []
      const center = edgeParameter(projected, edge.start, edge.end) * edgeLength
      const halfWidth = item.width / 2
      const start = Math.max(0, center - halfWidth)
      const end = Math.min(edgeLength, center + halfWidth)
      return end > start ? [{ start, end }] : []
    })
    .sort((first, second) => first.start - second.start)
  const wallSegments: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const opening of openings) {
    if (opening.start > cursor) wallSegments.push({ start: cursor, end: opening.start })
    cursor = Math.max(cursor, opening.end)
  }
  if (cursor < edgeLength) wallSegments.push({ start: cursor, end: edgeLength })

  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  const readableAngle = angle > 90 || angle < -90 ? angle + 180 : angle
  const orientation = edge.orientations[0] || 1
  const pointAtDistance = (distance: number, side: number): Point => ({
    x: edge.start.x + (dx / (edgeLength || 1)) * distance + (dy / (edgeLength || 1)) * side,
    y: edge.start.y + (dy / (edgeLength || 1)) * distance - (dx / (edgeLength || 1)) * side,
  })
  const segmentLabels = wallSegments.filter((segment) => segment.end - segment.start >= 3).map((segment, index) => {
    const middle = (segment.start + segment.end) / 2
    return {
      id: `${edge.id}-${index}`,
      label: pointAtDistance(middle, 20 * orientation),
      labelAngle: readableAngle,
      text: `${((segment.end - segment.start) / SCALE).toFixed(2)} m`,
    }
  })
  if (!openings.length) return segmentLabels
  return [
    ...segmentLabels,
    {
      id: `${edge.id}-full`,
      label: pointAtDistance(edgeLength / 2, -20 * orientation),
      labelAngle: readableAngle,
      text: `${(edgeLength / SCALE).toFixed(2)} m`,
    },
  ]
}))
const roomDraftMeasurement = computed(() => {
  const start = drawingRoomPoints.value.at(-1)
  const end = drawingCursor.value
  if ((activeTool.value !== 'room' && activeTool.value !== 'addRoom') || !start || !end) return null
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const offset = 16
  return {
    start,
    end,
    label: {
      x: (start.x + end.x) / 2 + (dy / (length || 1)) * offset,
      y: (start.y + end.y) / 2 - (dx / (length || 1)) * offset,
    },
    text: `${(length / SCALE).toFixed(2)} m`,
  }
})
const dragMeasurements = computed<DragMeasurement[]>(() => {
  if (!isDragging.value || isRotating.value || !selectedItem.value || !showDimensions.value) return []
  const item = selectedItem.value
  if (item.kind === 'door' || item.kind === 'window') {
    const edge = nearestRoomEdge({ x: item.x, y: item.y })
    const projection = projectOnEdge({ x: item.x, y: item.y }, edge, item.width / 2)
    const fromStart = Math.max(0, projection.distance - item.width / 2)
    const fromEnd = Math.max(0, edge.length * SCALE - projection.distance - item.width / 2)
    const direction = {
      x: (edge.end.x - edge.start.x) / (edge.length * SCALE || 1),
      y: (edge.end.y - edge.start.y) / (edge.length * SCALE || 1),
    }
    const halfWidth = item.width / 2
    const normal = { x: -direction.y, y: direction.x }
    const measurementOffset = 22
    return [
      {
        id: 'wall-start',
        start: {
          x: item.x - direction.x * halfWidth + normal.x * measurementOffset,
          y: item.y - direction.y * halfWidth + normal.y * measurementOffset,
        },
        end: {
          x: edge.start.x + normal.x * measurementOffset,
          y: edge.start.y + normal.y * measurementOffset,
        },
        label: {
          x: (item.x - direction.x * halfWidth + edge.start.x) / 2 + normal.x * measurementOffset,
          y: (item.y - direction.y * halfWidth + edge.start.y) / 2 + normal.y * measurementOffset,
        },
        text: `${(fromStart / SCALE).toFixed(2)} m`,
      },
      {
        id: 'wall-end',
        start: {
          x: item.x + direction.x * halfWidth + normal.x * measurementOffset,
          y: item.y + direction.y * halfWidth + normal.y * measurementOffset,
        },
        end: {
          x: edge.end.x + normal.x * measurementOffset,
          y: edge.end.y + normal.y * measurementOffset,
        },
        label: {
          x: (item.x + direction.x * halfWidth + edge.end.x) / 2 + normal.x * measurementOffset,
          y: (item.y + direction.y * halfWidth + edge.end.y) / 2 + normal.y * measurementOffset,
        },
        text: `${(fromEnd / SCALE).toFixed(2)} m`,
      },
    ]
  }

  const rotation = item.rotation * Math.PI / 180
  const widthAxis = { x: Math.cos(rotation), y: Math.sin(rotation) }
  const depthAxis = { x: -Math.sin(rotation), y: Math.cos(rotation) }
  const directions = [
    { id: 'top', x: 0, y: -1 },
    { id: 'right', x: 1, y: 0 },
    { id: 'bottom', x: 0, y: 1 },
    { id: 'left', x: -1, y: 0 },
  ]
  return directions.flatMap((direction) => {
    const boundary = distanceToRoomBoundary({ x: item.x, y: item.y }, direction)
    if (boundary === null) return []
    const objectExtent = Math.abs(direction.x * widthAxis.x + direction.y * widthAxis.y) * item.width / 2
      + Math.abs(direction.x * depthAxis.x + direction.y * depthAxis.y) * item.depth / 2
    const gap = Math.max(0, boundary - objectExtent)
    const start = {
      x: item.x + direction.x * objectExtent,
      y: item.y + direction.y * objectExtent,
    }
    const end = {
      x: item.x + direction.x * boundary,
      y: item.y + direction.y * boundary,
    }
    return [{
      id: direction.id,
      start,
      end,
      label: {
        x: (start.x + end.x) / 2 + (direction.x === 0 ? 14 : 0),
        y: (start.y + end.y) / 2 + (direction.y === 0 ? -12 : 0),
      },
      text: `${(gap / SCALE).toFixed(2)} m`,
    }]
  })
})
const planViewBox = computed(() => {
  const width = VIEW_WIDTH / zoom.value
  const height = VIEW_HEIGHT / zoom.value
  return `${(VIEW_WIDTH - width) / 2 + panOffset.value.x} ${(VIEW_HEIGHT - height) / 2 + panOffset.value.y} ${width} ${height}`
})
function fixedSizeLabelTransform(point: Point, rotation = 0) {
  return `translate(${point.x} ${point.y}) scale(${1 / Math.min(zoom.value, 2)}) rotate(${rotation}) translate(${-point.x} ${-point.y})`
}
function fixedSizeGroupTransform(point: Point) {
  return `translate(${point.x} ${point.y}) scale(${1 / Math.min(zoom.value, 2)})`
}
const scaleBar = computed(() => {
  if (!canvasCardWidth.value) return { label: '1 m', width: 40 }
  const pixelsPerMeter = canvasCardWidth.value * zoom.value * SCALE / VIEW_WIDTH
  const magnitude = 10 ** Math.floor(Math.log10(80 / pixelsPerMeter))
  const candidates = [magnitude, magnitude * 2, magnitude * 5, magnitude * 10]
  const meters = candidates.reduce((best, candidate) =>
    Math.abs(candidate * pixelsPerMeter - 80) < Math.abs(best * pixelsPerMeter - 80) ? candidate : best)
  const label = meters >= 1
    ? `${Number(meters.toFixed(2))} m`
    : `${Math.round(meters * 100)} cm`
  return { label, width: meters * pixelsPerMeter }
})

function projectPointToSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return { ...start }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return { x: start.x + t * dx, y: start.y + t * dy }
}

function nearestRoomBoundaryPoint(point: Point) {
  let nearest: { point: Point; distance: number } | null = null
  for (const edge of roomEdges.value) {
    const projected = projectPointToSegment(point, edge.start, edge.end)
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y)
    if (!nearest || distance < nearest.distance) nearest = { point: projected, distance }
  }
  return nearest
}

function roomBoundaryRoutes(room: Point[], start: Point, end: Point) {
  const startEdges = room.flatMap((edgeStart, index) => {
    const edgeEnd = room[(index + 1) % room.length]!
    const projected = projectPointToSegment(start, edgeStart, edgeEnd)
    return Math.hypot(projected.x - start.x, projected.y - start.y) <= 0.1
      ? [{ index, t: edgeParameter(projected, edgeStart, edgeEnd) }]
      : []
  })
  const endEdges = room.flatMap((edgeStart, index) => {
    const edgeEnd = room[(index + 1) % room.length]!
    const projected = projectPointToSegment(end, edgeStart, edgeEnd)
    return Math.hypot(projected.x - end.x, projected.y - end.y) <= 0.1
      ? [{ index, t: edgeParameter(projected, edgeStart, edgeEnd) }]
      : []
  })
  const routes: Point[][] = []
  for (const startEdge of startEdges) {
    for (const endEdge of endEdges) {
      for (const direction of [1, -1]) {
        const route: Point[] = [{ ...start }]
        let edgeIndex = startEdge.index
        let steps = 0
        while (steps <= room.length) {
          const atEndEdge = edgeIndex === endEdge.index
          const endIsAhead = direction > 0 ? endEdge.t >= startEdge.t : endEdge.t <= startEdge.t
          const canReachEndOnEdge = atEndEdge
            && (edgeIndex !== startEdge.index || endIsAhead || steps >= room.length)
          if (canReachEndOnEdge) {
            if (!samePoint(route.at(-1)!, end)) route.push({ ...end })
            break
          }

          const vertexIndex = direction > 0
            ? (edgeIndex + 1) % room.length
            : edgeIndex
          const vertex = room[vertexIndex]!
          if (!samePoint(route.at(-1)!, vertex)) route.push({ ...vertex })
          edgeIndex = direction > 0
            ? (edgeIndex + 1) % room.length
            : (edgeIndex - 1 + room.length) % room.length
          steps++
        }
        if (samePoint(route.at(-1)!, end) && route.length > 1) routes.push(route)
      }
    }
  }
  return routes
}

function edgeParameter(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
  return Math.abs(cross) <= 0.1
    && point.x >= Math.min(start.x, end.x) - 0.1
    && point.x <= Math.max(start.x, end.x) + 0.1
    && point.y >= Math.min(start.y, end.y) - 0.1
    && point.y <= Math.max(start.y, end.y) + 0.1
}

function samePoint(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y) <= 0.1
}

function nearestRoomEdge(point: Point) {
  return roomEdges.value.reduce((nearest, edge) => {
    const nearestPoint = projectPointToSegment(point, nearest.start, nearest.end)
    const edgePoint = projectPointToSegment(point, edge.start, edge.end)
    return Math.hypot(edgePoint.x - point.x, edgePoint.y - point.y)
      < Math.hypot(nearestPoint.x - point.x, nearestPoint.y - point.y)
      ? edge
      : nearest
  }, roomEdges.value[0]!)
}

function sideVector(side: FurnitureSide): Point {
  if (side === 'top') return { x: 0, y: -1 }
  if (side === 'right') return { x: 1, y: 0 }
  if (side === 'bottom') return { x: 0, y: 1 }
  return { x: -1, y: 0 }
}

function defaultRearSide(kind: FurnitureKind, width: number, depth: number): FurnitureSide {
  if (kind === 'chair') return 'top'
  if (kind === 'table') return width >= depth ? 'top' : 'left'
  if (kind === 'cupboard' || kind === 'shelf') return width >= depth ? 'top' : 'left'
  return 'top'
}

function snapFurnitureToWall(point: Point, item: PlanItem) {
  const candidates = [
    ...roomEdges.value.flatMap((edge) => edge.orientations.map((orientation) => ({
      start: edge.start,
      end: edge.end,
      isPerimeter: true,
      orientation,
    }))),
    ...wallSegments.value.map((wall) => ({ start: wall.start, end: wall.end, isPerimeter: false, orientation: 1 })),
  ]
  let nearest: { point: Point; rotation: number; distance: number } | null = null

  for (const edge of candidates) {
    const dx = edge.end.x - edge.start.x
    const dy = edge.end.y - edge.start.y
    const length = Math.hypot(dx, dy)
    if (length < 0.001) continue
    const tangent = { x: dx / length, y: dy / length }
    const normal = { x: -tangent.y, y: tangent.x }
    const projected = projectPointToSegment(point, edge.start, edge.end)
    let towardWall = { x: projected.x - point.x, y: projected.y - point.y }
    let distance = Math.hypot(towardWall.x, towardWall.y)
    if (edge.isPerimeter) {
      const inward = edge.orientation > 0 ? normal : { x: -normal.x, y: -normal.y }
      const insideDistance = (point.x - projected.x) * inward.x + (point.y - projected.y) * inward.y
      if (insideDistance < -0.001) continue
      if (distance < 0.001) {
        towardWall = { x: -inward.x, y: -inward.y }
        distance = 0
      }
    } else if (distance < 0.001) {
      towardWall = normal
    }

    towardWall = { x: towardWall.x / (distance || 1), y: towardWall.y / (distance || 1) }
    const rear = sideVector(defaultRearSide(item.kind, item.width, item.depth))
    const rotation = Math.atan2(towardWall.y, towardWall.x) - Math.atan2(rear.y, rear.x)
    const widthAxis = { x: Math.cos(rotation), y: Math.sin(rotation) }
    const depthAxis = { x: -Math.sin(rotation), y: Math.cos(rotation) }
    const normalExtent = Math.abs(towardWall.x * widthAxis.x + towardWall.y * widthAxis.y) * item.width / 2
      + Math.abs(towardWall.x * depthAxis.x + towardWall.y * depthAxis.y) * item.depth / 2
    const wallGap = distance - normalExtent - WALL_THICKNESS / 2
    if (wallGap > FURNITURE_WALL_SNAP_DISTANCE || (nearest && wallGap >= nearest.distance)) continue

    const tangentExtent = Math.abs(tangent.x * widthAxis.x + tangent.y * widthAxis.y) * item.width / 2
      + Math.abs(tangent.x * depthAxis.x + tangent.y * depthAxis.y) * item.depth / 2
    if (length < tangentExtent * 2) continue
    const aligned = projectOnEdge(point, {
      id: '-1',
      start: edge.start,
      end: edge.end,
      label: edge.start,
      labelAngle: 0,
      length: length / SCALE,
      orientations: [edge.orientation],
    }, tangentExtent)
    const snappedPoint = {
      x: aligned.point.x - towardWall.x * (normalExtent + WALL_THICKNESS / 2 + FURNITURE_WALL_CLEARANCE),
      y: aligned.point.y - towardWall.y * (normalExtent + WALL_THICKNESS / 2 + FURNITURE_WALL_CLEARANCE),
    }
    if (!isFurniturePlacementValid(snappedPoint, item, rotation * 180 / Math.PI)) continue
    nearest = {
      point: snappedPoint,
      rotation: rotation * 180 / Math.PI,
      distance: wallGap,
    }
  }

  return nearest
}

function projectOnEdge(point: Point, edge: RoomEdge, padding: number) {
  const edgeLength = edge.length * SCALE
  const dx = edge.end.x - edge.start.x
  const dy = edge.end.y - edge.start.y
  const lengthSquared = dx * dx + dy * dy
  const rawT = lengthSquared
    ? ((point.x - edge.start.x) * dx + (point.y - edge.start.y) * dy) / lengthSquared
    : 0.5
  const minT = edgeLength > 2 * padding ? padding / edgeLength : 0.5
  const maxT = edgeLength > 2 * padding ? 1 - minT : 0.5
  const t = Math.max(minT, Math.min(maxT, rawT))
  return {
    point: { x: edge.start.x + dx * t, y: edge.start.y + dy * t },
    distance: edgeLength * t,
  }
}

function distanceToRoomBoundary(origin: Point, direction: Point) {
  let nearest: number | null = null
  for (const edge of roomEdges.value) {
    const segment = { x: edge.end.x - edge.start.x, y: edge.end.y - edge.start.y }
    const offset = { x: edge.start.x - origin.x, y: edge.start.y - origin.y }
    const denominator = direction.x * segment.y - direction.y * segment.x
    if (Math.abs(denominator) < 0.001) continue
    const rayDistance = (offset.x * segment.y - offset.y * segment.x) / denominator
    const edgeT = (offset.x * direction.y - offset.y * direction.x) / denominator
    if (rayDistance >= -0.001 && edgeT >= -0.001 && edgeT <= 1.001 && (nearest === null || rayDistance < nearest)) {
      nearest = Math.max(0, rayDistance)
    }
  }
  return nearest
}

function isPointInsidePolygon(point: Point, polygon: Point[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]!
    const last = polygon[previous]!
    const crosses = (current.y > point.y) !== (last.y > point.y)
      && point.x < ((last.x - current.x) * (point.y - current.y)) / (last.y - current.y) + current.x
    if (crosses) inside = !inside
  }
  return inside
}

function isPointInsideRoom(point: Point) {
  return allRooms.value.some((room) => isPointInsidePolygon(point, room))
}

function roomIndexForItem(item: PlanItem) {
  const center = { x: item.x, y: item.y }
  const interiorRoomIndex = allRooms.value.findIndex((room) => isPointInsidePolygon(center, room))
  if (interiorRoomIndex >= 0) return interiorRoomIndex
  return allRooms.value.findIndex((room) => room.some((start, index) =>
    pointOnSegment(center, start, room[(index + 1) % room.length]!)))
}

function isRoomItemListExpanded(roomIndex: number) {
  return expandedRoomItems.value[roomIndex] ?? true
}

function toggleRoomItemList(roomIndex: number) {
  expandedRoomItems.value[roomIndex] = !isRoomItemListExpanded(roomIndex)
}

function distanceBetweenSegments(a: Point, b: Point, c: Point, d: Point) {
  if (segmentsIntersect(a, b, c, d)) return 0
  const distanceToSegment = (point: Point, start: Point, end: Point) => {
    const projected = projectPointToSegment(point, start, end)
    return Math.hypot(projected.x - point.x, projected.y - point.y)
  }
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  )
}

function furnitureFootprint(center: Point, item: PlanItem, rotation = item.rotation) {
  const angle = rotation * Math.PI / 180
  const widthAxis = { x: Math.cos(angle), y: Math.sin(angle) }
  const depthAxis = { x: -Math.sin(angle), y: Math.cos(angle) }
  return [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ].map((corner) => ({
    x: center.x + widthAxis.x * corner.x * item.width / 2 + depthAxis.x * corner.y * item.depth / 2,
    y: center.y + widthAxis.y * corner.x * item.width / 2 + depthAxis.y * corner.y * item.depth / 2,
  }))
}

function isFurniturePlacementValid(center: Point, item: PlanItem, rotation = item.rotation) {
  const footprint = furnitureFootprint(center, item, rotation)
  const samples = [
    ...footprint,
    center,
    ...footprint.map((point, index) => {
      const next = footprint[(index + 1) % footprint.length]!
      return { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }
    }),
  ]
  if (samples.some((point) => !isPointInsideRoom(point))) return false

  const allWalls = [
    ...roomEdges.value.map((edge) => ({ start: edge.start, end: edge.end })),
    ...wallSegments.value,
  ]
  for (const wall of allWalls) {
    if (isPointInsidePolygon(wall.start, footprint) || isPointInsidePolygon(wall.end, footprint)) return false
    for (let index = 0; index < footprint.length; index++) {
      const start = footprint[index]!
      const end = footprint[(index + 1) % footprint.length]!
      if (distanceBetweenSegments(start, end, wall.start, wall.end) < FURNITURE_WALL_MIN_DISTANCE) return false
    }
  }
  return true
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

function segmentsProperlyIntersect(a: Point, b: Point, c: Point, d: Point) {
  const cross = (start: Point, end: Point, point: Point) =>
    (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
  const firstC = cross(a, b, c)
  const firstD = cross(a, b, d)
  const secondA = cross(c, d, a)
  const secondB = cross(c, d, b)
  return ((firstC > 0.001 && firstD < -0.001) || (firstC < -0.001 && firstD > 0.001))
    && ((secondA > 0.001 && secondB < -0.001) || (secondA < -0.001 && secondB > 0.001))
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
    table: [120, 60, 75],
    cupboard: [100, 60, 190],
    shelf: [100, 40, 175],
    cube: [100, 100, 100],
    window: [110, 12, 130],
    door: [90, 15, 205],
  }
  return sizes[kind]
}

function addItem(kind: FurnitureKind, at?: Point) {
  if (!roomPoints.value.length) {
    roomDrawingError.value = 'Finish drawing the floorplan before adding items.'
    activeTool.value = 'room'
    view.value = '2d'
    return
  }
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
    floorOffset: kind === 'window' ? 100 : 0,
    rotation: kind === 'window' || kind === 'door' ? edgeAngle : 0,
  }
  items.value.push(item)
  selectedId.value = id
  activeTool.value = 'select'
  pendingPoint.value = null
}

function selectTool(tool: typeof activeTool.value) {
  clearCanvasDraft()
  activeTool.value = tool
  selectedId.value = null
}

function clearCanvasDraft() {
  drawingRoomPoints.value = []
  drawingCursor.value = null
  drawingCursorClosesRoom.value = false
  drawingCursorSnapsToWall.value = false
  roomDrawingError.value = ''
  pendingPoint.value = null
  measurementCursor.value = null
}

function cancelActiveCanvasAction() {
  clearCanvasDraft()
  activeTool.value = 'select'
  selectedId.value = null
}

function svgPoint(event: MouseEvent | PointerEvent, svg = event.currentTarget as SVGSVGElement): Point {
  const matrix = svg.getScreenCTM()
  if (!matrix) return { ...roomCenter.value }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

function getRoomDrawingPoint(rawPoint: Point, shiftKey: boolean) {
  const point = {
    x: Math.max(20, Math.min(VIEW_WIDTH - 20, rawPoint.x)),
    y: Math.max(20, Math.min(VIEW_HEIGHT - 20, rawPoint.y)),
  }
  if (activeTool.value === 'addRoom') {
    const boundary = nearestRoomBoundaryPoint(point)
    const first = drawingRoomPoints.value[0]
    if (!first) {
      drawingCursorSnapsToWall.value = Boolean(boundary && boundary.distance <= 25)
      return boundary && boundary.distance <= 25 ? boundary.point : point
    }
    if (drawingRoomPoints.value.length >= 3 && boundary && boundary.distance <= 20
      && Math.hypot(boundary.point.x - first.x, boundary.point.y - first.y) >= 25) {
      drawingCursorClosesRoom.value = true
      drawingCursorSnapsToWall.value = true
      return boundary.point
    }
    drawingCursorClosesRoom.value = false
    drawingCursorSnapsToWall.value = false
    if (shiftKey) return point
    const previous = drawingRoomPoints.value.at(-1)!
    const dx = point.x - previous.x
    const dy = point.y - previous.y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.001) return { ...previous }
    const increment = Math.PI / 18
    const angle = Math.round(Math.atan2(dy, dx) / increment) * increment
    return {
      x: previous.x + Math.cos(angle) * distance,
      y: previous.y + Math.sin(angle) * distance,
    }
  }
  if (shiftKey) {
    drawingCursorClosesRoom.value = false
    return point
  }

  const first = drawingRoomPoints.value[0]
  if (first && drawingRoomPoints.value.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) <= 20) {
    drawingCursorClosesRoom.value = true
    return { ...first }
  }
  drawingCursorClosesRoom.value = false

  const previous = drawingRoomPoints.value.at(-1)
  if (!previous) {
    return { x: Math.round(point.x / 10) * 10, y: Math.round(point.y / 10) * 10 }
  }

  const dx = point.x - previous.x
  const dy = point.y - previous.y
  const distance = Math.hypot(dx, dy)
  if (distance < 0.001) return { ...previous }
  const increment = Math.PI / 18
  const angle = Math.round(Math.atan2(dy, dx) / increment) * increment
  return {
    x: previous.x + Math.cos(angle) * distance,
    y: previous.y + Math.sin(angle) * distance,
  }
}

function onCanvasClick(event: MouseEvent) {
  if (event.button !== 0) return
  if (ignoreNextCanvasClick.value) {
    ignoreNextCanvasClick.value = false
    return
  }
  if ((event.target as Element).closest('.plan-item')) return
  const rawPoint = svgPoint(event)
  if (!allRooms.value.length && activeTool.value === 'select') {
    activeTool.value = 'room'
    selectedId.value = null
  }
  if (activeTool.value === 'room' || activeTool.value === 'addRoom') {
    if (activeTool.value === 'addRoom' && !drawingRoomPoints.value.length) {
      const boundary = nearestRoomBoundaryPoint(rawPoint)
      if (!boundary || boundary.distance > 25) {
        roomDrawingError.value = 'Start on an existing room wall or corner.'
        return
      }
      drawingRoomPoints.value.push(boundary.point)
      drawingCursor.value = boundary.point
      drawingCursorSnapsToWall.value = true
      roomDrawingError.value = ''
      return
    }
    const point = getRoomDrawingPoint(rawPoint, event.shiftKey)
    if (activeTool.value === 'addRoom' && drawingCursorClosesRoom.value) {
      finishRoomAddition(point)
      return
    }
    if (drawingCursorClosesRoom.value) {
      finishRoomDrawing()
      return
    }
    const previous = drawingRoomPoints.value.at(-1)
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 10) return
    roomDrawingError.value = ''
    drawingRoomPoints.value.push(point)
    return
  }
  const point = {
    x: Math.max(20, Math.min(VIEW_WIDTH - 20, Math.round(rawPoint.x / 10) * 10)),
    y: Math.max(20, Math.min(VIEW_HEIGHT - 20, Math.round(rawPoint.y / 10) * 10)),
  }
  if (activeTool.value === 'measure') {
    if (!pendingPoint.value) {
      pendingPoint.value = point
      measurementCursor.value = point
    }
    else {
      measurements.value.push({ id: nextId.value++, start: pendingPoint.value, end: point })
      pendingPoint.value = null
      measurementCursor.value = null
    }
    return
  }
  if (activeTool.value === 'window' || activeTool.value === 'door' || activeTool.value === 'cube') {
    addItem(activeTool.value, point)
    return
  }
  selectedId.value = null
}

function onCanvasPointerDown(event: PointerEvent) {
  if (event.button !== 2 || !event.isPrimary || view.value !== '2d') return
  event.preventDefault()
  const svg = event.currentTarget as SVGSVGElement
  svg.setPointerCapture(event.pointerId)
  activePointerId.value = event.pointerId
  panStartPointer.value = { x: event.clientX, y: event.clientY }
  panStartOffset.value = { ...panOffset.value }
  isPanning.value = true
}

function onCanvasContextMenu(event: MouseEvent) {
  event.preventDefault()
  if (activeTool.value !== 'select') cancelActiveCanvasAction()
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
  ignoreNextCanvasClick.value = true
  activePointerId.value = event.pointerId
  isDragging.value = true
}

function rotationHandlePointerDown(event: PointerEvent, item: PlanItem) {
  event.stopPropagation()
  selectedId.value = item.id
  if (activeTool.value !== 'select' || !event.isPrimary || event.button !== 0) return
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (!svg) return
  const pointer = svgPoint(event, svg)
  rotationStartPointerAngle.value = Math.atan2(pointer.y - item.y, pointer.x - item.x) * 180 / Math.PI
  rotationStartItemAngle.value = item.rotation
  svg.setPointerCapture(event.pointerId)
  ignoreNextCanvasClick.value = true
  activePointerId.value = event.pointerId
  isRotating.value = true
  isDragging.value = true
}

function onCanvasPointerMove(event: PointerEvent) {
  if (isPanning.value && activePointerId.value === event.pointerId) {
    const svg = event.currentTarget as SVGSVGElement
    const bounds = svg.getBoundingClientRect()
    const viewBoxWidth = VIEW_WIDTH / zoom.value
    const viewBoxHeight = VIEW_HEIGHT / zoom.value
    panOffset.value = {
      x: panStartOffset.value.x - (event.clientX - panStartPointer.value.x) * viewBoxWidth / bounds.width,
      y: panStartOffset.value.y - (event.clientY - panStartPointer.value.y) * viewBoxHeight / bounds.height,
    }
    return
  }
  if (activeTool.value === 'room' || activeTool.value === 'addRoom') {
    drawingCursor.value = getRoomDrawingPoint(svgPoint(event), event.shiftKey)
  }
  if (activeTool.value === 'measure' && pendingPoint.value) {
    const pointerPoint = svgPoint(event)
    measurementCursor.value = {
      x: Math.round(pointerPoint.x / 10) * 10,
      y: Math.round(pointerPoint.y / 10) * 10,
    }
  }
  if (!isDragging.value || selectedId.value === null || activePointerId.value !== event.pointerId) return
  const pointerPoint = svgPoint(event)
  const point = { x: pointerPoint.x + dragOffset.value.x, y: pointerPoint.y + dragOffset.value.y }
  const item = items.value.find((entry) => entry.id === selectedId.value)
  if (!item) return
  if (isRotating.value) {
    const pointerAngle = Math.atan2(pointerPoint.y - item.y, pointerPoint.x - item.x) * 180 / Math.PI
    let angleDelta = pointerAngle - rotationStartPointerAngle.value
    if (angleDelta > 180) angleDelta -= 360
    if (angleDelta < -180) angleDelta += 360
    const increment = event.shiftKey ? 1 : 10
    const rotation = rotationStartItemAngle.value + Math.round(angleDelta / increment) * increment
    if (isFurniturePlacementValid({ x: item.x, y: item.y }, item, rotation)) item.rotation = rotation
    return
  }
  if (item.kind === 'door' || item.kind === 'window') {
    const edge = nearestRoomEdge(point)
    const projected = projectOnEdge(point, edge, item.width / 2)
    item.x = projected.point.x
    item.y = projected.point.y
    item.rotation = Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) * 180 / Math.PI
  } else {
    const snapped = snapFurnitureToWall(point, item)
    if (snapped) {
      item.x = snapped.point.x
      item.y = snapped.point.y
      item.rotation = snapped.rotation
    } else if (isFurniturePlacementValid(point, item)) {
      item.x = point.x
      item.y = point.y
    }
  }
}

function stopDragging() {
  isDragging.value = false
  isRotating.value = false
  isPanning.value = false
  activePointerId.value = null
  window.setTimeout(() => {
    ignoreNextCanvasClick.value = false
  }, 0)
}

function beginRoomDrawing() {
  projectMenuOpen.value = false
  showNewFloorplanConfirmation.value = true
}

function cancelNewFloorplan() {
  showNewFloorplanConfirmation.value = false
}

function confirmNewFloorplan() {
  showNewFloorplanConfirmation.value = false
  items.value = []
  wallSegments.value = []
  measurements.value = []
  roomPoints.value = []
  additionalRoomPoints.value = []
  roomNames.value = []
  drawingRoomPoints.value = []
  drawingCursor.value = null
  drawingCursorClosesRoom.value = false
  drawingCursorSnapsToWall.value = false
  roomDrawingError.value = ''
  pendingPoint.value = null
  measurementCursor.value = null
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
  additionalRoomPoints.value = []
  roomNames.value = ['Room 1']
  items.value = []
  wallSegments.value = []
  measurements.value = []
  drawingRoomPoints.value = []
  drawingCursor.value = null
  drawingCursorClosesRoom.value = false
  drawingCursorSnapsToWall.value = false
  roomDrawingError.value = ''
  activeTool.value = 'addRoom'
}

function beginRoomAddition() {
  clearCanvasDraft()
  selectedId.value = null
  activeTool.value = allRooms.value.length ? 'addRoom' : 'room'
  view.value = '2d'
}

function finishRoomAddition(endPoint: Point) {
  const trace = drawingRoomPoints.value.map((point) => ({ ...point }))
  if (trace.length < 3 || Math.hypot(trace[0]!.x - endPoint.x, trace[0]!.y - endPoint.y) < 25) {
    roomDrawingError.value = 'Finish at a different point on an existing wall.'
    return
  }
  const traceWithEnd = [...trace, { ...endPoint }]
  const existingRooms = allRooms.value
  const startPoint = trace[0]!
  const routes = existingRooms.flatMap((room) => roomBoundaryRoutes(room, endPoint, startPoint))
  if (!routes.length) {
    roomDrawingError.value = 'Finish on a wall connected to the wall where the room started.'
    return
  }

  const allExistingWalls = [
    ...roomEdges.value.map((edge) => ({ start: edge.start, end: edge.end })),
    ...wallSegments.value,
  ]
  const traceCrossesWall = traceWithEnd.slice(0, -1).some((start, index) => {
    const end = traceWithEnd[index + 1]!
    return allExistingWalls.some((wall) => {
      if (!segmentsIntersect(start, end, wall.start, wall.end)) return false
      const allowedStartContact = samePoint(start, startPoint) && pointOnSegment(startPoint, wall.start, wall.end)
      const allowedEndContact = samePoint(end, endPoint) && pointOnSegment(endPoint, wall.start, wall.end)
      const crossesThroughWall = segmentsProperlyIntersect(start, end, wall.start, wall.end)
        || [wall.start, wall.end].some((wallPoint) =>
          pointOnSegment(wallPoint, start, end) && !samePoint(wallPoint, startPoint) && !samePoint(wallPoint, endPoint))
      return crossesThroughWall || (!allowedStartContact && !allowedEndContact)
    })
  })
  if (traceCrossesWall) {
    roomDrawingError.value = 'A new wall cannot cross an existing wall.'
    return
  }

  const candidates = routes
    .map((route) => [...traceWithEnd, ...route.slice(1, -1)])
    .filter((points) => points.length >= 3 && roomAreaFor(points) >= 100 && isSimpleRoom(points))
    .filter((points) => {
      const onRoomBoundary = (point: Point, room: Point[]) => room.some((edgeStart, index) =>
        pointOnSegment(point, edgeStart, room[(index + 1) % room.length]!))
      const onCandidateBoundary = (point: Point) => points.some((edgeStart, index) =>
        pointOnSegment(point, edgeStart, points[(index + 1) % points.length]!))
      const newInteriorOverlaps = existingRooms.some((room) => {
        if (points.some((point) => isPointInsidePolygon(point, room) && !onRoomBoundary(point, room))) return true
        return points.some((edgeStart, index) => {
          const edgeEnd = points[(index + 1) % points.length]!
          const midpoint = { x: (edgeStart.x + edgeEnd.x) / 2, y: (edgeStart.y + edgeEnd.y) / 2 }
          return isPointInsidePolygon(midpoint, room) && !onRoomBoundary(midpoint, room)
        })
      })
      const existingInteriorOverlaps = existingRooms.some((room) =>
        room.some((point) => isPointInsidePolygon(point, points) && !onCandidateBoundary(point)))
      return !newInteriorOverlaps && !existingInteriorOverlaps
    })
  if (!candidates.length) {
    roomDrawingError.value = 'The new room would overlap an existing room or wall.'
    return
  }
  candidates.sort((first, second) => roomAreaFor(first) - roomAreaFor(second))
  additionalRoomPoints.value.push(candidates[0]!)
  roomNames.value.push(`Room ${allRooms.value.length}`)
  drawingRoomPoints.value = []
  drawingCursor.value = null
  drawingCursorClosesRoom.value = false
  drawingCursorSnapsToWall.value = false
  roomDrawingError.value = ''
}

function roomAreaFor(points: Point[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

function addCatalogItem(kind: FurnitureKind) {
  addItem(kind)
}

function removeSelected() {
  if (selectedId.value === null) return
  removeItem(selectedId.value)
}

function removeItem(id: number) {
  items.value = items.value.filter((item) => item.id !== id)
  selectedId.value = null
}

function removeMeasurement(id: number) {
  measurements.value = measurements.value.filter((measurement) => measurement.id !== id)
  if (hoveredMeasurementId.value === id) hoveredMeasurementId.value = null
}

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

function rotateSelected() {
  if (selectedItem.value) selectedItem.value.rotation = (selectedItem.value.rotation + 90) % 360
}

function changeZoom(amount: number, anchorPoint?: Point) {
  const nextZoom = Math.min(5, Math.max(0.5, Math.round((zoom.value + amount) * 10) / 10))
  if (nextZoom === zoom.value) return

  if (anchorPoint) {
    const [viewX, viewY, viewWidth, viewHeight] = planViewBox.value.split(' ').map(Number)
    const anchorXRatio = (anchorPoint.x - viewX!) / viewWidth!
    const anchorYRatio = (anchorPoint.y - viewY!) / viewHeight!
    const nextWidth = VIEW_WIDTH / nextZoom
    const nextHeight = VIEW_HEIGHT / nextZoom
    panOffset.value = {
      x: anchorPoint.x - anchorXRatio * nextWidth - (VIEW_WIDTH - nextWidth) / 2,
      y: anchorPoint.y - anchorYRatio * nextHeight - (VIEW_HEIGHT - nextHeight) / 2,
    }
  }
  zoom.value = nextZoom
}

function onCanvasWheel(event: WheelEvent) {
  if (view.value !== '2d') return
  event.preventDefault()
  const svg = canvasCard.value?.querySelector<SVGSVGElement>('svg.plan-svg')
  if (!svg) return
  changeZoom(event.deltaY > 0 ? -0.1 : 0.1, svgPoint(event, svg))
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
    rooms: allRooms.value,
    roomNames: roomNames.value,
    items: items.value,
    walls: wallSegments.value,
    measurements: measurements.value,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'floorwise-plan.json'
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

function roomDisplayName(name: string | undefined, index: number) {
  const defaultName = `Room ${index + 1}`
  const localizedDefault = `${t('Room (singular)')} ${index + 1}`
  return !name || name === defaultName || name === localizedDefault ? localizedDefault : name
}

function updateRoomName(index: number, event: Event) {
  if (event.target instanceof HTMLInputElement) roomNames.value[index] = event.target.value
}

function onLanguageChange(event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return
  const selectedLanguage = event.target.value
  if (selectedLanguage === 'en' || selectedLanguage === 'de') setLanguage(selectedLanguage)
}

function clearPlan() {
  if (!window.confirm(t('Start a new empty room plan? This will remove all placed items, walls, and measurements.'))) return
  items.value = []
  wallSegments.value = []
  measurements.value = []
  selectedId.value = null
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null)
}

function stopKeyboardMovement() {
  heldArrowKeys.clear()
  if (keyboardMoveFrame) window.cancelAnimationFrame(keyboardMoveFrame)
  keyboardMoveFrame = 0
  keyboardMoveStartedAt = 0
  keyboardMoveLastFrame = 0
}

function moveSelectedItemWithKeys(timestamp: number) {
  if (!heldArrowKeys.size || selectedId.value === null || (view.value !== '2d' && view.value !== '3d')) {
    stopKeyboardMovement()
    return
  }
  const item = items.value.find((entry) => entry.id === selectedId.value)
  if (!item) {
    stopKeyboardMovement()
    return
  }

  const elapsed = Math.min((timestamp - keyboardMoveLastFrame) / 1000, 0.05)
  const heldDuration = (timestamp - keyboardMoveStartedAt) / 1000
  const speed = Math.min(40 + heldDuration * 180, 500)
  let dx = Number(heldArrowKeys.has('ArrowRight')) - Number(heldArrowKeys.has('ArrowLeft'))
  let dy = Number(heldArrowKeys.has('ArrowDown')) - Number(heldArrowKeys.has('ArrowUp'))
  const length = Math.hypot(dx, dy)
  if (length) {
    dx = dx / length * speed * elapsed
    dy = dy / length * speed * elapsed
    const target = { x: item.x + dx, y: item.y + dy }
    if (item.kind === 'door' || item.kind === 'window') {
      const edge = nearestRoomEdge(target)
      const projected = projectOnEdge(target, edge, item.width / 2)
      item.x = projected.point.x
      item.y = projected.point.y
      item.rotation = Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) * 180 / Math.PI
    } else if (isFurniturePlacementValid(target, item)) {
      item.x = target.x
      item.y = target.y
    }
  }
  keyboardMoveLastFrame = timestamp
  keyboardMoveFrame = window.requestAnimationFrame(moveSelectedItemWithKeys)
}

function onKeyboardMoveKeyDown(event: KeyboardEvent) {
  if (!event.key.startsWith('Arrow') || isEditableKeyboardTarget(event.target) || selectedId.value === null) return
  if (view.value !== '2d' && view.value !== '3d') return
  event.preventDefault()
  heldArrowKeys.add(event.key)
  if (keyboardMoveFrame) return
  const now = performance.now()
  keyboardMoveStartedAt = now
  keyboardMoveLastFrame = now
  keyboardMoveFrame = window.requestAnimationFrame(moveSelectedItemWithKeys)
}

function onKeyboardMoveKeyUp(event: KeyboardEvent) {
  if (!heldArrowKeys.delete(event.key)) return
  if (!heldArrowKeys.size) stopKeyboardMovement()
}

function onWindowBlur() {
  stopKeyboardMovement()
}

onMounted(() => {
  canvasResizeObserver = new ResizeObserver(([entry]) => {
    canvasCardWidth.value = entry?.contentRect.width ?? 0
  })
  if (canvasCard.value) canvasResizeObserver.observe(canvasCard.value)
  window.addEventListener('pointerup', stopDragging)
  window.addEventListener('pointercancel', stopDragging)
  window.addEventListener('keydown', onKeyboardMoveKeyDown)
  window.addEventListener('keyup', onKeyboardMoveKeyUp)
  window.addEventListener('blur', onWindowBlur)
  const savedPlan = window.localStorage.getItem('floorwise-plan-v1') ?? window.localStorage.getItem('roomwise-plan-v1')
  if (savedPlan) {
    try {
      const plan = JSON.parse(savedPlan) as { items?: Array<PlanItem & { rearSide?: unknown }>; walls?: Wall[]; measurements?: Measurement[]; roomPoints?: Point[]; rooms?: Point[][]; roomNames?: string[] }
      if (Array.isArray(plan.items) && Array.isArray(plan.walls) && Array.isArray(plan.measurements)) {
        items.value = plan.items.map(({ rearSide: _rearSide, ...item }) => {
          item.floorOffset ??= item.kind === 'window' ? 100 : 0
          if (item.kind === 'shelf' && item.width === 42 && item.depth === 150 && item.height === 175) {
            return { ...item, width: 150, depth: 42 }
          }
          return item
        })
        wallSegments.value = plan.walls
        measurements.value = plan.measurements
        if (Array.isArray(plan.rooms) && plan.rooms.every((room) => Array.isArray(room) && room.length >= 3)) {
          roomPoints.value = plan.rooms[0] ?? []
          additionalRoomPoints.value = plan.rooms.slice(1)
        } else if (Array.isArray(plan.roomPoints)) {
          roomPoints.value = plan.roomPoints.length >= 3 ? plan.roomPoints : []
          additionalRoomPoints.value = []
        }
        roomNames.value = allRooms.value.map((_, index) =>
          typeof plan.roomNames?.[index] === 'string' && plan.roomNames[index]!.trim()
            ? plan.roomNames[index]!
            : `Room ${index + 1}`)
        nextId.value = Math.max(10, ...items.value.map((item) => item.id + 1), ...wallSegments.value.map((wall) => wall.id + 1), ...measurements.value.map((measurement) => measurement.id + 1))
      } else {
        console.warn(t('Saved room plan has an invalid structure and was not restored.'))
      }
    } catch (error) {
      console.error(t('Could not restore the saved room plan.'), error)
    }
  }
})
onBeforeUnmount(() => {
  canvasResizeObserver?.disconnect()
  canvasResizeObserver = undefined
  window.removeEventListener('pointerup', stopDragging)
  window.removeEventListener('pointercancel', stopDragging)
  window.removeEventListener('keydown', onKeyboardMoveKeyDown)
  window.removeEventListener('keyup', onKeyboardMoveKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  stopKeyboardMovement()
})
watch([items, wallSegments, measurements, roomPoints, additionalRoomPoints, roomNames], () => {
  if (import.meta.client) {
    window.localStorage.setItem('floorwise-plan-v1', JSON.stringify({
      items: items.value,
      walls: wallSegments.value,
      measurements: measurements.value,
      roomPoints: roomPoints.value,
      rooms: allRooms.value,
      roomNames: roomNames.value,
    }))
  }
}, { deep: true })
</script>

<template>
  <main class="app-shell">
    <aside v-if="sidebarOpen" class="sidebar">
      <a class="brand" href="#" :aria-label="`Floorwise ${t('home')}`">
        <span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 15.5 16 6l11 9.5v10H5v-10Z"/><path d="M12 25.5v-8h8v8"/></svg></span>
        <span>floorwise<span class="brand-period">.</span><small>{{ t('YOUR SPACE, REIMAGINED') }}</small></span>
      </a>
      <div class="sidebar-scroll">
        <div class="sidebar-section project-section">
          <div class="section-eyebrow">{{ t('YOUR PROJECT') }}</div>
          <button class="project-select" :aria-expanded="projectMenuOpen" aria-haspopup="menu" @click="projectMenuOpen = !projectMenuOpen"><span class="project-avatar">M</span><span class="project-copy"><strong>{{ t('My apartment') }}</strong><small>{{ t('Personal floorplan') }}</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
          <div v-if="projectMenuOpen" class="project-menu" role="menu">
            <button role="menuitem" @click="beginRoomDrawing">{{ t('Start a new floorplan') }}</button>
          </div>
        </div>

        <div class="sidebar-section room-section">
          <div class="section-heading"><span class="section-eyebrow">{{ t('FLOORPLAN') }}</span></div>
          <div v-for="(room, index) in allRooms" :key="`room-${index}`" class="room-entry">
            <div class="room-row active-room">
              <span class="room-dot"></span>
              <input :value="roomDisplayName(roomNames[index], index)" class="room-name-input" :aria-label="`${roomDisplayName(undefined, index)} ${t('name')}`" :placeholder="roomDisplayName(undefined, index)" @input="updateRoomName(index, $event)">
              <span class="room-item-count" :aria-label="`${roomItems[index]?.items.length || 0} ${t('furniture and objects')}`">{{ roomItems[index]?.items.length || 0 }}</span>
              <button
                class="room-expand-button"
                :aria-expanded="isRoomItemListExpanded(index)"
                :aria-label="`${t(isRoomItemListExpanded(index) ? 'Collapse' : 'Expand')} ${t('furniture and objects')} ${t('for')} ${roomDisplayName(roomNames[index], index)}`"
                :disabled="!roomItems[index]?.items.length"
                @click="toggleRoomItemList(index)"
              >
                <svg class="expand-chevron" :class="{ expanded: isRoomItemListExpanded(index) }" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
              </button>
              <span class="room-area">{{ (roomAreaFor(room) / SCALE ** 2).toFixed(1) }} m²</span>
            </div>
            <div v-if="isRoomItemListExpanded(index) && roomItems[index]?.items.length" class="room-item-list">
              <div v-for="item in roomItems[index]!.items" :key="item.id" class="placed-row" :class="{ 'placed-active': selectedId === item.id }">
                <button class="placed-select" :aria-label="`${t('Select')} ${item.name || t(itemLabel(item.kind))}`" @click="selectedId = item.id">
                  <span class="placed-dot" :style="{ background: item.color || itemColor(item.kind) }"></span>
                  <span class="placed-dim">{{ item.width }} × {{ item.depth }}</span>
                </button>
                <input
                  v-model="item.name"
                  class="placed-name-input"
                  :aria-label="`${t(itemLabel(item.kind))} ${t('name')}`"
                  :placeholder="t(itemLabel(item.kind))"
                  @click.stop
                  @focus="selectedId = item.id"
                >
              </div>
            </div>
          </div>
          <div v-if="!allRooms.length" class="room-row muted-room"><span class="room-dot empty-dot"></span><span>{{ t('No floorplan drawn') }}</span></div>
          <button class="room-row muted-room" @click="beginRoomAddition"><span class="room-dot empty-dot"></span><span>{{ t(allRooms.length ? '+ Add a room' : 'Draw your first room') }}</span></button>
        </div>

        <div class="sidebar-section furniture-section">
          <div class="section-heading"><span class="section-eyebrow">{{ t('FURNITURE & OBJECTS') }}</span><span class="count-pill">{{ categoryItems.length }}</span></div>
          <div class="category-switcher">
            <button v-for="category in ['All items', 'Furniture', 'Misc']" :key="category" :class="{ active: selectedCategory === category }" :aria-pressed="selectedCategory === category" @click="selectedCategory = category">{{ t(category) }}</button>
          </div>
          <div class="catalog-grid">
            <button v-for="entry in categoryItems" :key="entry.kind" class="catalog-card" :disabled="!roomPoints.length" @click="addCatalogItem(entry.kind)">
              <span class="catalog-icon" :class="`icon-${entry.icon}`">
                <svg v-if="entry.kind === 'chair'" viewBox="0 0 42 42"><path d="M13 11h16v13H13zM11 24h20v4H11zM14 28l-2 8m16-8 2 8M13 18H9v7m20-7h4v7"/></svg>
                <svg v-else-if="entry.kind === 'table'" viewBox="0 0 42 42"><path d="M8 15h26v4H8zm4 4v14m18-14v14M7 33h28"/></svg>
                <svg v-else-if="entry.kind === 'cupboard'" viewBox="0 0 42 42"><path d="M11 7h20v29H11zm10 0v29m-7-17h2m8 0h2M8 36h26"/></svg>
                <svg v-else-if="entry.kind === 'shelf'" viewBox="0 0 42 42"><path d="M11 7h20v29H11zm-3 9h26m-26 9h26m-26 9h26M14 11h3m8 0h3m-14 9h3m8 0h3m-14 9h3m8 0h3"/></svg>
                <svg v-else viewBox="0 0 42 42"><path d="m8 13 13-7 13 7v16l-13 7-13-7V13Zm0 0 13 7 13-7m-13 7v16m-6-26 13 7"/></svg>
              </span>
              <strong>{{ t(entry.label) }}</strong><small>{{ entry.detail }}</small>
              <span class="catalog-plus">+</span>
            </button>
          </div>
          <div class="section-heading structure-heading"><span class="section-eyebrow">{{ t('WALL DETAILS') }}</span><span class="count-pill">{{ wallDetailItems.length }}</span></div>
          <div class="category-switcher">
            <button v-for="category in wallDetailCategories" :key="category" :class="{ active: selectedWallCategory === category }" :aria-pressed="selectedWallCategory === category" @click="selectedWallCategory = category">{{ t(category) }}</button>
          </div>
          <div class="catalog-grid">
            <button v-for="kind in wallDetailItems" :key="kind" class="catalog-card" :disabled="!roomPoints.length" @click="addItem(kind)">
              <span class="catalog-icon" :class="`icon-${kind}`">
                <svg v-if="kind === 'window'" viewBox="0 0 42 42"><path d="M7 10h28v22H7zM7 16h28M21 10v22M11 13h6m8 0h6"/></svg>
                <svg v-else viewBox="0 0 42 42"><path d="M9 35V7h24v28M9 35h24M14 35V12h14v23m-5-12h1"/></svg>
              </span>
              <strong>{{ t(kind === 'window' ? 'Window' : 'Door') }}</strong>
              <small>{{ kind === 'window' ? '110 × 12 cm' : '90 × 15 cm' }}</small>
              <span class="catalog-plus">+</span>
            </button>
          </div>
          <div class="import-card import-planned" aria-disabled="true"><span class="import-icon">↥</span><span><strong>{{ t('Import 3D model') }}</strong><small>{{ t('Model import coming soon') }}</small></span></div>
        </div>

      </div>
      <div class="sidebar-bottom"><div class="avatar"></div><span><strong>{{ t('Your workspace') }}</strong><small>{{ t('Personal plan') }}</small></span><button class="icon-button more-button" :aria-label="t('More options')">···</button></div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="breadcrumbs"><button class="mobile-menu icon-button" :aria-label="t('Toggle sidebar')" @click="sidebarOpen = !sidebarOpen">☰</button><span>{{ t('My apartment') }}</span><span class="saved-state"><span></span> {{ t('All changes saved') }}</span></div>
        <div class="top-actions">
          <select class="language-switch" :value="language" :aria-label="t('Change language')" :title="t('Change language')" @change="onLanguageChange">
            <option value="en">{{ t('English') }}</option>
            <option value="de">{{ t('German') }}</option>
          </select>
          <button class="top-icon disabled-icon" :title="t('Undo is not available yet')" :aria-label="t('Undo')" disabled>↶</button><button class="top-icon disabled-icon" :title="t('Redo is not available yet')" :aria-label="t('Redo')" disabled>↷</button>
          <span class="action-divider"></span><button class="export-button" @click="exportPlan">{{ t('Export JSON') }} <span>↗</span></button>
        </div>
      </header>
      <div class="toolbar-row">
        <div class="view-switch"><button :class="{ selected: view === '2d' }" @click="view = '2d'"><span class="view-2d-icon">▦</span>{{ t('2D plan') }}</button><button :class="{ selected: view === '3d' }" @click="view = '3d'"><span class="view-3d-icon">◇</span>{{ t('3D view') }}</button></div>
        <div v-if="view === '2d'" class="tool-actions">
          <span class="tool-hint" v-if="activeTool === 'room'">{{ t('10° angle snap · Shift for free angle · Click near start to close') }}</span>
          <span class="tool-hint" v-else-if="activeTool === 'addRoom'">{{ t('Attach to existing walls · Shift for free angles') }}</span>
          <span class="tool-hint" v-else-if="activeTool === 'measure'">{{ t('Click two points to measure') }}</span>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'select' }" :title="t('Select and move')" @click="selectTool('select')"><svg viewBox="0 0 20 20"><path d="m5 3 10 8-5 .7-2.5 5L5 3Z"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'addRoom' || activeTool === 'room' }" :title="t(allRooms.length ? 'Add room' : 'Draw room')" :aria-label="t(allRooms.length ? 'Add room' : 'Draw room')" @click="beginRoomAddition"><svg viewBox="0 0 20 20"><path d="M3 4h8v8H3zM11 8h6v8h-6zM6 7h2m6 5h2"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': activeTool === 'measure' }" :title="t('Measure length')" @click="selectTool('measure')"><svg viewBox="0 0 20 20"><path d="M4 14 14 4l3 3L7 17l-3-3Zm3-1 2 2m1-5 2 2m1-5 2 2"/></svg></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button" :class="{ 'tool-active': showGrid }" :title="t('Toggle grid')" @click="showGrid = !showGrid"><svg viewBox="0 0 20 20"><path d="M4 4h12v12H4zM4 10h12M10 4v12"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': showDimensions }" :title="t('Toggle room dimensions and names')" :aria-label="t('Toggle room dimensions and names')" @click="showDimensions = !showDimensions"><svg viewBox="0 0 20 20"><path d="M4 10h12m-3-3 3 3-3 3M7 7l-3 3 3 3"/></svg></button>
          <button class="tool-button" :class="{ 'tool-active': showCustomMeasurements }" :title="t('Toggle custom measurements')" :aria-label="t('Toggle custom measurements')" @click="showCustomMeasurements = !showCustomMeasurements"><svg viewBox="0 0 20 20"><path d="M3 15 15 3l2 2L5 17H3v-2Zm3-1 2 2m2-6 2 2m2-6 2 2"/></svg></button>
          <span class="toolbar-divider"></span><button class="zoom-button" :aria-label="t('Zoom out')" @click="changeZoom(-0.1)">−</button><span class="zoom-level">{{ Math.round(zoom * 100) }}%</span><button class="zoom-button" :aria-label="t('Zoom in')" @click="changeZoom(0.1)">+</button>
        </div>
      </div>
      <div class="canvas-area">
        <div class="canvas-label"><span class="canvas-status"></span> {{ t(view === '2d' ? 'FLOOR PLAN' : 'INTERACTIVE 3D') }} <span class="label-divider">·</span> {{ view === '2d' ? (allRooms.length > 1 ? `${allRooms.length} ${t('ROOMS')}` : roomDisplayName(roomNames[0], 0).toUpperCase()) : t('DRAG TO ORBIT') }}</div>
        <div ref="canvasCard" class="canvas-card" :class="{ 'immersive-card': view === '3d' }" @wheel="onCanvasWheel">
          <svg v-if="view === '2d'" class="plan-svg" :class="{ 'is-panning': isPanning }" :viewBox="planViewBox" @click="onCanvasClick" @pointerdown="onCanvasPointerDown" @pointermove="onCanvasPointerMove" @pointerup="stopDragging" @pointercancel="stopDragging" @lostpointercapture="stopDragging" @contextmenu="onCanvasContextMenu">
            <defs>
              <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e9e7e1" stroke-width="0.8"/></pattern>
              <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#443a2e" flood-opacity=".09"/></filter>
            </defs>
            <rect width="960" height="680" fill="#f7f6f2"/>
            <rect v-if="showGrid" width="960" height="680" fill="url(#grid)"/>
            <polygon v-for="(room, index) in allRooms" :key="`room-floor-${index}`" :points="room.map((point) => `${point.x},${point.y}`).join(' ')" fill="#f5eee4" stroke="#c6b9a8" stroke-width="1.5"/>
            <line v-for="edge in roomEdges" :key="`room-edge-${edge.id}`" :x1="edge.start.x" :y1="edge.start.y" :x2="edge.end.x" :y2="edge.end.y" stroke="#45443f" stroke-width="10" stroke-linecap="square"/>
            <g v-if="showDimensions">
              <g class="room-dimensions room-edge-dimensions">
                <text v-for="dimension in roomDimensionLabels" :key="`room-dimension-${dimension.id}`" :x="dimension.label.x" :y="dimension.label.y" text-anchor="middle" :transform="fixedSizeLabelTransform(dimension.label, dimension.labelAngle)">{{ dimension.text }}</text>
              </g>
              <g v-for="(labelPoint, index) in roomLabelPoints" :key="`room-name-${index}`" :transform="fixedSizeGroupTransform(labelPoint)" class="room-plan-label">
                <text text-anchor="middle" class="room-name-label">{{ roomDisplayName(roomNames[index], index) }}</text>
                <text y="15" text-anchor="middle" class="room-area-label">{{ (roomAreaFor(allRooms[index]!) / SCALE ** 2).toFixed(1) }} m²</text>
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
                @click.stop.prevent="removeMeasurement(measurement.id)"
                @keydown.enter.stop.prevent="removeMeasurement(measurement.id)"
                @keydown.space.stop.prevent="removeMeasurement(measurement.id)"
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
              <g v-else-if="item.kind === 'cupboard'">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" rx="5" :fill="item.color || '#99a08e'" stroke="#777c6c" stroke-width="1.5"/>
                <line y1="-10" y2="10" stroke="#e0e0d4" stroke-width="2"/>
                <circle cx="4" cy="0" r="1.5" fill="#777c6c"/>
              </g>
              <g v-else-if="item.kind === 'shelf'">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" rx="3" fill="#f5f0e7" fill-opacity=".72" stroke="#8d7964" stroke-width="1.5"/>
                <g stroke="#a88c72" stroke-width="2">
                  <line :x1="-item.width / 2 + 4" :y1="-item.depth / 4" :x2="item.width / 2 - 4" :y2="-item.depth / 4"/>
                  <line :x1="-item.width / 2 + 4" :y1="item.depth / 4" :x2="item.width / 2 - 4" :y2="item.depth / 4"/>
                </g>
                <g fill="#8d7964">
                  <circle :cx="-item.width / 2 + 3" :cy="-item.depth / 2 + 3" r="2"/>
                  <circle :cx="item.width / 2 - 3" :cy="-item.depth / 2 + 3" r="2"/>
                  <circle :cx="-item.width / 2 + 3" :cy="item.depth / 2 - 3" r="2"/>
                  <circle :cx="item.width / 2 - 3" :cy="item.depth / 2 - 3" r="2"/>
                </g>
              </g>
              <g v-else-if="item.kind === 'window'"><rect :x="-item.width / 2" y="-6" :width="item.width" height="12" rx="2" fill="#77b9c1" stroke="#3f8e98" stroke-width="2"/><path :d="`M${-item.width / 2 + 4} 0h${item.width - 8}`" stroke="#e9fbfb" stroke-width="2"/></g>
              <g v-else-if="item.kind === 'door'"><rect :x="-item.width / 2" y="-7" :width="item.width" height="14" rx="2" fill="#c98d65" stroke="#986746" stroke-width="1.5"/><circle :cx="item.width / 2 - 10" cy="0" r="2" fill="#f3dfbb"/></g>
              <g v-else filter="url(#soft-shadow)">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" rx="7" :fill="item.color || '#94a9b8'" stroke="#6c8494" stroke-width="2"/>
                <path :d="`M${-item.width / 2 + 8} ${-item.depth / 2 + 8}h${item.width - 16}v${item.depth - 16}h${-item.width + 16}z`" fill="none" stroke="#d7e1e7"/>
              </g>
              <rect v-if="selectedId === item.id" :x="-item.width / 2 - 6" :y="-item.depth / 2 - 6" :width="item.width + 12" :height="item.depth + 12" rx="12" fill="none" stroke="#668774" stroke-width="2" stroke-dasharray="4 3"/>
              <g
                v-if="selectedId === item.id && item.kind !== 'door' && item.kind !== 'window'"
                class="rotation-handle"
                :transform="`translate(${item.width / 2 + 14} ${-item.depth / 2 - 14}) rotate(${-item.rotation})`"
                @pointerdown="rotationHandlePointerDown($event, item)"
                @click.stop
              >
                <title>{{ t('Drag to rotate · 10° steps · hold Shift for 1° steps') }}</title>
                <circle r="11" fill="#fff" stroke="#668774" stroke-width="1.5"/>
                <path d="M-4.7-4.7a6.7 6.7 0 1 1-1.8 6.9M-6.2-6.4v3.8h3.8" fill="none" stroke="#668774" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </g>
              <title>{{ item.name || t(itemLabel(item.kind)) }} · {{ item.width }} × {{ item.depth }} cm</title>
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

          <ClientOnly v-else>
            <RoomScene3D
              :items="items"
              :walls="wallSegments"
              :rooms="allRooms"
              :room-width="roomBounds.width"
              :room-depth="roomBounds.height"
              :room-x="roomBounds.x"
              :room-y="roomBounds.y"
              :selected-id="selectedId"
              @select="selectedId = $event"
            />
          </ClientOnly>
          <div v-if="activeTool === 'room' || activeTool === 'addRoom'" class="room-draw-banner">
            <div><strong>{{ t(activeTool === 'addRoom' ? 'Add a room' : 'Draw your first room or draw the outline of your flat') }}</strong><span>{{ t(activeTool === 'addRoom' ? 'Start and finish on existing walls. The old boundary between them becomes a shared wall.' : 'Click each corner around the floorplan. Add at least 3 corners.') }}</span><small v-if="roomDrawingError">{{ t(roomDrawingError) }}</small></div>
            <span class="corner-count">{{ drawingRoomPoints.length }} {{ t('corners') }}</span>
            <button class="room-cancel-button" @click="cancelActiveCanvasAction">{{ t('Cancel') }}</button>
            <button v-if="activeTool === 'room'" class="room-finish-button" :disabled="drawingRoomPoints.length < 3" @click="finishRoomDrawing">{{ t('Finish room') }}</button>
          </div>
          <template v-if="view === '2d'">
            <div class="canvas-compass"><span>N</span><svg viewBox="0 0 20 28"><path d="M10 2 16 25 10 20 4 25 10 2Z" fill="#628c75"/></svg></div>
            <div class="canvas-scale"><span class="scale-line" :style="{ width: `${scaleBar.width}px` }"></span><span>{{ scaleBar.label }}</span></div>
          </template>
        </div>
        <div class="canvas-footer"><span v-if="view === '2d'">{{ t('Right-drag to pan · scroll to zoom · arrow keys to move selected object') }}</span><span v-else>{{ t('Drag to orbit · right-drag to pan · scroll to zoom · arrow keys to move selected object') }}</span><span class="footer-separator">·</span><span>{{ placedCount }} {{ t('objects') }}</span><span class="footer-separator">·</span><span>{{ totalArea }} m² {{ t('floor area') }}</span><span class="footer-spacer"></span><button @click="clearPlan">{{ t('Reset plan') }}</button></div>
      </div>
      <aside v-if="selectedItem" class="inspector">
        <div class="inspector-heading"><div><span class="section-eyebrow">{{ t('SELECTED OBJECT') }}</span><input v-model="selectedItem.name" class="inspector-title-input" :aria-label="`${t('Name for')} ${t(itemLabel(selectedItem.kind))}`" :placeholder="t(itemLabel(selectedItem.kind))"></div><button class="icon-button" :aria-label="t('Close inspector')" @click="selectedId = null">×</button></div>
        <div class="property-row"><label class="property-label">{{ t('Width') }} <span>cm</span><input v-model.number="selectedItem.width" type="number" min="1"></label><label class="property-label">{{ t('Depth') }} <span>cm</span><input v-model.number="selectedItem.depth" type="number" min="1"></label></div>
        <div class="property-row"><label class="property-label">{{ t('Height') }} <span>cm</span><input v-model.number="selectedItem.height" type="number" min="1"></label><label class="property-label">{{ t('Rotation') }} <span>°</span><input :value="selectedItem.rotation" type="number" readonly></label></div>
        <label class="property-label">{{ t('Distance from floor') }} <span>cm</span><input v-model.number="selectedItem.floorOffset" type="number" min="0" step="1"></label>
        <button class="rotate-button" @click="rotateSelected">↻ <span>{{ t('Rotate 90°') }}</span></button>
        <button class="delete-button" @click="removeSelected">{{ t('Remove object') }}</button>
      </aside>
      <div v-if="activeTool === 'cube' && view === '2d'" class="placement-tip">{{ t('Click anywhere in the room to place your cube') }} <button @click="selectTool('select')">{{ t('Cancel') }}</button></div>
    </section>
    <div v-if="showNewFloorplanConfirmation" class="confirmation-backdrop" @click.self="cancelNewFloorplan">
      <section class="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="new-floorplan-title" aria-describedby="new-floorplan-description">
        <span class="section-eyebrow">{{ t('NEW FLOORPLAN') }}</span>
        <h2 id="new-floorplan-title">{{ t('Start a new floorplan?') }}</h2>
        <p id="new-floorplan-description">{{ t('Your current floorplan, including its room outline, furniture, walls, and measurements, will be cleared.') }}</p>
        <div class="confirmation-actions">
          <button class="confirmation-cancel" @click="cancelNewFloorplan">{{ t('Cancel') }}</button>
          <button class="confirmation-accept" @click="confirmNewFloorplan">{{ t('Clear floorplan') }}</button>
        </div>
      </section>
    </div>
  </main>
</template>
