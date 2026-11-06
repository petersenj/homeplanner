import * as THREE from 'three'

export function createEgoCameraModel() {
  const group = new THREE.Group()
  group.userData.isEgoCamera = true

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#668774', roughness: 0.5 })
  const lensMaterial = new THREE.MeshStandardMaterial({ color: '#34433a', metalness: 0.25, roughness: 0.35 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.16), bodyMaterial)
  body.position.y = EYE_HEIGHT
  body.castShadow = true
  group.add(body)

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 16), lensMaterial)
  lens.rotation.x = -Math.PI / 2
  lens.position.set(0, EYE_HEIGHT, -0.125)
  group.add(lens)

  const direction = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.13, 12),
    new THREE.MeshStandardMaterial({ color: '#eef4e9', roughness: 0.6 }),
  )
  direction.rotation.x = -Math.PI / 2
  direction.position.set(0, EYE_HEIGHT, -0.23)
  group.add(direction)

  return group
}

export function setEgoCameraModelSelected(group: THREE.Group, selected: boolean) {
  const body = group.children[1]
  if (body instanceof THREE.Mesh && body.material instanceof THREE.MeshStandardMaterial) {
    body.material.color.set(selected ? '#476d55' : '#668774')
  }
}
