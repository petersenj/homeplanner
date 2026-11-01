import * as THREE from 'three'
import type { CatalogItemDefinition, SvgShape } from '../types'

export const definition = {
  section: 'wall-details',
  wallDetailCategory: 'Windows',
  label: { en: 'Window (single leaf)', de: 'Fenster (Einflügelig)' },
  detail: '110 × 12 cm',
  dimensions: [110, 12, 130],
  color: '#77b9c1',
  wallMounted: true,
  openable: true,
  defaultFloorOffset: 100,
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M7 10h28v22H7zM7 16h28M11 13h6m8 0h6' } },
  ],
  planShapes: (item) => {
    const halfWidth = item.width / 2
    const shapes: SvgShape[] = item.open
      ? [
          { tag: 'rect', attributes: { x: -halfWidth, y: 0, width: 12, height: item.width, rx: 2, fill: '#77b9c1', stroke: '#3f8e98', 'stroke-width': 2 } },
          { tag: 'path', attributes: { d: `M${-halfWidth + 6} 4v${item.width - 8}`, stroke: '#e9fbfb', 'stroke-width': 2 } },
        ]
      : [
          { tag: 'rect', attributes: { x: -halfWidth, y: -6, width: item.width, height: 12, rx: 2, fill: '#77b9c1', stroke: '#3f8e98', 'stroke-width': 2 } },
          { tag: 'path', attributes: { d: `M${-halfWidth + 4} 0h${item.width - 8}`, stroke: '#e9fbfb', 'stroke-width': 2 } },
        ]
    shapes.push({
      tag: 'path',
      attributes: { d: `M${-halfWidth} 0v${item.width}M${-halfWidth} ${item.width}A${item.width} ${item.width} 0 0 0 ${halfWidth} 0`, fill: 'none', stroke: '#3f8e98', 'stroke-width': 1.5 },
    })
    return shapes
  },
  createScene: (item, group, { box }) => {
    const { width, height } = item
    const leaf = new THREE.Group()
    leaf.position.x = -width / 2
    if (item.open) leaf.rotation.y = -Math.PI / 2
    group.add(leaf)
    const glass = box(leaf, [width, height, 0.045], [width / 2, height / 2, 0], '#75b8c1', {
      transparent: true,
      opacity: 0.7,
      roughness: 0.2,
      castShadow: false,
    })
    const glassMaterials = Array.isArray(glass.material) ? glass.material : [glass.material]
    for (const glassMaterial of glassMaterials) glassMaterial.side = THREE.DoubleSide
  },
} satisfies CatalogItemDefinition
