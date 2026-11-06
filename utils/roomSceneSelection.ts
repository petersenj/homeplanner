import * as THREE from 'three'

export type RoomSceneSelection =
  | { type: 'wall'; id: string }
  | { type: 'item'; id: number }
  | null

export function pickRoomSceneSelection(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  raycaster: THREE.Raycaster,
  pickableObjects: THREE.Object3D[],
  clientX: number,
  clientY: number,
): RoomSceneSelection {
  const bounds = canvas.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) return null

  const pointer = new THREE.Vector2(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const selectableObjects = pickableObjects.filter((object) =>
    object.userData.wallId === undefined || object.visible)
  const intersections = raycaster.intersectObjects(selectableObjects, true)
  const taggedAncestor = (object: THREE.Object3D, key: 'wallId' | 'itemId') => {
    let current: THREE.Object3D | null = object
    while (current) {
      if (current.userData[key] !== undefined) return current
      current = current.parent
    }
    return null
  }
  const hit = intersections.find((intersection) =>
    taggedAncestor(intersection.object, 'wallId') || taggedAncestor(intersection.object, 'itemId'))
  const wall = hit && taggedAncestor(hit.object, 'wallId')
  if (wall && typeof wall.userData.wallId === 'string') {
    return { type: 'wall', id: wall.userData.wallId }
  }
  const item = hit && taggedAncestor(hit.object, 'itemId')
  if (item && typeof item.userData.itemId === 'number') {
    return { type: 'item', id: item.userData.itemId }
  }
  return null
}
