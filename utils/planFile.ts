import { catalogItemsByKind } from '~/catalog'
import type { CatalogItem } from '~/catalog/types'
import type { EgoCamera, Measurement, Point, RoomFloor } from '~/types/planner'
import { defaultEgoCamera } from '~/utils/egoCameraPlan'
import { parseRoomFloors } from '~/utils/roomFloor'

export type ImportedPlan = {
  items: CatalogItem[]
  roomWallDimensions: Record<string, { depth: number; height: number }>
  measurements: Measurement[]
  rooms: Point[][]
  roomNames: string[]
  roomFloors: RoomFloor[]
  egoCamera: EgoCamera
}

export type PlanFileExport = {
  name: string
  units: string
  room: { width: number; depth: number; points: Point[]; area: number }
  rooms: Point[][]
  roomNames: string[]
  roomFloors: RoomFloor[]
  items: CatalogItem[]
  roomWallDimensions: Record<string, { depth: number; height: number }>
  measurements: Measurement[]
  egoCamera: EgoCamera
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPoint(value: unknown): value is Point {
  return isRecord(value)
    && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y)
}

function invalidPlan(): never {
  throw new Error('The selected file is not a valid Floorwise plan.')
}

function normalizeRotation(rotation: number) {
  return (rotation % 360 + 360) % 360
}

export function parsePlanFile(value: unknown, isValidRoomLayout: (rooms: Point[][]) => boolean): ImportedPlan {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.measurements)) invalidPlan()

  let rawRooms: unknown
  if (Array.isArray(value.rooms)) {
    rawRooms = value.rooms
  } else if (Array.isArray(value.roomPoints)) {
    rawRooms = value.roomPoints.length ? [value.roomPoints] : []
  } else if (isRecord(value.room) && Array.isArray(value.room.points)) {
    rawRooms = value.room.points.length ? [value.room.points] : []
  } else {
    rawRooms = []
  }
  if (!Array.isArray(rawRooms)) invalidPlan()

  const rooms: Point[][] = []
  for (const rawRoom of rawRooms) {
    if (!Array.isArray(rawRoom)) invalidPlan()
    const room: Point[] = []
    for (const point of rawRoom) {
      if (!isPoint(point)) invalidPlan()
      room.push(point)
    }
    if (room.length > 0 && room.length < 3) invalidPlan()
    rooms.push(room)
  }
  if (!isValidRoomLayout(rooms)) invalidPlan()

  const ids = new Set<number>()
  const items = value.items.map((rawItem): CatalogItem => {
    if (!isRecord(rawItem)) invalidPlan()
    const { id, kind, x, y, width, depth, height, rotation, floorOffset, name, color, open } = rawItem
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1
      || typeof kind !== 'string'
      || typeof x !== 'number' || !Number.isFinite(x)
      || typeof y !== 'number' || !Number.isFinite(y)
      || typeof width !== 'number' || !Number.isFinite(width) || width < 1
      || typeof depth !== 'number' || !Number.isFinite(depth) || depth < 1
      || typeof height !== 'number' || !Number.isFinite(height) || height < 1
      || typeof rotation !== 'number' || !Number.isFinite(rotation)
      || (floorOffset !== undefined && (typeof floorOffset !== 'number' || !Number.isFinite(floorOffset)))
      || (name !== undefined && typeof name !== 'string')
      || (color !== undefined && typeof color !== 'string')
      || (open !== undefined && typeof open !== 'boolean')
      || ids.has(id)) invalidPlan()
    ids.add(id)

    const definition = catalogItemsByKind.get(kind)
    if (!definition) invalidPlan()
    const item: CatalogItem = {
      id,
      kind,
      section: definition.section,
      wallDetailCategory: definition.wallDetailCategory,
      x,
      y,
      width,
      depth,
      height,
      floorOffset: floorOffset ?? definition.defaultFloorOffset ?? 0,
      rotation: normalizeRotation(rotation),
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof color === 'string' ? { color } : {}),
      ...(typeof open === 'boolean' ? { open } : {}),
    }
    return definition.normalizeSavedItem?.(item) ?? item
  })

  const measurements = value.measurements.map((measurement): Measurement => {
    if (!isRecord(measurement)
      || typeof measurement.id !== 'number' || !Number.isInteger(measurement.id) || measurement.id < 1
      || !isPoint(measurement.start) || !isPoint(measurement.end)) invalidPlan()
    const { id, start, end } = measurement
    if (ids.has(id)) invalidPlan()
    ids.add(id)
    return { id, start, end }
  })

  const roomWallDimensions: ImportedPlan['roomWallDimensions'] = {}
  if (value.roomWallDimensions !== undefined) {
    if (!isRecord(value.roomWallDimensions)) invalidPlan()
    for (const [id, dimensions] of Object.entries(value.roomWallDimensions)) {
      if (!isRecord(dimensions)
        || typeof dimensions.depth !== 'number' || !Number.isFinite(dimensions.depth) || dimensions.depth < 1
        || typeof dimensions.height !== 'number' || !Number.isFinite(dimensions.height) || dimensions.height < 1) invalidPlan()
      roomWallDimensions[id] = { depth: dimensions.depth, height: dimensions.height }
    }
  }

  if (value.roomNames !== undefined
    && (!Array.isArray(value.roomNames) || !value.roomNames.every((name) => typeof name === 'string'))) invalidPlan()
  const importedRoomNames = Array.isArray(value.roomNames) ? value.roomNames : []
  const roomNames = rooms.map((_, index) =>
    typeof importedRoomNames[index] === 'string' && importedRoomNames[index].trim()
      ? importedRoomNames[index]
      : `Room ${index + 1}`)
  const roomFloors = parseRoomFloors(value.roomFloors, rooms.length)

  let egoCamera = defaultEgoCamera(rooms)
  if (value.egoCamera !== undefined) {
    if (!isRecord(value.egoCamera)
      || typeof value.egoCamera.x !== 'number' || !Number.isFinite(value.egoCamera.x)
      || typeof value.egoCamera.y !== 'number' || !Number.isFinite(value.egoCamera.y)
      || typeof value.egoCamera.rotation !== 'number' || !Number.isFinite(value.egoCamera.rotation)) invalidPlan()
    egoCamera = {
      x: value.egoCamera.x,
      y: value.egoCamera.y,
      rotation: normalizeRotation(value.egoCamera.rotation),
    }
  }

  return { items, roomWallDimensions, measurements, rooms, roomNames, roomFloors, egoCamera }
}

export function downloadPlanFile(plan: PlanFileExport, planName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  const safeName = planName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/g, '').trim()
  link.download = `${safeName || 'my-apartment'}-floorwise-plan.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
