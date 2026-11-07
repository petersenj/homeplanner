import { floorMaterialsByType } from '~/catalog'
import type { RoomFloor } from '~/types/planner'

export function defaultRoomFloor(): RoomFloor {
  return { type: null, tint: 'oak', rotation: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRotation(rotation: number) {
  return (rotation % 360 + 360) % 360
}

export function parseRoomFloors(value: unknown, roomCount: number): RoomFloor[] {
  if (value === undefined) return Array.from({ length: roomCount }, defaultRoomFloor)
  if (!Array.isArray(value)) throw new Error('The saved room flooring has an invalid structure.')

  return Array.from({ length: roomCount }, (_, index) => {
    const savedFloor = value[index]
    if (savedFloor === undefined) return defaultRoomFloor()
    if (!isRecord(savedFloor)
      || (savedFloor.type !== null && typeof savedFloor.type !== 'string')
      || typeof savedFloor.tint !== 'string'
      || typeof savedFloor.rotation !== 'number'
      || !Number.isFinite(savedFloor.rotation)) {
      throw new Error(`The saved flooring for room ${index + 1} is invalid.`)
    }
    if (savedFloor.type === null) return { ...defaultRoomFloor(), rotation: normalizeRotation(savedFloor.rotation) }

    const material = floorMaterialsByType.get(savedFloor.type)
    if (!material || !material.tints.some((tint) => tint.id === savedFloor.tint)) {
      throw new Error(`The saved flooring for room ${index + 1} is not supported.`)
    }
    return {
      type: material.type,
      tint: savedFloor.tint,
      rotation: normalizeRotation(savedFloor.rotation),
    }
  })
}
