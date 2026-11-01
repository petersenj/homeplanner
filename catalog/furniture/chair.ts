import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'catalog',
  label: 'Chair',
  detail: '48 × 48 cm',
  dimensions: [48, 48, 88],
  color: '#c98d65',
  planFilter: 'url(#soft-shadow)',
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M13 11h16v13H13zM11 24h20v4H11zM14 28l-2 8m16-8 2 8M13 18H9v7m20-7h4v7' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -22, y: -20, width: 44, height: 37, rx: 11, fill: item.color || '#d8b69a', stroke: '#a78366', 'stroke-width': 1.5 } },
    { tag: 'rect', attributes: { x: -18, y: -18, width: 36, height: 9, rx: 5, fill: '#e6cbb5' } },
    { tag: 'path', attributes: { d: 'M-17 12v10m34-10v10', stroke: '#9a7457', 'stroke-width': 3, 'stroke-linecap': 'round' } },
  ],
  rearSide: () => 'top',
  createScene: (item, group, { box }) => {
    const { width, depth, height, color } = item
    const seatHeight = Math.min(0.48, height * 0.55)
    box(group, [width, 0.1, depth], [0, seatHeight, 0], color)
    box(group, [width * 0.92, 0.045, depth * 0.82], [0, seatHeight + 0.057, 0], '#dfbd9f')
    box(group, [width * 0.88, height - seatHeight, 0.075], [0, (height + seatHeight) / 2, -depth * 0.42], color)
    for (const px of [-1, 1]) {
      for (const pz of [-1, 1]) {
        box(group, [0.035, seatHeight, 0.035], [px * (width / 2 - 0.055), seatHeight / 2, pz * (depth / 2 - 0.055)], '#927153')
      }
    }
  },
} satisfies CatalogItemDefinition
