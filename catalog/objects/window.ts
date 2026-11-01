import * as THREE from 'three'
import type { CatalogItemDefinition, SvgShape } from '../types'

export const definition = {
  section: 'wall-details',
  wallDetailCategory: 'Windows',
  label: { en: 'Window (double leaf)', de: 'Fenster (Zweiflügelig)' },
  detail: '110 × 12 cm',
  dimensions: [110, 12, 130],
  color: '#77b9c1',
  wallMounted: true,
  openable: true,
  defaultFloorOffset: 100,
  catalogIcon: [
    { tag: 'path', attributes: { d: 'M7 10h28v22H7zM7 16h28M21 10v22M11 13h6m8 0h6' } },
  ],
  planShapes: (item) => {
    const halfWidth = item.width / 2
    const shapes: SvgShape[] = item.open
      ? [
          { tag: 'rect', attributes: { x: -halfWidth, y: 0, width: 12, height: halfWidth, rx: 2, fill: '#77b9c1', stroke: '#3f8e98', 'stroke-width': 2 } },
          { tag: 'path', attributes: { d: `M${-halfWidth + 6} 4v${halfWidth - 8}`, stroke: '#e9fbfb', 'stroke-width': 2 } },
          { tag: 'rect', attributes: { x: halfWidth - 12, y: 0, width: 12, height: halfWidth, rx: 2, fill: '#77b9c1', stroke: '#3f8e98', 'stroke-width': 2 } },
          { tag: 'path', attributes: { d: `M${halfWidth - 6} 4v${halfWidth - 8}`, stroke: '#e9fbfb', 'stroke-width': 2 } },
        ]
      : [
          { tag: 'rect', attributes: { x: -halfWidth, y: -6, width: item.width, height: 12, rx: 2, fill: '#77b9c1', stroke: '#3f8e98', 'stroke-width': 2 } },
          { tag: 'path', attributes: { d: `M${-halfWidth + 4} 0h${halfWidth - 4}M4 0h${halfWidth - 4}M0 -6v12`, stroke: '#e9fbfb', 'stroke-width': 2 } },
        ]
    shapes.push(
      { tag: 'path', attributes: { d: `M${-halfWidth} 0v${halfWidth}M${-halfWidth} ${halfWidth}A${halfWidth} ${halfWidth} 0 0 0 0 0`, fill: 'none', stroke: '#3f8e98', 'stroke-width': 1.5 } },
      { tag: 'path', attributes: { d: `M${halfWidth} 0v${halfWidth}M${halfWidth} ${halfWidth}A${halfWidth} ${halfWidth} 0 0 1 0 0`, fill: 'none', stroke: '#3f8e98', 'stroke-width': 1.5 } },
    )
    return shapes
  },
  createScene: (item, group, { box }) => {
    const { width, height } = item
    const halfWidth = width / 2
    for (const side of ['left', 'right'] as const) {
      const pivot = new THREE.Group()
      pivot.position.x = side === 'left' ? -halfWidth : halfWidth
      if (item.open) {
        pivot.rotation.y = side === 'left' ? -Math.PI / 2 : Math.PI / 2
      }
      group.add(pivot)
      const panelWidth = halfWidth
      const panelCenter = side === 'left' ? panelWidth / 2 : -panelWidth / 2
      const glass = box(pivot, [panelWidth, height, 0.045], [panelCenter, height / 2, 0], '#75b8c1', {
        transparent: true,
        opacity: 0.7,
        roughness: 0.2,
        castShadow: false,
      })
      const glassMaterials = Array.isArray(glass.material) ? glass.material : [glass.material]
      for (const glassMaterial of glassMaterials) glassMaterial.side = THREE.DoubleSide
    }
    box(group, [0.025, height, 0.065], [0, height / 2, 0], '#3f8e98')
  },
} satisfies CatalogItemDefinition
