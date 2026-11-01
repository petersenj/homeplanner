import * as THREE from 'three'
import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'wall-details',
  wallDetailCategory: 'Doors',
  label: { en: 'Door', de: 'Tür' },
  detail: '90 × 15 cm',
  dimensions: [90, 15, 205],
  color: '#c98d65',
  wallMounted: true,
  mountingEdge: 'second',
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M9 35V7h24v28M9 35h24M14 35V12h14v23m-5-12h1' } },
  ],
  openable: true,
  planShapes: (item) => item.open
    ? [
        { tag: 'rect', attributes: { x: -item.width / 2, y: -7, width: item.width, height: 14, fill: '#fff', stroke: '#986746', 'stroke-width': 1.5 } },
        { tag: 'path', attributes: { d: `M${-item.width / 2} 0v${item.width}M${-item.width / 2} ${item.width}A${item.width} ${item.width} 0 0 0 ${item.width / 2} 0`, fill: 'none', stroke: '#986746', 'stroke-width': 1.5 } },
      ]
    : [
        { tag: 'rect', attributes: { x: -item.width / 2, y: -7, width: item.width, height: 14, rx: 2, fill: '#c98d65', stroke: '#986746', 'stroke-width': 1.5 } },
        { tag: 'circle', attributes: { cx: item.width / 2 - 10, cy: 0, r: 2, fill: '#f3dfbb' } },
      ],
  createScene: (item, group, { box }) => {
    const { width, depth, height, color } = item
    if (item.open) {
      const leaf = new THREE.Group()
      leaf.position.x = -width / 2
      leaf.rotation.y = -Math.PI / 2
      group.add(leaf)
      box(leaf, [width, height, Math.max(depth, 0.055)], [width / 2, height / 2, 0], color)
      box(leaf, [0.022, 0.08, 0.025], [width * 0.35, height * 0.48, depth / 2 + 0.02], '#ead8b7')
      return
    }
    box(group, [width, height, Math.max(depth, 0.055)], [0, height / 2, 0], color)
    box(group, [0.022, 0.08, 0.025], [width * 0.35, height * 0.48, depth / 2 + 0.02], '#ead8b7')
  },
} satisfies CatalogItemDefinition
