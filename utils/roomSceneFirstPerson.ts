import * as THREE from 'three'
import type { EgoCamera } from '~/types/planner'

const MOVE_SPEED = 2.5
const LOOK_SENSITIVITY = 0.002
export const EYE_HEIGHT = 1.65
const MAX_PITCH = Math.PI / 2 - 0.05

type RoomBoundary = THREE.Vector2[]
type Doorway = { start: THREE.Vector2; end: THREE.Vector2 }

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

  update(deltaSeconds: number, rooms: RoomBoundary[], doorways: Doorway[]) {
    let strafe = Number(this.pressedKeys.has('ArrowRight')) - Number(this.pressedKeys.has('ArrowLeft'))
    let forward = Number(this.pressedKeys.has('ArrowUp')) - Number(this.pressedKeys.has('ArrowDown'))
    const length = Math.hypot(strafe, forward)
    if (!length || deltaSeconds <= 0) return false

    strafe /= length
    forward /= length
    const cosine = Math.cos(this.yaw)
    const sine = Math.sin(this.yaw)
    const start = new THREE.Vector2(this.camera.position.x, this.camera.position.z)
    const dx = (cosine * strafe - sine * forward) * MOVE_SPEED * deltaSeconds
    const dz = (-sine * strafe - cosine * forward) * MOVE_SPEED * deltaSeconds
    const destination = start.clone().add(new THREE.Vector2(dx, dz))

    if (this.canCrossRoomBoundaries(start, destination, rooms, doorways)) {
      this.camera.position.x = destination.x
      this.camera.position.z = destination.y
    } else {
      const horizontal = start.clone().add(new THREE.Vector2(dx, 0))
      const vertical = start.clone().add(new THREE.Vector2(0, dz))
      const horizontalAllowed = this.canCrossRoomBoundaries(start, horizontal, rooms, doorways)
      const verticalAllowed = this.canCrossRoomBoundaries(start, vertical, rooms, doorways)
      if (horizontalAllowed && (!verticalAllowed || Math.abs(dx) >= Math.abs(dz))) {
        this.camera.position.x = horizontal.x
      } else if (verticalAllowed) {
        this.camera.position.z = vertical.y
      }
    }
    return true
  }

  private canCrossRoomBoundaries(
    start: THREE.Vector2,
    end: THREE.Vector2,
    rooms: RoomBoundary[],
    doorways: Doorway[],
  ) {
    for (const room of rooms) {
      for (let index = 0; index < room.length; index++) {
        const wallStart = room[index]!
        const wallEnd = room[(index + 1) % room.length]!
        const movement = end.clone().sub(start)
        const wall = wallEnd.clone().sub(wallStart)
        const denominator = movement.x * wall.y - movement.y * wall.x
        if (Math.abs(denominator) < 1e-8) continue

        const offset = wallStart.clone().sub(start)
        const movementParameter = (offset.x * wall.y - offset.y * wall.x) / denominator
        const wallParameter = (offset.x * movement.y - offset.y * movement.x) / denominator
        if (movementParameter <= 1e-6 || movementParameter > 1 || wallParameter < 0 || wallParameter > 1) continue

        const crossing = start.clone().addScaledVector(movement, movementParameter)
        if (!doorways.some((doorway) => this.isPointOnSegment(crossing, doorway.start, doorway.end))) return false
      }
    }
    return true
  }

  private isPointOnSegment(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2) {
    const segment = end.clone().sub(start)
    const lengthSquared = segment.lengthSq()
    if (lengthSquared < 1e-8) return point.distanceTo(start) < 0.02
    const parameter = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1)
    return point.distanceTo(start.clone().addScaledVector(segment, parameter)) < 0.02
  }
}
