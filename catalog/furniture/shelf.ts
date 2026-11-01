import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'catalog',
  label: { en: 'Shelf', de: 'Regal' },
  detail: '100 × 40 cm',
  dimensions: [100, 40, 175],
  color: '#a88c72',
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M11 7h20v29H11zm-3 9h26m-26 9h26m-26 9h26M14 11h3m8 0h3m-14 9h3m8 0h3m-14 9h3m8 0h3' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -item.width / 2, y: -item.depth / 2, width: item.width, height: item.depth, rx: 3, fill: '#f5f0e7', 'fill-opacity': 0.72, stroke: '#8d7964', 'stroke-width': 1.5 } },
    ...[-1, 1].map((side) => ({
      tag: 'line' as const,
      attributes: { x1: -item.width / 2 + 4, y1: side * item.depth / 4, x2: item.width / 2 - 4, y2: side * item.depth / 4, stroke: '#a88c72', 'stroke-width': 2 },
    })),
    ...[-1, 1].flatMap((xSide) => [-1, 1].map((ySide) => ({
      tag: 'circle' as const,
      attributes: { cx: xSide * (item.width / 2 - 3), cy: ySide * (item.depth / 2 - 3), r: 2, fill: '#8d7964' },
    }))),
  ],
  rearSide: (width, depth) => width >= depth ? 'top' : 'left',
  createScene: (item, group, { box }) => {
    const { width, depth, height, color } = item
    const shelfCount = 4
    const supportWidth = Math.min(0.045, width * 0.12, depth * 0.12)
    for (const px of [-1, 1]) {
      for (const pz of [-1, 1]) {
        box(
          group,
          [supportWidth, height, supportWidth],
          [px * (width / 2 - supportWidth / 2), height / 2, pz * (depth / 2 - supportWidth / 2)],
          color,
        )
      }
    }
    for (let index = 0; index < shelfCount; index++) {
      const shelfY = index * (height - 0.035) / (shelfCount - 1) + 0.0175
      box(
        group,
        [Math.max(0.02, width - supportWidth * 2), 0.035, Math.max(0.02, depth - supportWidth * 2)],
        [0, shelfY, 0],
        '#dbc9b1',
      )
    }
  },
  normalizeSavedItem: (item) => item.width === 42 && item.depth === 150 && item.height === 175
    ? { ...item, width: 150, depth: 42 }
    : item,
} satisfies CatalogItemDefinition
