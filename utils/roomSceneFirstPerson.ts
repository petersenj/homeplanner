import * as THREE from 'three'
import type { EgoCamera } from '~/types/planner'

const MOVE_SPEED = 2.5
const LOOK_SENSITIVITY = 0.002
export const EYE_HEIGHT = 1.65
const ROOM_EDGE_MARGIN = 0.2
const MAX_PITCH = Math.PI / 2 - 0.05

export class RoomSceneFirstPersonController {
  private yaw = 0
  private pitch = 0
  private readonly pressedKeys = new Set<string>()

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  prepareEntry(egoCamera: EgoCamera, roomX: number, roomY: number, roomWidth: number, roomDepth: number) {
    this.yaw = -THREE.MathUtils.degToRad(egoCamera.rotation)
    this.pitch = 0
    this.pressedKeys.clear()
    return {
      position: new THREE.Vector3(
        (egoCamera.x - roomX) / 100 - roomWidth / 2,
        EYE_HEIGHT,
        (egoCamera.y - roomY) / 100 - roomDepth / 2,
      ),
      quaternion: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'),
      ),
    }
  }

  getPlanPose(roomX: number, roomY: number, roomWidth: number, roomDepth: number): EgoCamera {
    return {
      x: roomX + (this.camera.position.x + roomWidth / 2) * 100,
      y: roomY + (this.camera.position.z + roomDepth / 2) * 100,
      rotation: THREE.MathUtils.euclideanModulo(
        THREE.MathUtils.radToDeg(-this.yaw),
        360,
      ),
    }
  }

  activate() {
    this.camera.up.set(0, 1, 0)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  look(movementX: number, movementY: number) {
    this.yaw -= movementX * LOOK_SENSITIVITY
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - movementY * LOOK_SENSITIVITY,
      -MAX_PITCH,
      MAX_PITCH,
    )
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  setKey(key: string, pressed: boolean) {
    if (pressed) this.pressedKeys.add(key)
    else this.pressedKeys.delete(key)
  }

  clearKeys() {
    this.pressedKeys.clear()
  }

  update(deltaSeconds: number, roomWidth: number, roomDepth: number) {
    let strafe = Number(this.pressedKeys.has('ArrowRight')) - Number(this.pressedKeys.has('ArrowLeft'))
    let forward = Number(this.pressedKeys.has('ArrowUp')) - Number(this.pressedKeys.has('ArrowDown'))
    const length = Math.hypot(strafe, forward)
    if (!length || deltaSeconds <= 0) return false

    strafe /= length
    forward /= length
    const cosine = Math.cos(this.yaw)
    const sine = Math.sin(this.yaw)
    this.camera.position.x += (cosine * strafe - sine * forward) * MOVE_SPEED * deltaSeconds
    this.camera.position.z += (-sine * strafe - cosine * forward) * MOVE_SPEED * deltaSeconds

    const maxX = Math.max(roomWidth / 2 - ROOM_EDGE_MARGIN, 0)
    const maxZ = Math.max(roomDepth / 2 - ROOM_EDGE_MARGIN, 0)
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -maxX, maxX)
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -maxZ, maxZ)
    return true
  }
}
