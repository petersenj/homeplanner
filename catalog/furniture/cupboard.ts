import * as THREE from 'three'
import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'catalog',
  label: 'Cupboard',
  detail: '100 × 60 cm',
  dimensions: [100, 60, 190],
  color: '#818d77',
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M11 7h20v29H11zm10 0v29m-7-17h2m8 0h2M8 36h26' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -item.width / 2, y: -item.depth / 2, width: item.width, height: item.depth, rx: 5, fill: item.color || '#99a08e', stroke: '#777c6c', 'stroke-width': 1.5 } },
    { tag: 'line', attributes: { x1: 0, x2: 0, y1: -10, y2: 10, stroke: '#e0e0d4', 'stroke-width': 2 } },
    { tag: 'circle', attributes: { cx: 4, cy: 0, r: 1.5, fill: '#777c6c' } },
  ],
  rearSide: (width, depth) => width >= depth ? 'top' : 'left',
  createScene: (item, group, { box }) => {
    const { width, depth, height, color } = item
    box(group, [width, height, depth], [0, height / 2, 0], color)
    box(group, [width * 0.88, height * 0.9, 0.025], [0, height / 2, depth / 2 + 0.014], '#d9d1c3')
    box(group, [0.014, height * 0.88, 0.035], [0, height / 2, depth / 2 + 0.03], '#898d7e')
    for (const px of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: '#e9e0ce', roughness: 0.82 }))
      knob.position.set(px * 0.045, height / 2, depth / 2 + 0.052)
      group.add(knob)
    }
  },
} satisfies CatalogItemDefinition
