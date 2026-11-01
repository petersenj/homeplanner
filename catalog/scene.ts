import * as THREE from 'three'
import type { SceneBoxOptions } from './types'

function material(
  color: THREE.ColorRepresentation,
  roughness = 0.82,
  options: THREE.MeshStandardMaterialParameters = {},
) {
  const parameters: THREE.MeshStandardMaterialParameters = { color, roughness, ...options }
  for (const key of ['transparent', 'opacity', 'metalness'] as const) {
    if (parameters[key] === undefined) delete parameters[key]
  }
  return new THREE.MeshStandardMaterial(parameters)
}

export function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: THREE.ColorRepresentation,
  options: SceneBoxOptions = {},
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    material(color, options.roughness ?? 0.82, {
      transparent: options.transparent,
      opacity: options.opacity,
      metalness: options.metalness,
    }),
  )
  mesh.position.set(...position)
  mesh.castShadow = options.castShadow ?? true
  mesh.receiveShadow = options.receiveShadow ?? true
  parent.add(mesh)
  return mesh
}

export function addLegs(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  color: string,
  inset = 0.1,
) {
  const legColor = new THREE.Color(color).multiplyScalar(0.78)
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      box(
        group,
        [0.045, height, 0.045],
        [x * (width / 2 - inset), height / 2, z * (depth / 2 - inset)],
        legColor,
      )
    }
  }
}
