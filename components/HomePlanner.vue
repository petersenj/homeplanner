<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import HomePlannerImportExport from '~/components/HomePlannerImportExport.vue'
import { catalogItemsByKind, getCatalogItem } from '~/catalog'
import type { CatalogItem, FurnitureSide } from '~/catalog/types'
import type { CameraSnapshot, DragMeasurement, EgoCamera, Measurement, Point, RoomEdge } from '~/types/planner'
import type { ImportedPlan } from '~/utils/planFile'
import { defaultEgoCamera } from '~/utils/egoCameraPlan'

const RoomScene3D = defineAsyncComponent(() => import('~/components/RoomScene3D.vue'))
const PlanScene2D = defineAsyncComponent(() => import('~/components/PlanScene2D.vue'))
const { language, setLanguage, t } = useAppLanguage()
const planName = ref('My apartment')

type DragAxis = 'x' | 'y'
type WallMountedAnchor = {
  itemId: number
  start: Point
  end: Point
  parameter: number
  normalOffset: number
  rotationOffset: number
}
type CornerMove = { from: Point; to: Point }
type WallMountedAnchorUpdate = { itemId: number; point: Point; rotation: number }
type RoomCornerDrag = { corner: Point; pointerStart: Point; rooms: Point[][]; anchors: WallMountedAnchor[]; lockedAxis: DragAxis | null }
type RoomWallDrag = { wall: RoomEdge; pointerStart: Point; rooms: Point[][]; anchors: WallMountedAnchor[]; lockedAxis: DragAxis | null }
type FurnitureKind = string
type PlanItem = CatalogItem

const SCALE = 100
const VIEW_WIDTH = 1980
const VIEW_HEIGHT = 1280
const GRID_SIZE = 50
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
const cameraSnapshot = ref<CameraSnapshot | null>(null)
const egoCamera = ref<EgoCamera>(defaultEgoCamera([defaultRoomPoints]))
const isEgoCameraSelected = ref(false)
const activeTool = ref<'select' | 'room' | 'addRoom' | 'measure' | 'window' | 'door' | 'cube' | 'furniture'>('select')
const selectedId = ref<number | null>(null)
const selectedWallId = ref<string | null>(null)
const pendingPoint = ref<Point | null>(null)
const measurementCursor = ref<Point | null>(null)
const roomPoints = ref<Point[]>(defaultRoomPoints.map((point) => ({ ...point })))
const additionalRoomPoints = ref<Point[][]>([])
const roomNames = ref<string[]>(['Room 1'])
const drawingRoomPoints = ref<Point[]>([])
const drawingCursor = ref<Point | null>(null)
const drawingCursorClosesRoom = ref(false)
const drawingCursorSnapsToWall = ref(false)
const roomDrawingError = ref('')
const canvasActionError = ref('')
const roomCornerDrag = ref<RoomCornerDrag | null>(null)
const roomWallDrag = ref<RoomWallDrag | null>(null)
const activeConfirmation = ref<'reset-plan' | null>(null)
const newFloorplanConfirmationOpen = ref(false)
const planLibraryActions = ref<{
  markCurrentPlanUnsaved: () => boolean
  saveBeforeNewFloorplan: () => void
} | null>(null)
const projectMenuOpen = ref(false)
const moreMenuOpen = ref(false)
const changelogOpen = ref(false)
const appTutorial = ref<{ restart: () => void } | null>(null)
const zoom = ref(1)
const panOffset = ref<Point>({ x: 0, y: 0 })
const roomWallDimensions = ref<Record<string, { depth: number; height: number }>>({})
const measurements = ref<Measurement[]>([])
const nextId = ref(10)
const showGrid = ref(true)
const showDimensions = ref(true)
const showCustomMeasurements = ref(true)
const expandedRoomItems = ref<Record<number, boolean>>({})
const sidebarOpen = ref(true)
const canvasCard = ref<HTMLDivElement | null>(null)
const canvasCardWidth = ref(0)
let canvasResizeObserver: ResizeObserver | undefined
let isMobileViewport = false
const isDragging = ref(false)
const isDraggingEgoCamera = ref(false)
const isRotating = ref(false)
const isKeyboardMoving = ref(false)
const activePointerId = ref<number | null>(null)
const dragOffset = ref<Point>({ x: 0, y: 0 })
const rotationStartPointerAngle = ref(0)
const rotationStartItemAngle = ref(0)
const ignoreNextCanvasClick = ref(false)
const heldArrowKeys = new Set<string>()
let keyboardMoveFrame = 0
let keyboardMoveStartedAt = 0
let keyboardMoveLastFrame = 0
const items = ref<PlanItem[]>([
  { id: 1, kind: 'table', section: 'catalog', x: 395, y: 305, width: 120, depth: 60, height: 75, rotation: 0 },
  { id: 2, kind: 'chair', section: 'catalog', x: 345, y: 280, width: 48, depth: 48, height: 88, rotation: 0 },
  { id: 3, kind: 'chair', section: 'catalog', x: 545, y: 280, width: 48, depth: 48, height: 88, rotation: 0 },
  { id: 4, kind: 'chair', section: 'catalog', x: 345, y: 385, width: 48, depth: 48, height: 88, rotation: 180 },
  { id: 5, kind: 'chair', section: 'catalog', x: 545, y: 385, width: 48, depth: 48, height: 88, rotation: 180 },
  { id: 6, kind: 'cupboard', section: 'catalog', x: 220, y: 140, width: 100, depth: 60, height: 190, rotation: 0 },
  { id: 7, kind: 'shelf', section: 'catalog', x: 700, y: 240, width: 100, depth: 40, height: 175, rotation: 0 },
])

const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
const selectedSurfaceColors = computed(() => selectedItem.value ? getCatalogItem(selectedItem.value.kind).surfaceColors ?? [] : [])
const selectedItemOpenable = computed(() => selectedItem.value ? getCatalogItem(selectedItem.value.kind).openable ?? false : false)
const selectedSurfaceColor = computed(() => selectedItem.value
  ? selectedItem.value.color ?? itemColor(selectedItem.value.kind)
  : '')
const selectedRoomWall = computed(() => {
  const edge = roomEdges.value.find((roomEdge) => roomEdge.id === selectedWallId.value)
  if (!edge) return null
  const dimensions = roomWallDimensions.value[edge.id]
  const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y)
  const minimumLength = items.value.reduce((minimum, item) => {
    if (!isWallOpening(item)) return minimum
    const projected = projectPointToSegment({ x: item.x, y: item.y }, edge.start, edge.end)
    if (Math.hypot(projected.x - item.x, projected.y - item.y) > 10) return minimum
    const rotation = item.rotation * Math.PI / 180
    const tangent = { x: (edge.end.x - edge.start.x) / edgeLength, y: (edge.end.y - edge.start.y) / edgeLength }
    if (Math.abs(Math.cos(rotation) * tangent.x + Math.sin(rotation) * tangent.y) < 0.999) return minimum
    return Math.max(minimum, item.width)
  }, 1)
  return {
    edge,
    length: edge.length * SCALE,
    minimumLength,
    depth: dimensions?.depth ?? WALL_THICKNESS,
    height: dimensions?.height ?? 265,
  }
})
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
const roomCorners = computed(() => {
  const corners: Point[] = []
  for (const room of allRooms.value) {
    for (const point of room) {
      if (!corners.some((corner) => samePoint(corner, point))) corners.push(point)
    }
  }
  return corners
})
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
    .filter((item) => getCatalogItem(item.kind).wallMounted)
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
  if ((!isDragging.value && !isKeyboardMoving.value) || isRotating.value || !selectedItem.value || !showDimensions.value) return []
  const item = selectedItem.value
  if (getCatalogItem(item.kind).wallMounted) {
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
  return `translate(${point.x} ${point.y}) scale(${1 / Math.min(zoom.value, 1.5)}) rotate(${rotation}) translate(${-point.x} ${-point.y})`
}
function fixedSizeGroupTransform(point: Point) {
  return `translate(${point.x} ${point.y}) scale(${1 / Math.min(zoom.value, 1.5)})`
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

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360
}

function isWallOpening(item: PlanItem) {
  return item.section === 'wall-details'
}

function wallMountedRotationOffset(rotation: number, edge: Pick<RoomEdge, 'start' | 'end'>) {
  const edgeRotation = Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) * 180 / Math.PI
  const difference = normalizeRotation(rotation - edgeRotation)
  return difference >= 90 && difference < 270 ? 180 : 0
}

function wallMountedRotation(edge: Pick<RoomEdge, 'start' | 'end'>, offset: number) {
  return normalizeRotation(Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) * 180 / Math.PI + offset)
}

function wallMountedOpeningLayoutIsValid(
  rooms: Point[][],
  positionUpdates: WallMountedAnchorUpdate[] = [],
  candidateItems: PlanItem[] = items.value,
) {
  const wallEdges = rooms.flatMap((room) => room.map((start, index) => ({
    start,
    end: room[(index + 1) % room.length]!,
  })))
  const updatedPositions = new Map(positionUpdates.map((update) => [update.itemId, update.point]))
  type PlacedOpening = { item: PlanItem; point: Point; tangent: Point }
  const openings: Array<PlacedOpening | false | null> = candidateItems
    .filter(isWallOpening)
    .map((item) => {
      const point = updatedPositions.get(item.id) ?? { x: item.x, y: item.y }
      let nearest: { start: Point; end: Point; projected: Point; distance: number } | null = null
      for (const edge of wallEdges) {
        const projected = projectPointToSegment(point, edge.start, edge.end)
        const distance = Math.hypot(projected.x - point.x, projected.y - point.y)
        if (!nearest || distance < nearest.distance) nearest = { ...edge, projected, distance }
      }
      if (!nearest || nearest.distance > 20) return null
      const dx = nearest.end.x - nearest.start.x
      const dy = nearest.end.y - nearest.start.y
      const length = Math.hypot(dx, dy)
      const along = ((nearest.projected.x - nearest.start.x) * dx + (nearest.projected.y - nearest.start.y) * dy) / (length || 1)
      if (along < item.width / 2 - 0.1 || length - along < item.width / 2 - 0.1) return false
      return {
        item,
        point,
        tangent: { x: dx / (length || 1), y: dy / (length || 1) },
      }
    })

  if (openings.some((opening) => opening === false)) return false
  const placedOpenings = openings.filter((opening): opening is PlacedOpening => opening !== null && opening !== false)
  for (let firstIndex = 0; firstIndex < placedOpenings.length; firstIndex++) {
    const first = placedOpenings[firstIndex]!
    for (const second of placedOpenings.slice(firstIndex + 1)) {
      const parallel = Math.abs(first.tangent.x * second.tangent.x + first.tangent.y * second.tangent.y)
      if (parallel < 0.999) continue
      const lateralDistance = Math.abs(
        (second.point.x - first.point.x) * -first.tangent.y
        + (second.point.y - first.point.y) * first.tangent.x,
      )
      if (lateralDistance > 10) continue
      const alongDistance = Math.abs(
        (second.point.x - first.point.x) * first.tangent.x
        + (second.point.y - first.point.y) * first.tangent.y,
      )
      if (alongDistance < (first.item.width + second.item.width) / 2 - 0.1) return false
    }
  }
  return true
}

function defaultRearSide(kind: FurnitureKind, width: number, depth: number): FurnitureSide {
  return getCatalogItem(kind).rearSide?.(width, depth) ?? 'top'
}

function snapFurnitureToWall(point: Point, item: PlanItem) {
  const candidates = roomEdges.value.flatMap((edge) => edge.orientations.map((orientation) => ({
    start: edge.start,
    end: edge.end,
    orientation,
  })))
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
    const inward = edge.orientation > 0 ? normal : { x: -normal.x, y: -normal.y }
    const insideDistance = (point.x - projected.x) * inward.x + (point.y - projected.y) * inward.y
    if (insideDistance < -0.001) continue
    if (distance < 0.001) {
      towardWall = { x: -inward.x, y: -inward.y }
      distance = 0
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

function roomInteriorsOverlap(first: Point[], second: Point[]) {
  const onBoundary = (point: Point, room: Point[]) => room.some((start, index) =>
    pointOnSegment(point, start, room[(index + 1) % room.length]!))
  if (first.some((point) => isPointInsidePolygon(point, second) && !onBoundary(point, second))) return true
  if (second.some((point) => isPointInsidePolygon(point, first) && !onBoundary(point, first))) return true
  for (let firstIndex = 0; firstIndex < first.length; firstIndex++) {
    const firstStart = first[firstIndex]!
    const firstEnd = first[(firstIndex + 1) % first.length]!
    const firstMidpoint = { x: (firstStart.x + firstEnd.x) / 2, y: (firstStart.y + firstEnd.y) / 2 }
    if (isPointInsidePolygon(firstMidpoint, second) && !onBoundary(firstMidpoint, second)) return true
    for (let secondIndex = 0; secondIndex < second.length; secondIndex++) {
      if (segmentsProperlyIntersect(
        firstStart,
        firstEnd,
        second[secondIndex]!,
        second[(secondIndex + 1) % second.length]!,
      )) return true
    }
  }
  for (let index = 0; index < second.length; index++) {
    const start = second[index]!
    const end = second[(index + 1) % second.length]!
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    if (isPointInsidePolygon(midpoint, first) && !onBoundary(midpoint, first)) return true
  }
  return false
}

function isValidRoomLayout(rooms: Point[][]) {
  if (rooms.some((room) => room.length < 3 || roomAreaFor(room) < 100 || !isSimpleRoom(room))) return false
  for (let first = 0; first < rooms.length; first++) {
    for (let second = first + 1; second < rooms.length; second++) {
      if (roomInteriorsOverlap(rooms[first]!, rooms[second]!)) return false
    }
  }
  return true
}

function removeRoomCorner(corner: Point) {
  if (activeTool.value !== 'select') return
  const currentRooms = roomPolygonsWithSharedVertices(allRooms.value)
  const connectedSegments = [
    ...currentRooms.flatMap((room) => room.map((start, index) => ({
      start,
      end: room[(index + 1) % room.length]!,
    }))),
  ].flatMap(({ start, end }) => {
    if (samePoint(start, corner)) return [{ start: corner, end }]
    if (samePoint(end, corner)) return [{ start: corner, end: start }]
    return []
  })
  const uniqueConnectedSegments = connectedSegments.filter((segment, index) =>
    !connectedSegments.slice(0, index).some((other) =>
      (samePoint(segment.start, other.start) && samePoint(segment.end, other.end))
      || (samePoint(segment.start, other.end) && samePoint(segment.end, other.start))))
  if (uniqueConnectedSegments.length >= 3) {
    canvasActionError.value = 'Corners where three or more wall segments meet cannot be removed.'
    return
  }
  const rooms = currentRooms
    .map((room) => room.filter((point) => !samePoint(point, corner)))
  if (rooms.some((room) => room.length < 3)) {
    canvasActionError.value = 'A room must have at least three corners.'
    return
  }
  if (!isValidRoomLayout(rooms)) {
    canvasActionError.value = 'This corner cannot be removed because it would make the room layout invalid.'
    return
  }
  canvasActionError.value = ''
  roomPoints.value = rooms[0]!
  additionalRoomPoints.value = rooms.slice(1)
}

function roomPolygonsWithSharedVertices(rooms: Point[][]) {
  const vertices: Point[] = []
  for (const point of rooms.flat()) {
    if (!vertices.some((vertex) => samePoint(vertex, point))) vertices.push(point)
  }
  return rooms.map((room) => {
    const updated: Point[] = []
    for (let index = 0; index < room.length; index++) {
      const start = room[index]!
      const end = room[(index + 1) % room.length]!
      const cuts = vertices
        .filter((point) => !samePoint(point, start) && !samePoint(point, end) && pointOnSegment(point, start, end))
        .sort((first, second) => edgeParameter(first, start, end) - edgeParameter(second, start, end))
      updated.push({ ...start }, ...cuts.map((point) => ({ ...point })))
    }
    return updated
  })
}

function dimensions(kind: FurnitureKind) {
  return getCatalogItem(kind).dimensions
}

function addItem(kind: FurnitureKind, at?: Point, validateFloorPlacement = false) {
  if (!roomPoints.value.length) {
    roomDrawingError.value = 'Finish drawing the floorplan before adding items.'
    activeTool.value = 'room'
    view.value = '2d'
    return
  }
  const [width, depth, height] = dimensions(kind)
  const longestEdge = roomEdges.value.reduce((longest, edge) => edge.length > longest.length ? edge : longest, roomEdges.value[0]!)
  const definition = getCatalogItem(kind)
  const mountingEdge = definition.mountingEdge === 'second' ? roomEdges.value[1] ?? longestEdge : longestEdge
  const targetEdge = definition.wallMounted && at ? nearestRoomEdge(at) : mountingEdge
  const wallPosition = definition.wallMounted
    ? projectOnEdge(at ?? {
        x: (targetEdge.start.x + targetEdge.end.x) / 2,
        y: (targetEdge.start.y + targetEdge.end.y) / 2,
      }, targetEdge, width / 2).point
    : null
  const defaultPoint = definition.wallMounted
    ? wallPosition!
    : roomCenter.value
  const item: PlanItem = {
    id: nextId.value,
    kind,
    section: definition.section,
    wallDetailCategory: definition.wallDetailCategory,
    x: at?.x ?? defaultPoint.x,
    y: at?.y ?? defaultPoint.y,
    width,
    depth,
    height,
    floorOffset: definition.defaultFloorOffset ?? 0,
    rotation: definition.wallMounted ? wallMountedRotation(targetEdge, 0) : 0,
    ...(definition.surfaceColors ? { color: definition.color } : {}),
  }
  if (validateFloorPlacement && !definition.wallMounted && !isFurniturePlacementValid({ x: item.x, y: item.y }, item)) {
    canvasActionError.value = 'This item cannot be placed here.'
    return
  }
  if (definition.wallMounted && !wallMountedOpeningLayoutIsValid(allRooms.value, [], [...items.value, item])) {
    canvasActionError.value = 'This opening cannot fit on a wall without overlapping another opening.'
    return
  }
  nextId.value++
  items.value.push(item)
  canvasActionError.value = ''
  selectedWallId.value = null
  isEgoCameraSelected.value = false
  selectedId.value = item.id
  activeTool.value = 'select'
  pendingPoint.value = null
}

function selectTool(tool: typeof activeTool.value) {
  clearCanvasDraft()
  activeTool.value = tool
  selectedId.value = null
  selectedWallId.value = null
  isEgoCameraSelected.value = false
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
  selectedWallId.value = null
  isEgoCameraSelected.value = false
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
  if (activeTool.value === 'select') {
    selectedWallId.value = null
    isEgoCameraSelected.value = false
  }
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
      insertRoomCornerPreservingWallDimensions(boundary.point)
      drawingRoomPoints.value.push(boundary.point)
      drawingCursor.value = boundary.point
      drawingCursorSnapsToWall.value = true
      roomDrawingError.value = ''
      return
    }
    const point = getRoomDrawingPoint(rawPoint, event.shiftKey)
    if (activeTool.value === 'addRoom' && drawingCursorClosesRoom.value) {
      insertRoomCornerPreservingWallDimensions(point)
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

function insertRoomCorner(point: Point) {
  let inserted = false
  const rooms = allRooms.value.map((room) => {
    const updated: Point[] = []
    for (let index = 0; index < room.length; index++) {
      const start = room[index]!
      const end = room[(index + 1) % room.length]!
      updated.push(start)
      if (Math.hypot(point.x - start.x, point.y - start.y) <= 1
        || Math.hypot(point.x - end.x, point.y - end.y) <= 1
        || !pointOnSegment(point, start, end)) continue
      updated.push({ ...point })
      inserted = true
    }
    return updated
  })
  if (!inserted) return false
  roomPoints.value = rooms[0]!
  additionalRoomPoints.value = rooms.slice(1)
  return true
}

function insertRoomCornerPreservingWallDimensions(point: Point) {
  const previousEdges = roomEdges.value.map((edge) => ({
    start: { ...edge.start },
    end: { ...edge.end },
    dimensions: roomWallDimensions.value[edge.id],
  }))
  if (!insertRoomCorner(point)) return false

  const dimensionsById: Record<string, { depth: number; height: number }> = {}
  for (const previous of previousEdges) {
    if (!previous.dimensions) continue
    for (const edge of roomEdges.value) {
      if (pointOnSegment(edge.start, previous.start, previous.end)
        && pointOnSegment(edge.end, previous.start, previous.end)) {
        dimensionsById[edge.id] = previous.dimensions
      }
    }
  }
  roomWallDimensions.value = dimensionsById
  return true
}

function constrainDragDelta(
  drag: { lockedAxis: DragAxis | null },
  dx: number,
  dy: number,
  shiftKey: boolean,
) {
  if (shiftKey && !drag.lockedAxis && Math.hypot(dx, dy) >= 2) {
    drag.lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
  }
  if (drag.lockedAxis === 'x') return { dx, dy: 0 }
  if (drag.lockedAxis === 'y') return { dx: 0, dy }
  return { dx, dy }
}

function captureWallMountedAnchors(): WallMountedAnchor[] {
  return items.value.flatMap((item) => {
    if (!getCatalogItem(item.kind).wallMounted || !roomEdges.value.length) return []
    let nearest: { edge: RoomEdge; projected: Point; distance: number } | null = null
    for (const edge of roomEdges.value) {
      const projected = projectPointToSegment({ x: item.x, y: item.y }, edge.start, edge.end)
      const distance = Math.hypot(projected.x - item.x, projected.y - item.y)
      if (!nearest || distance < nearest.distance) nearest = { edge, projected, distance }
    }
    if (!nearest || nearest.distance > 20) return []
    const dx = nearest.edge.end.x - nearest.edge.start.x
    const dy = nearest.edge.end.y - nearest.edge.start.y
    const length = Math.hypot(dx, dy) || 1
    return [{
      itemId: item.id,
      start: { ...nearest.edge.start },
      end: { ...nearest.edge.end },
      parameter: edgeParameter(nearest.projected, nearest.edge.start, nearest.edge.end),
      normalOffset: ((item.x - nearest.projected.x) * -dy + (item.y - nearest.projected.y) * dx) / length,
      rotationOffset: wallMountedRotationOffset(item.rotation, nearest.edge),
    }]
  })
}

function getWallMountedAnchorUpdates(anchors: WallMountedAnchor[], movedCorners: CornerMove[]) {
  const updates: WallMountedAnchorUpdate[] = []
  for (const anchor of anchors) {
    const startMove = movedCorners.find((move) => samePoint(move.from, anchor.start))
    const endMove = movedCorners.find((move) => samePoint(move.from, anchor.end))
    if (!startMove && !endMove) continue
    const start = startMove?.to ?? anchor.start
    const end = endMove?.to ?? anchor.end
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length < 0.1) continue
    const item = items.value.find((entry) => entry.id === anchor.itemId)
    if (!item) continue
    const minimumParameter = Math.min(item.width / (2 * length), 0.5)
    const parameter = Math.max(minimumParameter, Math.min(1 - minimumParameter, anchor.parameter))
    updates.push({
      itemId: item.id,
      point: {
        x: start.x + dx * parameter - dy / length * anchor.normalOffset,
        y: start.y + dy * parameter + dx / length * anchor.normalOffset,
      },
      rotation: wallMountedRotation({ start, end }, anchor.rotationOffset),
    })
  }
  return updates
}

function applyWallMountedAnchorUpdates(updates: WallMountedAnchorUpdate[]) {
  for (const update of updates) {
    const item = items.value.find((entry) => entry.id === update.itemId)
    if (!item) continue
    item.x = update.point.x
    item.y = update.point.y
    item.rotation = update.rotation
  }
}

function roomCornerPointerDown(event: PointerEvent, corner: Point) {
  event.stopPropagation()
  if (event.button === 2) {
    event.preventDefault()
    removeRoomCorner(corner)
    return
  }
  if (activeTool.value !== 'select' || !event.isPrimary || event.button !== 0) return
  event.preventDefault()
  selectedWallId.value = null
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (!svg) return
  roomCornerDrag.value = {
    corner: { ...corner },
    pointerStart: svgPoint(event, svg),
    rooms: roomPolygonsWithSharedVertices(allRooms.value),
    anchors: captureWallMountedAnchors(),
    lockedAxis: null,
  }
  svg.setPointerCapture(event.pointerId)
  ignoreNextCanvasClick.value = true
  activePointerId.value = event.pointerId
}

function moveRoomWall(
  edge: RoomEdge,
  dx: number,
  dy: number,
  sourceRooms = allRooms.value,
  anchors: WallMountedAnchor[] = [],
) {
  const rooms = roomPolygonsWithSharedVertices(sourceRooms).map((room) => room.map((point) => {
    if (samePoint(point, edge.start) || samePoint(point, edge.end)) {
      return { x: point.x + dx, y: point.y + dy }
    }
    return point
  }))
  if (!isValidRoomLayout(rooms)) return false
  const movedCorners = [
    { from: edge.start, to: { x: edge.start.x + dx, y: edge.start.y + dy } },
    { from: edge.end, to: { x: edge.end.x + dx, y: edge.end.y + dy } },
  ]
  const anchorUpdates = getWallMountedAnchorUpdates(anchors, movedCorners)
  if (!wallMountedOpeningLayoutIsValid(rooms, anchorUpdates)) return false
  roomPoints.value = rooms[0]!
  additionalRoomPoints.value = rooms.slice(1)
  applyWallMountedAnchorUpdates(anchorUpdates)
  return true
}

function roomWallPointerDown(event: PointerEvent, edge: RoomEdge) {
  if (activeTool.value !== 'select' || !event.isPrimary || event.button !== 0) return
  event.stopPropagation()
  selectedId.value = null
  isEgoCameraSelected.value = false
  selectedWallId.value = edge.id
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (!svg) return
  roomWallDrag.value = {
    wall: edge,
    pointerStart: svgPoint(event, svg),
    rooms: roomPolygonsWithSharedVertices(allRooms.value),
    anchors: captureWallMountedAnchors(),
    lockedAxis: null,
  }
  svg.setPointerCapture(event.pointerId)
  ignoreNextCanvasClick.value = true
  activePointerId.value = event.pointerId
}

function updateRoomWallLength(id: string, length: number) {
  const edge = roomEdges.value.find((roomEdge) => roomEdge.id === id)
  if (!edge || !Number.isFinite(length) || length < 1) return
  const currentLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y)
  if (currentLength < 0.001) return
  const delta = length - currentLength
  const direction = {
    x: (edge.end.x - edge.start.x) / currentLength,
    y: (edge.end.y - edge.start.y) / currentLength,
  }
  const rooms = roomPolygonsWithSharedVertices(allRooms.value).map((room) => room.map((point) => {
    if (samePoint(point, edge.start)) {
      return { x: point.x - direction.x * delta / 2, y: point.y - direction.y * delta / 2 }
    }
    if (samePoint(point, edge.end)) {
      return { x: point.x + direction.x * delta / 2, y: point.y + direction.y * delta / 2 }
    }
    return point
  }))
  if (!isValidRoomLayout(rooms)) return
  const movedCorners = [
    {
      from: edge.start,
      to: { x: edge.start.x - direction.x * delta / 2, y: edge.start.y - direction.y * delta / 2 },
    },
    {
      from: edge.end,
      to: { x: edge.end.x + direction.x * delta / 2, y: edge.end.y + direction.y * delta / 2 },
    },
  ]
  const anchorUpdates = getWallMountedAnchorUpdates(captureWallMountedAnchors(), movedCorners)
  if (!wallMountedOpeningLayoutIsValid(rooms, anchorUpdates)) return
  roomPoints.value = rooms[0]!
  additionalRoomPoints.value = rooms.slice(1)
  applyWallMountedAnchorUpdates(anchorUpdates)
}

function updateRoomWallDimension(id: string, dimension: 'depth' | 'height', value: number) {
  if (!Number.isFinite(value) || value < 1) return
  const current = roomWallDimensions.value[id] ?? { depth: WALL_THICKNESS, height: 265 }
  roomWallDimensions.value = {
    ...roomWallDimensions.value,
    [id]: { ...current, [dimension]: value },
  }
}

function onCanvasContextMenu(event: MouseEvent) {
  event.preventDefault()
  if (activeTool.value !== 'select') cancelActiveCanvasAction()
}

function itemPointerDown(event: PointerEvent, item: PlanItem) {
  event.stopPropagation()
  selectedWallId.value = null
  isEgoCameraSelected.value = false
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

function egoCameraPointerDown(event: PointerEvent) {
  event.stopPropagation()
  selectedWallId.value = null
  selectedId.value = null
  isEgoCameraSelected.value = true
  if (activeTool.value !== 'select' || !event.isPrimary || event.button !== 0) return
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (svg) {
    const point = svgPoint(event, svg)
    dragOffset.value = { x: egoCamera.value.x - point.x, y: egoCamera.value.y - point.y }
    svg.setPointerCapture(event.pointerId)
  }
  ignoreNextCanvasClick.value = true
  activePointerId.value = event.pointerId
  isDraggingEgoCamera.value = true
  isDragging.value = true
}

function selectEgoCamera() {
  selectedId.value = null
  selectedWallId.value = null
  isEgoCameraSelected.value = true
}

function setEgoCameraSelected(selected: boolean) {
  if (selected) {
    selectedId.value = null
    selectedWallId.value = null
  }
  isEgoCameraSelected.value = selected
}

function selectItem(id: number | null) {
  selectedWallId.value = null
  isEgoCameraSelected.value = false
  selectedId.value = id
}

function selectRoomWall(id: string | null) {
  selectedId.value = null
  isEgoCameraSelected.value = false
  selectedWallId.value = id
}

function rotationHandlePointerDown(event: PointerEvent, item: PlanItem) {
  event.stopPropagation()
  isEgoCameraSelected.value = false
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
  if (isDraggingEgoCamera.value && activePointerId.value === event.pointerId) {
    const pointerPoint = svgPoint(event)
    const point = {
      x: pointerPoint.x + dragOffset.value.x,
      y: pointerPoint.y + dragOffset.value.y,
    }
    if (isPointInsideRoom(point)) {
      egoCamera.value.x = point.x
      egoCamera.value.y = point.y
    }
    return
  }
  if (roomWallDrag.value && activePointerId.value === event.pointerId) {
    const drag = roomWallDrag.value
    const pointer = svgPoint(event)
    const delta = constrainDragDelta(
      drag,
      pointer.x - drag.pointerStart.x,
      pointer.y - drag.pointerStart.y,
      event.shiftKey,
    )
    moveRoomWall(
      drag.wall,
      delta.dx,
      delta.dy,
      drag.rooms,
      drag.anchors,
    )
    return
  }
  if (roomCornerDrag.value && activePointerId.value === event.pointerId) {
    const drag = roomCornerDrag.value
    const pointer = svgPoint(event)
    const delta = constrainDragDelta(
      drag,
      pointer.x - drag.pointerStart.x,
      pointer.y - drag.pointerStart.y,
      event.shiftKey,
    )
    const corner = {
      x: Math.max(20, Math.min(VIEW_WIDTH - 20, drag.corner.x + delta.dx)),
      y: Math.max(20, Math.min(VIEW_HEIGHT - 20, drag.corner.y + delta.dy)),
    }
    const rooms = drag.rooms.map((room) => {
      const updated: Point[] = []
      for (let index = 0; index < room.length; index++) {
        const start = room[index]!
        const end = room[(index + 1) % room.length]!
        if (samePoint(start, drag.corner)) {
          updated.push({ ...corner })
          continue
        }
        updated.push({ ...start })
        if (pointOnSegment(drag.corner, start, end)
          && Math.hypot(drag.corner.x - start.x, drag.corner.y - start.y) > 0.1
          && Math.hypot(drag.corner.x - end.x, drag.corner.y - end.y) > 0.1) {
          updated.push({ ...corner })
        }
      }
      return updated
    })
    if (isValidRoomLayout(rooms)) {
      const anchorUpdates = getWallMountedAnchorUpdates(drag.anchors, [{ from: drag.corner, to: corner }])
      if (!wallMountedOpeningLayoutIsValid(rooms, anchorUpdates)) return
      roomPoints.value = rooms[0]!
      additionalRoomPoints.value = rooms.slice(1)
      applyWallMountedAnchorUpdates(anchorUpdates)
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
    const rotation = normalizeRotation(rotationStartItemAngle.value + Math.round(angleDelta / increment) * increment)
    if (isFurniturePlacementValid({ x: item.x, y: item.y }, item, rotation)) item.rotation = rotation
    return
  }
  if (getCatalogItem(item.kind).wallMounted) {
    const edge = nearestRoomEdge(point)
    const projected = projectOnEdge(point, edge, item.width / 2)
    const previousEdge = nearestRoomEdge({ x: item.x, y: item.y })
    const rotationOffset = wallMountedRotationOffset(item.rotation, previousEdge)
    const positionUpdate = { itemId: item.id, point: projected.point, rotation: wallMountedRotation(edge, rotationOffset) }
    if (!wallMountedOpeningLayoutIsValid(allRooms.value, [positionUpdate])) return
    item.x = projected.point.x
    item.y = projected.point.y
    item.rotation = positionUpdate.rotation
  } else {
    const snapped = snapFurnitureToWall(point, item)
    if (snapped) {
      item.x = snapped.point.x
      item.y = snapped.point.y
      item.rotation = normalizeRotation(snapped.rotation)
    } else if (isFurniturePlacementValid(point, item)) {
      item.x = point.x
      item.y = point.y
    }
  }
}

function stopDragging() {
  isDragging.value = false
  isDraggingEgoCamera.value = false
  isRotating.value = false
  roomCornerDrag.value = null
  roomWallDrag.value = null
  activePointerId.value = null
  window.setTimeout(() => {
    ignoreNextCanvasClick.value = false
  }, 0)
}

function beginRoomDrawing() {
  sidebarOpen.value = true
  projectMenuOpen.value = true
  newFloorplanConfirmationOpen.value = true
}

function cancelConfirmation() {
  activeConfirmation.value = null
}

function confirmNewFloorplan() {
  if (!planLibraryActions.value?.markCurrentPlanUnsaved()) {
    newFloorplanConfirmationOpen.value = true
    return
  }
  newFloorplanConfirmationOpen.value = false
  projectMenuOpen.value = false
  planName.value = 'My apartment'
  egoCamera.value = { x: 0, y: 0, rotation: 0 }
  isEgoCameraSelected.value = false
  activeConfirmation.value = null
  items.value = []
  roomWallDimensions.value = {}
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
  selectedWallId.value = null
  isEgoCameraSelected.value = false
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
  egoCamera.value = defaultEgoCamera([roomPoints.value])
  isEgoCameraSelected.value = false
  additionalRoomPoints.value = []
  roomNames.value = ['Room 1']
  items.value = []
  roomWallDimensions.value = {}
  measurements.value = []
  drawingRoomPoints.value = []
  drawingCursor.value = null
  drawingCursorClosesRoom.value = false
  drawingCursorSnapsToWall.value = false
  roomDrawingError.value = ''
  selectedWallId.value = null
  activeTool.value = 'addRoom'
}

function beginRoomAddition() {
  clearCanvasDraft()
  selectedId.value = null
  selectedWallId.value = null
  isEgoCameraSelected.value = false
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
    .filter((points) => existingRooms.every((room) => !roomInteriorsOverlap(points, room)))
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

function startCatalogDrag(event: DragEvent, kind: FurnitureKind) {
  event.dataTransfer?.setData('application/x-floorwise-catalog-item', kind)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function addCatalogItemAt(kind: FurnitureKind, point: Point) {
  if (!catalogItemsByKind.has(kind)) return
  const definition = getCatalogItem(kind)
  if (definition.wallMounted) {
    const edge = nearestRoomEdge(point)
    const projected = projectPointToSegment(point, edge.start, edge.end)
    if (Math.hypot(projected.x - point.x, projected.y - point.y) > FURNITURE_WALL_SNAP_DISTANCE) {
      canvasActionError.value = 'Drop wall items onto a wall.'
      return
    }
  }
  addItem(kind, point, true)
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
}

function rotateSelected() {
  if (!selectedItem.value) return
  selectedItem.value.rotation = normalizeRotation(selectedItem.value.rotation + (isWallOpening(selectedItem.value) ? 180 : 90))
}

function updateSelectedRotation(rotation: number) {
  const item = selectedItem.value
  if (!item) return
  if (isWallOpening(item)) {
    const edge = nearestRoomEdge({ x: item.x, y: item.y })
    item.rotation = wallMountedRotation(edge, wallMountedRotationOffset(rotation, edge))
    return
  }
  item.rotation = normalizeRotation(rotation)
}

function updateSelectedSurfaceColor(color: string) {
  if (selectedItem.value) selectedItem.value.color = color
}

function updateSelectedOpen(open: boolean) {
  const item = selectedItem.value
  if (!item || !getCatalogItem(item.kind).openable) return
  item.open = open
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

const exportPlanData = computed(() => ({
  name: planName.value,
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
  roomWallDimensions: roomWallDimensions.value,
  measurements: measurements.value,
  egoCamera: egoCamera.value,
}))

const importedPlanModel = computed<ImportedPlan | null>({
  get: () => null,
  set: (plan) => {
    if (!plan) return
    items.value = plan.items
    roomWallDimensions.value = plan.roomWallDimensions
    measurements.value = plan.measurements
    roomPoints.value = plan.rooms[0] ?? []
    additionalRoomPoints.value = plan.rooms.slice(1)
    roomNames.value = plan.roomNames
    egoCamera.value = plan.egoCamera
    isEgoCameraSelected.value = false
    nextId.value = Math.max(10, ...plan.items.map((item) => item.id + 1), ...plan.measurements.map((measurement) => measurement.id + 1))
    selectedId.value = null
    selectedWallId.value = null
    clearCanvasDraft()
    activeTool.value = 'select'
  },
})

function formatLength(start: Point, end: Point) {
  const meters = Math.hypot(end.x - start.x, end.y - start.y) / SCALE
  return `${meters.toFixed(2)} m`
}

function itemColor(kind: FurnitureKind) {
  return getCatalogItem(kind).color
}

function itemLabel(kind: FurnitureKind) {
  return getCatalogItem(kind).label[language.value]
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

function selectTutorialDemoItem() {
  if (!items.value.length) {
    if (roomPoints.value.length) addItem('chair')
    return
  }
  selectedId.value = items.value[0]!.id
}

function restartTutorial() {
  moreMenuOpen.value = false
  appTutorial.value?.restart()
}

function openChangelog() {
  moreMenuOpen.value = false
  changelogOpen.value = true
}

function clearPlan() {
  activeConfirmation.value = 'reset-plan'
}

function confirmResetPlan() {
  activeConfirmation.value = null
  items.value = []
  roomWallDimensions.value = {}
  measurements.value = []
  selectedId.value = null
  selectedWallId.value = null
  isEgoCameraSelected.value = false
}

function confirmActiveAction() {
  if (activeConfirmation.value === 'reset-plan') confirmResetPlan()
}

function saveBeforeStartingNewFloorplan() {
  newFloorplanConfirmationOpen.value = false
  planLibraryActions.value?.saveBeforeNewFloorplan()
}

function resumeNewFloorplanPrompt() {
  newFloorplanConfirmationOpen.value = true
}

function cancelNewFloorplanPrompt() {
  newFloorplanConfirmationOpen.value = false
  projectMenuOpen.value = false
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null)
}

function stopKeyboardMovement() {
  heldArrowKeys.clear()
  isKeyboardMoving.value = false
  if (keyboardMoveFrame) window.cancelAnimationFrame(keyboardMoveFrame)
  keyboardMoveFrame = 0
  keyboardMoveStartedAt = 0
  keyboardMoveLastFrame = 0
}

function moveSelectedItemWithKeys(timestamp: number) {
  if (!heldArrowKeys.size || (selectedId.value === null && selectedWallId.value === null) || (view.value !== '2d' && view.value !== '3d')) {
    stopKeyboardMovement()
    return
  }
  const selectedWall = selectedWallId.value
    ? roomEdges.value.find((edge) => edge.id === selectedWallId.value)
    : undefined
  const item = items.value.find((entry) => entry.id === selectedId.value)
  if (!selectedWall && !item) {
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
    if (selectedWall) {
      moveRoomWall(selectedWall, dx, dy)
    } else if (item) {
      const target = { x: item.x + dx, y: item.y + dy }
      if (getCatalogItem(item.kind).wallMounted) {
        const edge = nearestRoomEdge(target)
        const projected = projectOnEdge(target, edge, item.width / 2)
        const previousEdge = nearestRoomEdge({ x: item.x, y: item.y })
        const rotationOffset = wallMountedRotationOffset(item.rotation, previousEdge)
        const positionUpdate = { itemId: item.id, point: projected.point, rotation: wallMountedRotation(edge, rotationOffset) }
        if (wallMountedOpeningLayoutIsValid(allRooms.value, [positionUpdate])) {
          item.x = projected.point.x
          item.y = projected.point.y
          item.rotation = positionUpdate.rotation
        }
      } else if (isFurniturePlacementValid(target, item)) {
        item.x = target.x
        item.y = target.y
      }
    }
  }
  keyboardMoveLastFrame = timestamp
  keyboardMoveFrame = window.requestAnimationFrame(moveSelectedItemWithKeys)
}

function onKeyboardMoveKeyDown(event: KeyboardEvent) {
  if (isEditableKeyboardTarget(event.target)) return
  if (event.key === 'Delete' && selectedId.value !== null) {
    event.preventDefault()
    stopKeyboardMovement()
    removeSelected()
    return
  }
  if (!event.key.startsWith('Arrow') || (selectedId.value === null && selectedWallId.value === null)) return
  if (view.value !== '2d' && view.value !== '3d') return
  event.preventDefault()
  heldArrowKeys.add(event.key)
  isKeyboardMoving.value = true
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

function syncSidebarToViewport() {
  const nextIsMobileViewport = window.matchMedia('(max-width: 760px)').matches
  if (nextIsMobileViewport === isMobileViewport) return
  isMobileViewport = nextIsMobileViewport
  sidebarOpen.value = !nextIsMobileViewport
}

onMounted(() => {
  isMobileViewport = window.matchMedia('(max-width: 760px)').matches
  sidebarOpen.value = !isMobileViewport
  window.addEventListener('resize', syncSidebarToViewport)
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
      const plan = JSON.parse(savedPlan) as { items?: Array<Partial<PlanItem> & Pick<PlanItem, 'id' | 'kind' | 'x' | 'y' | 'width' | 'depth' | 'height' | 'rotation'> & { rearSide?: unknown; doorOpen?: boolean; windowOpen?: boolean; windowOpenWings?: 'closed' | 'left' | 'right' | 'both' }>; roomWallDimensions?: Record<string, { depth?: number; height?: number }>; measurements?: Measurement[]; roomPoints?: Point[]; rooms?: Point[][]; roomNames?: string[]; egoCamera?: EgoCamera }
      if (Array.isArray(plan.items) && Array.isArray(plan.measurements)) {
        items.value = plan.items.map(({ rearSide: _rearSide, doorOpen, windowOpen, windowOpenWings, ...savedItem }) => {
          const legacyOpen = doorOpen ?? windowOpen
            ?? (windowOpenWings === undefined ? undefined : windowOpenWings !== 'closed')
          const item = {
            ...savedItem,
            open: savedItem.open ?? legacyOpen,
          } as PlanItem
          const definition = getCatalogItem(item.kind)
          item.section = definition.section
          item.wallDetailCategory = definition.wallDetailCategory
          item.floorOffset ??= definition.defaultFloorOffset ?? 0
          item.rotation = normalizeRotation(item.rotation)
          return definition.normalizeSavedItem?.(item) ?? item
        })
        roomWallDimensions.value = Object.fromEntries(
          Object.entries(plan.roomWallDimensions ?? {})
            .filter(([, dimensions]) => Number.isFinite(dimensions.depth) && dimensions.depth! >= 1
              && Number.isFinite(dimensions.height) && dimensions.height! >= 1)
            .map(([id, dimensions]) => [id, { depth: dimensions.depth!, height: dimensions.height! }]),
        )
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
        egoCamera.value = plan.egoCamera
          && Number.isFinite(plan.egoCamera.x)
          && Number.isFinite(plan.egoCamera.y)
          && Number.isFinite(plan.egoCamera.rotation)
          ? { ...plan.egoCamera, rotation: normalizeRotation(plan.egoCamera.rotation) }
          : defaultEgoCamera(allRooms.value)
        nextId.value = Math.max(10, ...items.value.map((item) => item.id + 1), ...measurements.value.map((measurement) => measurement.id + 1))
      } else {
        console.warn(t('Saved room plan has an invalid structure and was not restored.'))
      }
    } catch (error) {
      console.error(t('Could not restore the saved room plan.'), error)
    }
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncSidebarToViewport)
  canvasResizeObserver?.disconnect()
  canvasResizeObserver = undefined
  window.removeEventListener('pointerup', stopDragging)
  window.removeEventListener('pointercancel', stopDragging)
  window.removeEventListener('keydown', onKeyboardMoveKeyDown)
  window.removeEventListener('keyup', onKeyboardMoveKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  stopKeyboardMovement()
})
watch([items, roomWallDimensions, measurements, roomPoints, additionalRoomPoints, roomNames, egoCamera], () => {
  if (import.meta.client) {
    window.localStorage.setItem('floorwise-plan-v1', JSON.stringify({
      items: items.value,
      roomWallDimensions: roomWallDimensions.value,
      measurements: measurements.value,
      roomPoints: roomPoints.value,
      rooms: allRooms.value,
      roomNames: roomNames.value,
      egoCamera: egoCamera.value,
    }))
  }
}, { deep: true })
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar" :class="{ 'sidebar-collapsed': !sidebarOpen }">
      <div class="sidebar-brand-row">
        <a v-if="sidebarOpen" class="brand" href="#" :aria-label="`Floorwise ${t('home')}`">
          <span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 15.5 16 6l11 9.5v10H5v-10Z"/><path d="M12 25.5v-8h8v8"/></svg></span>
          <span>floorwise<span class="brand-period">.</span><small>{{ t('YOUR SPACE, REIMAGINED') }}</small></span>
        </a>
        <button class="sidebar-collapse-toggle" type="button" :aria-label="t(sidebarOpen ? 'Minimize sidebar' : 'Expand sidebar')" :title="t(sidebarOpen ? 'Minimize sidebar' : 'Expand sidebar')" @click="sidebarOpen = !sidebarOpen">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path :d="sidebarOpen ? 'm12 4-6 6 6 6' : 'm8 4 6 6-6 6'"/></svg>
        </button>
      </div>
      <div v-if="sidebarOpen" class="sidebar-scroll">
        <div class="sidebar-section project-section">
          <div class="section-eyebrow">{{ t('YOUR PROJECT') }}</div>
          <button class="project-select" :aria-expanded="projectMenuOpen" aria-haspopup="menu" @click="projectMenuOpen = !projectMenuOpen">
            <span class="project-avatar">M</span>
            <span class="project-copy"><input v-model="planName" class="plan-name-input" maxlength="100" :aria-label="t('Plan name')" :title="t('Plan name')" :placeholder="planName"/><small>{{ t('Personal floorplan') }}</small></span>
            <svg class="project-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
          </button>
          <div v-show="projectMenuOpen" class="project-menu">
            <button @click="beginRoomDrawing">{{ t('Start a new floorplan') }}</button>

            <HomePlannerImportExport
              ref="planLibraryActions"
              :t="t"
              :plan="exportPlanData"
              :validate-room-layout="isValidRoomLayout"
              v-model:plan-name="planName"
              v-model:imported-plan="importedPlanModel"
              @saved-before-new="confirmNewFloorplan"
              @save-before-new-cancelled="resumeNewFloorplanPrompt"
              @save-before-new-failed="resumeNewFloorplanPrompt"
            />
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
                <button class="placed-select" :aria-label="`${t('Select')} ${item.name || itemLabel(item.kind)}`" @click="selectedId = item.id">
                  <span class="placed-dot" :style="{ background: item.color || itemColor(item.kind) }"></span>
                  <span class="placed-dim">{{ item.width }} × {{ item.depth }}</span>
                </button>
                <input
                  v-model="item.name"
                  class="placed-name-input"
                  :aria-label="`${itemLabel(item.kind)} ${t('name')}`"
                  :placeholder="itemLabel(item.kind)"
                  @click.stop
                  @focus="selectedId = item.id"
                >
                <button class="placed-delete" type="button" :aria-label="`${t('Remove')} ${item.name || itemLabel(item.kind)}`" :title="t('Remove object')" @click.stop="removeItem(item.id)">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5m2 0-.6 8H4.6l-.6-8m3 2v4m2-4v4"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div v-if="!allRooms.length" class="room-row muted-room"><span class="room-dot empty-dot"></span><span>{{ t('No floorplan drawn') }}</span></div>
          <button class="room-row muted-room" @click="beginRoomAddition"><span class="room-dot empty-dot"></span><span>{{ t(allRooms.length ? '+ Add a room' : 'Draw your first room') }}</span></button>
        </div>

        <div class="sidebar-section furniture-section">
          <FurnitureCatalog :t="t" :language="language" :can-place="Boolean(roomPoints.length)" @place="addCatalogItem" @drag-start="startCatalogDrag" />
        </div>

      </div>
      <div v-if="sidebarOpen" class="sidebar-bottom">
        <div class="avatar"></div>
        <span><strong>{{ t('Your workspace') }}</strong><small>{{ t('Personal plan') }}</small></span>
        <button class="icon-button more-button" :aria-label="t('More options')" :aria-expanded="moreMenuOpen" aria-haspopup="menu" @click="moreMenuOpen = !moreMenuOpen">···</button>
        <div v-if="moreMenuOpen" class="workspace-menu" role="menu">
          <button role="menuitem" disabled @click="restartTutorial">
            <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 8.5a5.5 5.5 0 1 1 1.6 4M3.5 4.5v4h4M9 5.5v3l2 1.5"/></svg>
            {{ t('Restart tour - coming soon') }}
          </button>
          <button role="menuitem" @click="openChangelog">
            <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 2.5h7l3 3v10H4zM11 2.5v3h3M6.5 9h5M6.5 12h5"/></svg>
            {{ t('Changelog') }}
          </button>
        </div>
      </div>
    </aside>
    <button v-if="sidebarOpen" class="sidebar-backdrop" type="button" :aria-label="t('Close sidebar')" @click="sidebarOpen = false"></button>

    <section class="workspace">
      <HomePlannerToolbar
        :t="t"
        :language="language"
        :plan-name="planName"
        :view="view"
        :active-tool="activeTool"
        :sidebar-open="sidebarOpen"
        :show-grid="showGrid"
        :show-dimensions="showDimensions"
        :show-custom-measurements="showCustomMeasurements"
        :zoom="zoom"
        :room-count="allRooms.length"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @language-change="onLanguageChange"
        @update:view="view = $event"
        @select-tool="selectTool"
        @add-room="beginRoomAddition"
        @toggle-grid="showGrid = !showGrid"
        @toggle-dimensions="showDimensions = !showDimensions"
        @toggle-measurements="showCustomMeasurements = !showCustomMeasurements"
        @zoom="changeZoom"
      />
      <div class="canvas-area">
        <div class="canvas-label"><span class="canvas-status"></span> {{ t(view === '2d' ? 'FLOOR PLAN' : 'INTERACTIVE 3D') }} <span class="label-divider">·</span> {{allRooms.length}} {{ t(allRooms.length > 1 ? t('ROOMS') : t('ROOM') ) }}</div>
        <div ref="canvasCard" class="canvas-card" :class="{ 'immersive-card': view === '3d' }" @wheel="onCanvasWheel">
          <PlanScene2D
            v-if="view === '2d'"
            :view-box="planViewBox"
            :view-width="VIEW_WIDTH"
            :view-height="VIEW_HEIGHT"
            :grid-size="GRID_SIZE"
            :scale="SCALE"
            :zoom="zoom"
            :pan-offset="panOffset"
            :show-grid="showGrid"
            :all-rooms="allRooms"
            :show-dimensions="showDimensions"
            :room-edges="roomEdges"
            :room-dimension-labels="roomDimensionLabels"
            :room-label-points="roomLabelPoints"
            :room-names="roomNames"
            :room-display-name="roomDisplayName"
            :room-area-for="roomAreaFor"
            :room-wall-dimensions="roomWallDimensions"
            :show-custom-measurements="showCustomMeasurements"
            :measurements="measurements"
            :fixed-size-label-transform="fixedSizeLabelTransform"
            :fixed-size-group-transform="fixedSizeGroupTransform"
            :format-length="formatLength"
            :t="t"
            :live-measurement="liveMeasurement"
            :pending-point="pendingPoint"
            :active-tool="activeTool"
            :drawing-room-points="drawingRoomPoints"
            :drawing-cursor="drawingCursor"
            :drawing-cursor-snaps-to-wall="drawingCursorSnapsToWall"
            :room-draft-measurement="roomDraftMeasurement"
            :drawing-cursor-closes-room="drawingCursorClosesRoom"
            :items="items"
            :ego-camera="egoCamera"
            :is-ego-camera-selected="isEgoCameraSelected"
            :selected-id="selectedId"
            :selected-wall-id="selectedWallId"
            :is-dragging="isDragging"
            :item-label="itemLabel"
            :room-corners="roomCorners"
            :room-corner-drag="roomCornerDrag"
            :same-point="samePoint"
            :drag-measurements="dragMeasurements"
            :room-points="roomPoints"
            :room-bounds="roomBounds"
            :total-area="totalArea"
            @canvas-click="onCanvasClick"
            @canvas-pointer-move="onCanvasPointerMove"
            @canvas-pointer-stop="stopDragging"
            @update-pan-offset="panOffset = $event"
            @canvas-context-menu="onCanvasContextMenu"
            @catalog-drop="addCatalogItemAt"
            @measurement-delete="removeMeasurement"
            @item-pointer-down="itemPointerDown"
            @item-select="selectItem"
            @ego-camera-pointer-down="egoCameraPointerDown"
            @ego-camera-select="selectEgoCamera"
            @wall-pointer-down="roomWallPointerDown"
            @rotation-pointer-down="rotationHandlePointerDown"
            @room-corner-pointer-down="roomCornerPointerDown"
            @remove-room-corner="removeRoomCorner"
          />

          <ClientOnly v-else>
            <RoomScene3D
              :items="items"
              :room-wall-dimensions="roomWallDimensions"
              :rooms="allRooms"
              :room-width="roomBounds.width"
              :room-depth="roomBounds.height"
              :room-x="roomBounds.x"
              :room-y="roomBounds.y"
              :selected-id="selectedId"
              :selected-wall-id="selectedWallId"
              :camera-snapshot="cameraSnapshot"
              :ego-camera="egoCamera"
              :is-ego-camera-selected="isEgoCameraSelected"
              @select="selectItem"
              @wall-select="selectRoomWall"
              @camera-change="cameraSnapshot = $event"
              @ego-camera-change="egoCamera = $event"
              @ego-camera-select="setEgoCameraSelected"
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
        <div class="canvas-footer"><AppKeyboardMouseAid :view="view" :t="t" /><span v-if="canvasActionError" role="status">{{ t(canvasActionError) }}</span><span>{{ placedCount }} {{ t('objects') }}</span><span class="footer-separator">·</span><span>{{ totalArea }} m² {{ t('floor area') }}</span><span class="footer-spacer"></span><button @click="clearPlan">{{ t('Reset plan') }}</button></div>
      </div>
      <HomePlannerInspector
        v-if="selectedItem || selectedRoomWall"
        :item="selectedItem"
        :wall="selectedRoomWall"
        :surface-colors="selectedSurfaceColors"
        :selected-surface-color="selectedSurfaceColor"
        :openable="selectedItemOpenable"
        :t="t"
        :item-label="itemLabel"
        @close="selectedId = null; selectedWallId = null"
        @rotate="rotateSelected"
        @rotation-change="updateSelectedRotation"
        @surface-color-change="updateSelectedSurfaceColor"
        @open-change="updateSelectedOpen"
        @wall-length-change="selectedRoomWall && updateRoomWallLength(selectedRoomWall.edge.id, $event)"
        @wall-depth-change="selectedRoomWall && updateRoomWallDimension(selectedRoomWall.edge.id, 'depth', $event)"
        @wall-height-change="selectedRoomWall && updateRoomWallDimension(selectedRoomWall.edge.id, 'height', $event)"
        @remove="removeSelected"
      />
      <div v-if="activeTool === 'cube' && view === '2d'" class="placement-tip">{{ t('Click anywhere in the room to place your cube') }} <button @click="selectTool('select')">{{ t('Cancel') }}</button></div>
    </section>
    <AppConfirmationDialog
      :open="activeConfirmation === 'reset-plan'"
      :eyebrow="t('RESET PLAN')"
      :title="t('Reset plan?')"
      :description="t('This will remove all placed items and measurements.')"
      :cancel-label="t('Cancel')"
      :confirm-label="t('Reset plan')"
      @cancel="cancelConfirmation"
      @confirm="confirmActiveAction"
    />
    <AppConfirmationDialog
      :open="newFloorplanConfirmationOpen"
      :eyebrow="t('NEW FLOORPLAN')"
      :title="t('Save this floorplan before starting a new one?')"
      :description="t('Save your current floorplan before starting a new one. If you continue without saving, it will be discarded.')"
      @cancel="cancelNewFloorplanPrompt"
    >
      <template #actions>
        <div class="new-floorplan-actions">
          <button class="new-floorplan-cancel" @click="cancelNewFloorplanPrompt">{{ t('Cancel') }}</button>
          <button class="new-floorplan-discard" @click="confirmNewFloorplan">{{ t("Don't save") }}</button>
          <button class="new-floorplan-save" @click="saveBeforeStartingNewFloorplan">{{ t('Save') }}</button>
        </div>
      </template>
    </AppConfirmationDialog>
    <AppChangelog :open="changelogOpen" @update:open="changelogOpen = $event" />
    <AppTutorial
      ref="appTutorial"
      :has-selection="selectedId !== null"
      :has-items="items.length > 0"
      @select-demo-item="selectTutorialDemoItem"
      @set-project-menu-open="projectMenuOpen = $event"
      @clear-selection="selectedId = null"
      @create-own-floorplan="beginRoomDrawing"
    />
  </main>
</template>


<style lang="scss">
:root {
  font-family: 'Onest', sans-serif;
  color: #343731;
  background: #f7f6f2;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  --ink: #343731;
  --muted: #8b8d84;
  --line: #e9e8e2;
  --green: #688472;
  --green-dark: #4c6958;
  --paper: #fff;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 360px; min-height: 100vh; }
button, input { font: inherit; }
button { color: inherit; cursor: pointer; }
.app-shell { display: flex; min-height: 100vh; background: #f7f6f2; }
.sidebar { position: sticky; top: 0; width: 284px; height: 100vh; flex: 0 0 284px; display: flex; flex-direction: column; background: #fff; border-right: 1px solid #ebeae5; z-index: 2; }
.sidebar-backdrop { display: none; }
.sidebar-brand-row { height: 78px; flex: 0 0 78px; display: flex; align-items: center; }
.brand { height: 78px; min-width: 0; flex: 1; display: flex; align-items: center; gap: 11px; padding: 0 12px 0 23px; text-decoration: none; color: var(--ink); font: 800 19px 'Manrope', sans-serif; letter-spacing: -.8px; }
.sidebar-collapse-toggle { width: 30px; height: 30px; flex: 0 0 30px; display: grid; place-items: center; margin: 0 9px 0 0; padding: 0; border: 1px solid #e9eae4; border-radius: 7px; background: #fff; color: #758174; }
.sidebar-collapse-toggle:hover { border-color: #cbd8ca; background: #f4f7f2; color: #526c59; }
.sidebar-collapse-toggle svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.sidebar.sidebar-collapsed { width: 48px; flex-basis: 48px; }
.sidebar-collapsed .sidebar-brand-row { justify-content: center; }
.sidebar-collapsed .sidebar-collapse-toggle { margin: 0; }
.brand-mark { width: 34px; height: 34px; display: grid; place-items: center; background: #e9efe9; border-radius: 11px; }
.brand-mark svg { width: 23px; fill: none; stroke: #688472; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
.brand-period { color: #77947e; }
.brand small { display: block; margin-top: 1px; color: #9a9c94; font: 600 8px 'Onest', sans-serif; letter-spacing: 1.13px; }
.sidebar-scroll { min-height: 0; flex: 1; overflow-y: auto; }
.sidebar-section { padding: 20px 19px; border-top: 1px solid #f0efeb; }
.project-section { position: relative; border-top: 0; padding-top: 12px; padding-bottom: 17px; }
.section-eyebrow { color: #92948b; font-size: 9px; font-weight: 700; letter-spacing: 1.08px; }
.project-select { width: 100%; display: flex; align-items: center; text-align: left; margin-top: 12px; padding: 0; background: none; border: 0; }
.project-menu { position: absolute; z-index: 10; top: calc(100% - 8px); left: 19px; right: 19px; padding: 5px; border: 1px solid #e8e7e0; border-radius: 7px; background: #fff; box-shadow: 0 5px 16px #34322814; }
.project-menu > button { width: 100%; padding: 9px 10px; border: 0; border-radius: 4px; background: transparent; color: #595d53; text-align: left; font-size: 10px; }
.project-menu > button:hover { background: #f3f5f1; color: #526c59; }
.new-floorplan-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.new-floorplan-actions button { min-height: 34px; padding: 0 13px; border: 1px solid #e4e5df; border-radius: 6px; background: #fff; color: #686d64; font-size: 11px; }
.new-floorplan-actions .new-floorplan-discard { border-color: #e8d4cd; color: #875e50; }
.new-floorplan-actions .new-floorplan-save { border-color: #668371; background: #668371; color: #fff; font-weight: 600; }
.project-avatar { display: grid; place-items: center; width: 35px; height: 35px; flex-shrink:0;border-radius: 10px; color: #58715e; background: #edf1e9; font: 700 14px 'Manrope', sans-serif; }
.project-copy, .sidebar-bottom > span { display: grid; gap: 3px; margin-left: 10px; }
.project-copy { display: flex; flex-direction: column; }
.project-copy strong, .sidebar-bottom strong { font-size: 12px; font-weight: 600; }
.project-copy small, .sidebar-bottom small { font-size: 10px; color: #999b93; }
.project-arrow{flex-shrink:0;}
.project-select > svg { width: 15px; margin-left: auto; fill: none; stroke: #8e9088; stroke-width: 1.5; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
.icon-button { border: 0; background: transparent; color: #85877f; }
.add-room { font-size: 20px; font-weight: 400; line-height: 18px; }
.room-row { width: 100%; height: 35px; display: flex; align-items: center; gap: 9px; border: 0; border-radius: 6px; padding: 0 9px; background: transparent; text-align: left; font-size: 11px; }
.room-entry { margin-bottom: 4px; }
.active-room { background: #f1f4ef; color: #526c59; font-weight: 600; }
.room-name-input, .plan-name-input { width: auto; flex: 1; padding: 3px 0; border: 0; outline: none; background: transparent; color: inherit; font: inherit; }
.room-name-input { width: 0; min-width:0;}
.room-name-input:focus, .plan-name-input:focus { box-shadow: 0 1px 0 #8ea18d; }
.room-name-input::placeholder, .plan-name-input::placeholder { color: #8a9485; }
.room-item-count { min-width: 17px; height: 17px; display: grid; place-items: center; border-radius: 5px; background: #e6ece3; color: #697d68; font-size: 9px; font-weight: 600; }
.room-expand-button { width: 19px; height: 22px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; }
.room-expand-button:hover:not(:disabled) { background: #e5ebe2; }
.room-expand-button:disabled { opacity: .35; cursor: default; }
.room-dot, .canvas-status { width: 6px; height: 6px; border-radius: 50%; background: #738d77; }
.room-area { margin-left: auto; color: #8e958a; font-size: 10px; font-weight: 500; }
.muted-room { color: #969890; }
.room-row:disabled { cursor: not-allowed; opacity: .55; }
.empty-dot { background: #d7d8d2; }
.furniture-section { padding-top: 19px; }
.count-pill { min-width: 21px; height: 19px; display: grid; place-items: center; border-radius: 6px; background: #eff1ec; color: #6e806d; font-size: 10px; font-weight: 600; }
.category-switcher { display: flex; background: #f5f5f1; border-radius: 7px; padding: 3px; margin: 14px 0 11px; }
.category-switcher button { width: 33.333%; border: 0; border-radius: 5px; background: transparent; color: #8e9089; padding: 6px 4px; font-size: 10px; }
.category-switcher button.active { background: #fff; color: #495b4b; box-shadow: 0 1px 3px #31392212; font-weight: 600; }
.catalog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.catalog-card { position: relative; min-width: 0; padding: 10px 9px 9px; border: 1px solid #efeee9; background: #fff; border-radius: 8px; text-align: left; transition: border-color .15s, transform .15s, box-shadow .15s; }
.catalog-card:hover, .geometry-card:hover, .import-card:hover { border-color: #b8c6b8; box-shadow: 0 3px 12px #3342250a; transform: translateY(-1px); }
.catalog-icon { height: 44px; display: grid; place-items: center; margin-bottom: 5px; background: #f6f5f0; border-radius: 6px; }
.catalog-icon svg { width: 35px; height: 35px; fill: none; stroke: #9e876e; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.icon-table svg { stroke: #aa8a68; }.icon-cupboard svg { stroke: #7d8b79; }.icon-shelf svg { stroke: #a78c74; }.icon-window svg { stroke: #66969a; }.icon-door svg { stroke: #a57d60; }.icon-carpet svg { stroke: #a86f5b; }
.catalog-card strong, .catalog-card small { display: block; }
.catalog-card strong, .geometry-card strong, .import-card strong { font-size: 10px; font-weight: 600; }
.catalog-card small, .geometry-card small, .import-card small { color: #9b9c95; font-size: 9px; margin-top: 2px; }
.catalog-plus { position: absolute; right: 8px; bottom: 10px; color: #849480; font-size: 17px; line-height: 12px; opacity: 0; transition: opacity .15s; }
.catalog-card:hover .catalog-plus { opacity: 1; }
.geometry-heading { margin-top: 21px; }
.new-pill { color: #66806d; background: #edf2eb; border-radius: 4px; padding: 3px 5px; font-size: 8px; font-weight: 700; letter-spacing: .4px; }
.geometry-card, .import-card { width: 100%; min-height: 53px; display: flex; align-items: center; gap: 10px; text-align: left; border: 1px solid #efeee9; border-radius: 8px; background: #fff; padding: 8px 10px; transition: border-color .15s, transform .15s, box-shadow .15s; }
.cube-icon, .import-icon { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 7px; background: #eef1f2; color: #738b98; font-size: 23px; }
.geometry-card > span:nth-child(2), .import-card > span:nth-child(2) { display: grid; }
.geometry-plus { margin-left: auto; color: #879382; font-size: 17px; }
.structure-heading { margin: 18px 0 9px; color: #92948b; font-size: 9px; font-weight: 700; letter-spacing: 1.08px; }
.detail-icon { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 7px; background: #eef4f3; color: #66969a; font-size: 17px; }
.door-detail { background: #f5eee7; color: #a57d60; }
.structure-card { margin-top: 7px; }
.import-card { margin-top: 7px; cursor: pointer; }
.import-card input { display: none; }
.import-icon { background: #f2f0eb; color: #8f8c80; font-size: 18px; }
.import-planned { cursor: not-allowed; opacity: .75; }
.expand-chevron { width: 13px; fill: none; stroke: #8e9088; stroke-width: 1.5; transition: transform .15s; }
.expand-chevron.expanded { transform: rotate(180deg); }
.room-item-list { margin: 2px 0 4px 15px; padding-left: 6px; border-left: 1px solid #e8eae4; }
.placed-row { width: 100%; min-height: 31px; display: flex; align-items: center; gap: 5px; border-radius: 5px; padding: 0 5px; color: #686b63; font-size: 10px; }
.placed-row:hover, .placed-active { background: #f5f6f2; }
.placed-select { height: 27px; display: flex; align-items: center; gap: 7px; padding: 0; border: 0; background: transparent; }
.placed-name-input { width: 0; min-width: 0; flex: 1; padding: 4px 3px; border: 0; border-radius: 3px; outline: none; background: transparent; color: inherit; font: inherit; }
.placed-name-input:focus { background: #fff; box-shadow: 0 0 0 1px #d8e1d5; }
.placed-name-input::placeholder { color: #777b72; opacity: 1; }
.placed-delete { width: 24px; height: 24px; flex: 0 0 24px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 5px; background: transparent; color: #9a6a60; opacity: 0; transition: opacity .15s, background-color .15s, color .15s; }
.placed-row:hover .placed-delete, .placed-row:focus-within .placed-delete { opacity: 1; }
.placed-delete:hover { background: #f7e9e6; color: #a34436; }
.placed-delete svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
.placed-dot { width: 7px; height: 7px; border-radius: 3px; }
.placed-dim { color: #a4a49c; font-size: 9px; }
.empty-items { color: #96988f; font-size: 9px; padding-left: 13px; }
.sidebar-bottom { height: 66px; display: flex; align-items: center; border-top: 1px solid #efeee9; padding: 0 18px; }
.sidebar-bottom { position: relative; }
.avatar { width: 30px; height: 30px; display: grid; place-items: center; background: #f2e9de; color: #9e7556; border-radius: 50%; font-size: 12px; font-weight: 700; }
.sidebar-bottom > span { margin-left: 9px; }
.more-button { margin-left: auto; font-size: 18px; letter-spacing: 1px; }
.workspace-menu { position: absolute; z-index: 20; right: 12px; bottom: calc(100% - 5px); min-width: 150px; padding: 5px; border: 1px solid #e8e7e0; border-radius: 7px; background: #fff; box-shadow: 0 5px 16px #34322814; }
.workspace-menu button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 9px; border: 0; border-radius: 4px; background: transparent; color: #595d53; text-align: left; font-size: 10px; }
.workspace-menu button:hover { background: #f3f5f1; color: #526c59; }
.workspace-menu svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.workspace { min-width: 0; height: 100vh; flex: 1; display: flex; flex-direction: column; position: relative; }
.topbar { height: 64px; flex: 0 0 64px; display: flex; justify-content: space-between; align-items: center; padding: 0 29px; background: #fff; border-bottom: 1px solid #ecebe6; }
.breadcrumbs { display: flex; align-items: center; gap: 10px; color: #8e9088; font-size: 11px; }
.breadcrumbs strong { color: #41443e; font-weight: 600; }
.crumb-divider { color: #cbc9c1; }
.saved-state { display: flex; align-items: center; gap: 6px; margin-left: 9px; color: #979990; font-size: 9px; }
.saved-state > span { width: 5px; height: 5px; border-radius: 50%; background: #8aa28b; }
.top-actions { display: flex; align-items: center; gap: 9px; }
.language-switch { height: 30px; border: 1px solid #e6e5df; border-radius: 6px; background: #fff; color: #555a52; padding: 0 7px; font: inherit; font-size: 10px; }
.top-icon { width: 29px; height: 29px; border: 0; border-radius: 6px; background: transparent; color: #6f726b; font-size: 20px; }
.top-icon:hover { background: #f4f4ef; }
.disabled-icon { color: #c9c9c3; }
.action-divider { width: 1px; height: 21px; background: #eae9e3; margin: 0 5px; }
.share-button { height: 33px; display: flex; align-items: center; gap: 6px; border: 1px solid #e6e5df; border-radius: 6px; background: #fff; padding: 0 11px; font-size: 10px; }
.share-button svg { width: 14px; fill: none; stroke: #73776f; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.toolbar-row { height: 62px; flex: 0 0 62px; display: flex; justify-content: space-between; align-items: center; padding: 0 30px; }
.view-switch { display: flex; gap: 3px; padding: 3px; background: #eeede7; border-radius: 7px; }
.view-switch button { height: 30px; display: flex; align-items: center; gap: 6px; border: 0; border-radius: 5px; background: transparent; color: #898b83; padding: 0 11px; font-size: 10px; }
.view-switch button.selected { background: #fff; color: #485e4d; box-shadow: 0 1px 4px #33332a14; font-weight: 600; }
.view-2d-icon { font-size: 14px; }.view-3d-icon { font-size: 15px; }
.tool-actions { display: flex; align-items: center; gap: 5px; }
.tool-button, .zoom-button { width: 29px; height: 29px; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: #81837a; }
.tool-button:hover, .tool-active { background: #e9eee8; color: #587561; }
.tool-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.toolbar-divider { height: 19px; width: 1px; background: #e3e2dc; margin: 0 5px; }
.zoom-button { font-size: 17px; font-weight: 400; }
.zoom-level { min-width: 34px; text-align: center; color: #777970; font-size: 9px; }
.tool-hint { margin-right: 6px; color: #6a816c; font-size: 10px; }
.canvas-area { flex: 1; min-height: 420px; display: flex; flex-direction: column; padding: 6px 31px 0; }
.canvas-label { display: flex; align-items: center; gap: 7px; height: 27px; color: #82847b; font-size: 8px; font-weight: 700; letter-spacing: 1px; }
.canvas-status { width: 5px; height: 5px; }
.label-divider { color: #b4b3ab; }
.canvas-card { min-height: 0; flex: 1; position: relative; overflow: hidden; border: 1px solid #e9e7e0; border-radius: 9px; background: #f7f6f2; box-shadow: 0 2px 8px #46443408; }
.immersive-card { background: #f4f2ec; }
.room-scene { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; background: #f4f2ec; }
.room-scene:fullscreen { width: 100vw; height: 100vh; border-radius: 0; }
.room-scene-canvas { width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
.scene-loading { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: #f4f2eceb; color: #687969; font-size: 12px; text-align: center; }
.scene-error { color: #875e50; }
.scene-top-left { position: absolute; top: 15px; left: 16px; display: flex; align-items: center; gap: 7px; padding: 8px 10px; border: 1px solid #e8e5dc; border-radius: 7px; background: #ffffffdf; color: #62695f; font-size: 9px; font-weight: 600; letter-spacing: .5px; box-shadow: 0 2px 7px #3432280a; pointer-events: none; }
.scene-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #719779; box-shadow: 0 0 0 3px #71977920; }
.scene-top-divider { color: #bebdb4; }
.scene-walls-toggle { position: absolute; top: 16px; right: 58px; min-height: 30px; padding: 0 9px; border: 1px solid #e7e5de; border-radius: 6px; background: #ffffffed; color: #687568; font-size: 9px; box-shadow: 0 2px 8px #3432280a; }
.scene-walls-toggle[aria-pressed="true"] { border-color: #819582; background: #eef3ed; color: #4f6957; }
.scene-top-view-toggle { position: absolute; top: 52px; right: 58px; min-height: 30px; padding: 0 9px; border: 1px solid #e7e5de; border-radius: 6px; background: #ffffffed; color: #687568; font-size: 9px; box-shadow: 0 2px 8px #3432280a; }
.scene-top-view-toggle[aria-pressed="true"] { border-color: #819582; background: #eef3ed; color: #4f6957; }
.scene-first-person-toggle { position: absolute; top: 88px; right: 58px; min-height: 30px; padding: 0 9px; border: 1px solid #e7e5de; border-radius: 6px; background: #ffffffed; color: #687568; font-size: 9px; box-shadow: 0 2px 8px #3432280a; }
.scene-first-person-toggle[aria-pressed="true"] { border-color: #819582; background: #eef3ed; color: #4f6957; }
.scene-crosshair { position: absolute; top: 50%; left: 50%; width: 18px; height: 18px; transform: translate(-50%, -50%); border: 1px solid #ffffffdd; border-radius: 50%; box-shadow: 0 0 0 1px #34322899; pointer-events: none; }
.scene-crosshair::before, .scene-crosshair::after { position: absolute; top: 50%; left: 50%; content: ""; background: #ffffffed; box-shadow: 0 0 0 1px #34322899; transform: translate(-50%, -50%); }
.scene-crosshair::before { width: 2px; height: 26px; }
.scene-crosshair::after { width: 26px; height: 2px; }
.ego-camera-marker { cursor: grab; }
.ego-camera-marker.is-dragging { cursor: grabbing; }
.scene-first-person-help { position: absolute; top: 16px; left: 50%; max-width: calc(100% - 32px); padding: 8px 10px; transform: translateX(-50%); border: 1px solid #e8e5dc; border-radius: 7px; background: #ffffffdf; color: #62695f; font-size: 9px; text-align: center; pointer-events: none; }
.scene-first-person-error { position: absolute; top: 50%; left: 50%; max-width: calc(100% - 32px); padding: 9px 12px; transform: translate(-50%, -50%); border: 1px solid #e8c9bd; border-radius: 7px; background: #fff8f4; color: #854d3d; font-size: 11px; text-align: center; box-shadow: 0 2px 8px #34322814; }
.scene-controls { position: absolute; left: 50%; bottom: 15px; display: flex; gap: 4px; transform: translateX(-50%); padding: 5px; border: 1px solid #e7e5de; border-radius: 8px; background: #ffffffdf; box-shadow: 0 2px 8px #3432280a; pointer-events: none; }
.scene-controls span { display: flex; align-items: center; gap: 5px; padding: 5px 8px; color: #74776e; font-size: 9px; white-space: nowrap; }
.scene-controls i { color: #718672; font-size: 12px; font-style: normal; }
.control-orbit { font-size: 15px !important; }
.scene-compass { position: absolute; top: 16px; right: 17px; width: 30px; height: 42px; display: grid; place-items: center; border: 1px solid #e7e5de; border-radius: 7px; background: #ffffffd9; color: #748473; font-size: 9px; pointer-events: none; }
.scene-compass span:last-child { font-size: 17px; line-height: 12px; }
.scene-selection { position: absolute; left: 16px; bottom: 18px; display: flex; align-items: center; gap: 8px; padding: 8px 11px; border: 1px solid #e5e5de; border-radius: 7px; background: #ffffffed; color: #4f564e; box-shadow: 0 2px 8px #3432280a; pointer-events: none; }
.scene-selection > span { width: 9px; height: 9px; border-radius: 3px; }
.scene-selection strong { font-size: 10px; font-weight: 600; }
.scene-selection small { color: #92948b; font-size: 9px; }
.scene-reset, .scene-fullscreen { position: absolute; bottom: 16px; display: flex; align-items: center; gap: 5px; height: 30px; padding: 0 9px; border: 1px solid #e5e4dd; border-radius: 6px; background: #ffffffea; color: #72776d; font-size: 13px; box-shadow: 0 2px 8px #3432280a; }
.scene-reset span, .scene-fullscreen span { font-size: 9px; }
.scene-fullscreen { right: 17px; bottom: 54px; }
.scene-reset { right: 17px; }
.scene-fullscreen:fullscreen { background: #fff; }
.plan-svg { width: 100%; height: 100%; min-height: 400px; display: block; cursor: crosshair; touch-action: none; }
.plan-svg.is-panning { cursor: grabbing; }
.plan-svg .plan-item { cursor: grab; }
.plan-svg .plan-item:active { cursor: grabbing; }
.plan-svg .plan-item.is-dragging { cursor: grabbing; }
.room-corner-handle { cursor: grab; }
.room-corner-handle:active, .room-corner-handle.is-dragging { cursor: grabbing; }
.room-corner-hit-area { fill: transparent; }
.room-corner-point { fill: #fff; stroke: #668774; stroke-width: 2.5; }
.room-corner-handle:hover .room-corner-point, .room-corner-handle.is-dragging .room-corner-point { fill: #dcebe0; }
.measurement-delete-control { cursor: pointer; }
.measurement-delete-control:focus-visible { outline: none; filter: drop-shadow(0 0 2px #668774); }
.room-dimensions text, .measure-label { fill: #77796f; font: 500 10px 'Onest', sans-serif; }
.room-edge-dimensions text { fill: #70746a; font-size: 9px; paint-order: stroke; stroke: #f7f6f2; stroke-width: 5px; stroke-linejoin: round; }
.measure-label { fill: #557760; font-size: 9px; }
.room-caption { fill: #9b9a91; font: 600 9px 'Onest', sans-serif; letter-spacing: 1.2px; }
.room-name-label { fill: #706f66; font: 600 13px 'Onest', sans-serif; paint-order: stroke; stroke: #f5eee4; stroke-width: 4px; stroke-linejoin: round; }
.room-area-label { fill: #96948a; font: 500 11px 'Onest', sans-serif; paint-order: stroke; stroke: #f5eee4; stroke-width: 3px; stroke-linejoin: round; }
.pending-point circle:first-child { fill: #668371; }.pending-point circle:last-child { fill: none; stroke: #668371; stroke-width: 1.5; opacity: .55; }
.canvas-compass { position: absolute; right: 18px; top: 18px; width: 31px; height: 49px; display: grid; justify-items: center; align-content: center; gap: 1px; border: 1px solid #e8e6df; border-radius: 7px; background: #ffffffd9; color: #777970; font-size: 8px; }
.canvas-compass svg { width: 13px; height: 20px; }
.canvas-scale { position: absolute; right: 17px; bottom: 16px; display: flex; align-items: center; gap: 6px; color: #777970; font-size: 9px; }
.scale-line { height: 5px; border: 1px solid #898b81; border-top: 0; }
.canvas-footer { height: 41px; flex: 0 0 41px; display: flex; align-items: center; gap: 8px; color: #92948b; font-size: 9px; }
.keyboard-hint { display: inline-grid; place-items: center; width: 14px; height: 15px; border: 1px solid #deddd6; border-radius: 3px; font-size: 8px; }
.footer-separator { color: #c1c0b8; }
.footer-spacer { flex: 1; }
.canvas-footer button { border: 0; background: transparent; color: #84877e; font-size: 9px; }
.property-label { display: flex; align-items: center; position: relative; color: #777a71; font-size: 9px; margin-bottom: 11px; }
.property-label > span { margin-left: auto; color: #a0a198; }
.property-label input { width: 100%; height: 31px; margin-top: 5px; padding: 0 9px; border: 1px solid #e8e7e0; border-radius: 5px; outline: none; color: #4b4e46; font-size: 10px; }
.rotation-handle { cursor: grab; touch-action: none; }
.rotation-handle:active { cursor: grabbing; }
.property-label:has(input) { flex-wrap: wrap; }
.property-label:has(input[type=number]) { width: 50%; padding-right: 5px; }
.property-row { display: flex; }
.rotate-button { width: 100%; display: flex; gap: 8px; align-items: center; justify-content: center; height: 32px; border: 1px solid #e5e8e1; border-radius: 5px; color: #607662; background: #f7f8f5; font-size: 15px; }
.rotate-button span { font-size: 10px; }
.delete-button { width: 100%; margin-top: 8px; height: 30px; border: 0; background: transparent; color: #aa6e60; font-size: 10px; }
.placement-tip { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 14px; padding: 11px 14px; border: 1px solid #dfe6dd; border-radius: 8px; background: #fff; box-shadow: 0 4px 18px #2b34231b; color: #58715e; font-size: 11px; }
.placement-tip button { border: 0; background: transparent; color: #92948b; font-size: 10px; }
.room-draw-banner { position: absolute; z-index: 2; top: 13px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 11px; max-width: calc(100% - 24px); padding: 9px 11px; border: 1px solid #dfe6dd; border-radius: 8px; background: #ffffffed; box-shadow: 0 3px 14px #2b342314; }
.room-draw-banner > div { display: grid; gap: 2px; min-width: 160px; }
.room-draw-banner strong { color: #526b58; font-size: 10px; }
.room-draw-banner span { color: #85877f; font-size: 9px; white-space: nowrap; }
.room-draw-banner small { color: #a45d51; font-size: 9px; }
.room-draw-banner .corner-count { padding: 0 6px; color: #708070; }
.room-cancel-button, .room-finish-button { min-height: 29px; border: 1px solid #e4e5df; border-radius: 5px; background: #fff; padding: 0 9px; color: #777970; font-size: 9px; white-space: nowrap; }
.room-finish-button { border-color: #668371; background: #668371; color: white; font-weight: 600; }
.room-finish-button:disabled { cursor: not-allowed; opacity: .45; }
.mobile-menu { display: none; }

@media (min-width: 1500px) { .sidebar { width: 300px; flex-basis: 300px; }.canvas-area { padding-left: 44px; padding-right: 44px; }.topbar { padding-left: 42px; padding-right: 42px; }.toolbar-row { padding-left: 43px; padding-right: 43px; } }
@media (max-width: 1050px) { .sidebar { width: 258px; flex-basis: 258px; }.topbar { padding: 0 18px; }.toolbar-row { padding: 0 19px; }.canvas-area { padding-left: 20px; padding-right: 20px; }.inspector { right: 30px; } }
@media (max-width: 760px) {
  .sidebar { position: fixed; inset: 0 auto 0 0; width: min(320px, calc(100vw - 48px)); max-width: 100vw; height: 100vh; height: 100dvh; flex: 0 0 min(320px, calc(100vw - 48px)); box-shadow: 7px 0 25px #2728211c; transition: transform .22s ease, visibility .22s ease; }
  .sidebar.sidebar-collapsed { width: min(320px, calc(100vw - 48px)); flex-basis: min(320px, calc(100vw - 48px)); transform: translateX(-105%); visibility: hidden; }
  .sidebar-backdrop { position: fixed; z-index: 1; inset: 0; display: block; border: 0; background: rgb(30 34 29 / 38%); }
  .sidebar-scroll { overscroll-behavior: contain; padding-bottom: env(safe-area-inset-bottom); }
  .sidebar-brand-row { padding-top: env(safe-area-inset-top); }
  .sidebar-bottom { padding-bottom: env(safe-area-inset-bottom); }
  .topbar { height: 56px; flex-basis: 56px; padding: 0 12px; }.breadcrumbs { gap: 6px; font-size: 10px; }.saved-state { display: none; }.mobile-menu { display: inline-block; padding: 0 5px; font-size: 15px; }.top-actions { gap: 3px; }.top-icon, .action-divider, .share-button { display: none; }
  .toolbar-row { height: 56px; flex-basis: 56px; padding: 0 12px; }.view-switch button { padding: 0 8px; font-size: 9px; }.tool-actions { gap: 1px; }.tool-button { width: 26px; height: 27px; }.tool-button:nth-of-type(4), .tool-button:nth-of-type(5), .tool-actions .toolbar-divider:nth-of-type(2), .zoom-button, .zoom-level { display: none; }.tool-hint { display: none; }
  .canvas-area { min-height: 350px; padding: 3px 10px 0; }.plan-svg { min-height: 350px; }.canvas-footer { padding: 0 4px; gap: 5px; font-size: 8px; }.inspector { top: 122px; right: 20px; width: 220px; }.canvas-compass { right: 9px; top: 9px; }.canvas-scale { right: 10px; bottom: 10px; }
  .scene-controls { max-width: calc(100% - 22px); width: max-content; bottom: 10px; gap: 0; }.scene-controls span { padding: 5px; font-size: 8px; }.scene-top-left { top: 10px; left: 10px; }.scene-compass { top: 10px; right: 10px; }.scene-walls-toggle { top: 58px; right: 10px; }.scene-top-view-toggle { top: 94px; right: 10px; }.scene-first-person-toggle { top: 130px; right: 10px; }.scene-fullscreen { right: 10px; bottom: 86px; }.scene-reset { right: 10px; bottom: 51px; }.scene-selection { left: 10px; bottom: 12px; }
  .room-draw-banner { top: 7px; gap: 5px; padding: 7px; }.room-draw-banner > div { min-width: 0; }.room-draw-banner > div > span { display: none; }.room-draw-banner .corner-count { padding: 0 3px; font-size: 8px; }.room-draw-banner small { max-width: 130px; white-space: normal; }
}

</style>
