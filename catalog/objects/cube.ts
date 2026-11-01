import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'catalog',
  label: { en: 'Cube', de: 'Würfel' },
  detail: '100 × 100 cm',
  dimensions: [100, 100, 100],
  color: '#8097a8',
  planFilter: 'url(#soft-shadow)',
  catalogIcon: [
    { tag: 'path', attributes: { d: 'm8 13 13-7 13 7v16l-13 7-13-7V13Zm0 0 13 7 13-7m-13 7v16m-6-26 13 7' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -item.width / 2, y: -item.depth / 2, width: item.width, height: item.depth, rx: 7, fill: item.color || '#94a9b8', stroke: '#6c8494', 'stroke-width': 2 } },
  ],
  rearSide: () => 'top',
  createScene: (item, group, { box }) => {
    const { width, depth, height, color } = item
    box(group, [width, height, depth], [0, height / 2, 0], color)
  },
} satisfies CatalogItemDefinition
