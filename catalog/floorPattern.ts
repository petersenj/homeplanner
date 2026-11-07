import type { FloorMaterialDefinition } from './types'

export type FloorPatternSettings = {
  tileWidth: number
  tileHeight: number
  offsetPercent: number
}

export type FloorPatternGeometry = {
  width: number
  height: number
  lines: Array<[x1: number, y1: number, x2: number, y2: number]>
}

export function getFloorPatternGeometry(
  definition: FloorMaterialDefinition,
  settings: FloorPatternSettings = {
    tileWidth: definition.tileSize[0],
    tileHeight: definition.tileSize[1],
    offsetPercent: definition.offsetPercent,
  },
): FloorPatternGeometry {
  const rowCount = settings.offsetPercent === 0 ? 1 : 2
  const width = settings.tileWidth * rowCount
  const height = settings.tileHeight * rowCount
  const lines: FloorPatternGeometry['lines'] = []

  for (let row = 0; row <= rowCount; row++) {
    const y = row * settings.tileHeight
    lines.push([0, y, width, y])
  }

  for (let row = 0; row < rowCount; row++) {
    const shift = row === 0 ? settings.tileWidth * settings.offsetPercent / 100 : 0
    for (let column = -2; column <= width / settings.tileWidth + 2; column++) {
      const x = column * settings.tileWidth + shift
      if (x >= 0 && x <= width) lines.push([x, row * settings.tileHeight, x, (row + 1) * settings.tileHeight])
    }
  }

  return { width, height, lines }
}
