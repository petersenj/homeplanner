import * as THREE from 'three'
import type { CatalogItemDefinition } from '../types'

export const definition = {
  section: 'wall-details',
  wallDetailCategory: 'Windows',
  label: { en: 'Window', de: 'Fenster' },
  detail: '110 × 12 cm',
  dimensions: [110, 12, 130],
  color: '#77b9c1',
  wallMounted: true,
  defaultFloorOffset: 100,
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M7 10h28v22H7zM7 16h28M21 10v22M11 13h6m8 0h6' } },
  ],
  planShapes: (item) => [
    { tag: 'rect', attributes: { x: -item.width / 2, y: -6, width: item.width, height: 12, rx: 2, fill: '#77b9c1', stroke: '#3f8e98', 'stroke-width': 2 } },
    { tag: 'path', attributes: { d: `M${-item.width / 2 + 4} 0h${item.width - 8}`, stroke: '#e9fbfb', 'stroke-width': 2 } },
  ],
  createScene: (item, group, { box }) => {
    const { width, height } = item
    const glass = box(group, [width, height, 0.045], [0, height / 2, 0], '#75b8c1', {
      transparent: true,
      opacity: 0.7,
      roughness: 0.2,
      castShadow: false,
    })
    const glassMaterials = Array.isArray(glass.material) ? glass.material : [glass.material]
    for (const glassMaterial of glassMaterials) glassMaterial.side = THREE.DoubleSide
  },
} satisfies CatalogItemDefinition
