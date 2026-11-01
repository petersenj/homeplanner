import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'catalog',
  label: { en: 'Table', de: 'Tisch' },
  detail: '120 × 60 cm',
  dimensions: [120, 60, 75],
  color: '#b28a63',
  planFilter: 'url(#soft-shadow)',
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M8 15h26v4H8zm4 4v14m18-14v14M7 33h28' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -item.width / 2, y: -item.depth / 2, width: item.width, height: item.depth, rx: 9, fill: '#bd9a72', stroke: '#94734f', 'stroke-width': 2 } },
    { tag: 'rect', attributes: { x: -item.width / 2 + 7, y: -item.depth / 2 + 7, width: item.width - 14, height: item.depth - 14, rx: 5, fill: '#c9aa86' } },
    { tag: 'path', attributes: { d: `M${-item.width / 2 + 15} ${item.depth / 2 - 6}v13m${item.width - 30} -13v13`, stroke: '#94734f', 'stroke-width': 5, 'stroke-linecap': 'round' } },
  ],
  rearSide: (width, depth) => width >= depth ? 'top' : 'left',
  createScene: (item, group, { box, addLegs }) => {
    const { width, depth, height, color } = item
    const topThickness = Math.max(0.055, Math.min(0.1, height * 0.12))
    addLegs(group, width, depth, Math.max(0.12, height - topThickness), color, 0.12)
    box(group, [width, topThickness, depth], [0, height - topThickness / 2, 0], color)
  },
} satisfies CatalogItemDefinition
