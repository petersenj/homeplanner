import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'catalog',
  label: { en: 'Carpet', de: 'Teppich' },
  detail: '160 × 230 cm',
  dimensions: [160, 230, 1],
  color: '#a86f5b',
  catalogIcon: [
    { tag: 'rect', attributes: { x: 7, y: 6, width: 28, height: 30, rx: 3 } },
    { tag: 'rect', attributes: { x: 11, y: 10, width: 20, height: 22, rx: 2 } },
    { tag: 'path', attributes: { d: 'm15 15 6-3 6 3v12l-6 3-6-3V15Zm0 0 6 3 6-3m-6 3v12' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -item.width / 2, y: -item.depth / 2, width: item.width, height: item.depth, rx: 8, fill: item.color || '#a86f5b', stroke: '#805747', 'stroke-width': 2 } },
    { tag: 'rect', attributes: { x: -item.width / 2 + 8, y: -item.depth / 2 + 8, width: item.width - 16, height: item.depth - 16, rx: 5, fill: 'none', stroke: '#e5c7a6', 'stroke-width': 2 } },
    { tag: 'path', attributes: { d: `M${-item.width / 2 + 22} ${-item.depth / 2 + 22}l${item.width / 2 - 22} ${item.depth / 2 - 22} ${item.width / 2 - 22} ${-item.depth / 2 + 22} ${-item.width / 2 + 22} ${item.depth / 2 - 22}Z`, fill: 'none', stroke: '#e5c7a6', 'stroke-width': 2 } },
  ],
  createScene: (item, group, { box }) => {
    const { width, depth, height, color } = item
    const border = Math.min(0.06, width / 8, depth / 8)
    const detailHeight = Math.min(height / 2, 0.006)
    box(group, [width, height, depth], [0, height / 2, 0], color, {
      roughness: 1,
      castShadow: false,
    })
    box(group, [width - border * 2, detailHeight, border / 2], [0, height + detailHeight / 2, -depth / 2 + border / 2], '#e5c7a6', {
      castShadow: false,
    })
    box(group, [width - border * 2, detailHeight, border / 2], [0, height + detailHeight / 2, depth / 2 - border / 2], '#e5c7a6', {
      castShadow: false,
    })
    box(group, [border / 2, detailHeight, depth - border * 2], [-width / 2 + border / 2, height + detailHeight / 2, 0], '#e5c7a6', {
      castShadow: false,
    })
    box(group, [border / 2, detailHeight, depth - border * 2], [width / 2 - border / 2, height + detailHeight / 2, 0], '#e5c7a6', {
      castShadow: false,
    })
    box(group, [width * 0.12, detailHeight, depth * 0.12], [0, height + detailHeight / 2, 0], '#d7aa82', {
      castShadow: false,
    })
  },
} satisfies CatalogItemDefinition
