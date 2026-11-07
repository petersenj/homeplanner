<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getCatalogItem } from '~/catalog'
import { addLegs, box } from '~/catalog/scene'
import { isEgoCameraPointInsideRooms } from '~/utils/egoCameraPlan'
import { createEgoCameraModel, setEgoCameraModelSelected } from '~/utils/roomSceneEgoCamera'
import { RoomSceneFirstPersonController } from '~/utils/roomSceneFirstPerson'
import { pickRoomSceneSelection } from '~/utils/roomSceneSelection'
import { firstPersonInteractions, keyboardKeySymbols } from '~/data/keyboardMouseInteractions'
import type { CatalogItem } from '~/catalog/types'
import type { CameraSnapshot, CameraVector, EgoCamera, Point } from '~/types/planner'
const { language, t } = useAppLanguage()

type RoomItem = CatalogItem

const props = defineProps<{
  items: RoomItem[]
  roomWallDimensions: Record<string, { depth: number; height: number }>
  rooms: Point[][]
  roomWidth: number
  roomDepth: number
  roomX: number
  roomY: number
  selectedId: number | null
  selectedWallId: string | null
  cameraSnapshot: CameraSnapshot | null
  egoCamera: EgoCamera
  isEgoCameraSelected: boolean
}>()
const emit = defineEmits<{
  select: [id: number | null]
  wallSelect: [id: string | null]
  cameraChange: [snapshot: CameraSnapshot]
  egoCameraChange: [camera: EgoCamera]
  egoCameraSelect: [selected: boolean]
}>()
const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const isReady = ref(false)
const sceneError = ref('')
const isFullscreen = ref(false)
const firstPersonError = ref('')
const showCameraFacingWalls = ref(true)
const isTopDownView = ref(true)
const isFirstPersonMode = ref(false)
const selectedItem = computed(() => props.items.find((item) => item.id === props.selectedId) ?? null)
let renderer: THREE.WebGLRenderer | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let scene: THREE.Scene | undefined
let content: THREE.Group | undefined
let egoCameraGroup: THREE.Group | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let raycaster: THREE.Raycaster | undefined
let firstPersonController: RoomSceneFirstPersonController | undefined
let previousRenderTime = 0
let lastEgoCameraEmitTime = 0
let pointerLockRequestId = 0
let pointerDown: { id: number; x: number; y: number; egoCamera: boolean; controlsEnabled: boolean } | null = null
let pointerDragged = false
let pointerHitEgoCamera = false
const egoCameraDragOffset = new THREE.Vector3()
let pickableObjects: THREE.Object3D[] = []
const itemGroups = new Map<number, THREE.Group>()
const rotationAnimations = new Map<number, { startedAt: number; startRotation: number; endRotation: number; targetRotation: number }>()
let perimeterWalls: Array<{ group: THREE.Group; midpoint: THREE.Vector3; outward: THREE.Vector3; alwaysVisible: boolean }> = []
let cameraTransition: {
  startedAt: number
  duration: number
  startPosition: THREE.Vector3
  endPosition: THREE.Vector3
  startTarget: THREE.Vector3
  endTarget: THREE.Vector3
  startQuaternion: THREE.Quaternion
  endQuaternion: THREE.Quaternion
  endUp: THREE.Vector3
} | null = null
let firstPersonTransition: {
  startedAt: number
  duration: number
  startPosition: THREE.Vector3
  endPosition: THREE.Vector3
  startQuaternion: THREE.Quaternion
  endQuaternion: THREE.Quaternion
} | null = null

const roomWidthM = computed(() => props.roomWidth / 100)
const roomDepthM = computed(() => props.roomDepth / 100)

function roomPosition(x: number, z: number) {
  return {
    x: (x - props.roomX) / 100 - roomWidthM.value / 2,
    z: (z - props.roomY) / 100 - roomDepthM.value / 2,
  }
}

function material(color: THREE.ColorRepresentation, roughness = 0.82, options: THREE.MeshStandardMaterialParameters = {}) {
  const parameters: THREE.MeshStandardMaterialParameters = { color, roughness, ...options }
  for (const key of ['transparent', 'opacity', 'metalness'] as const) {
    if (parameters[key] === undefined) delete parameters[key]
  }
  return new THREE.MeshStandardMaterial(parameters)
}

function addRoom() {
  if (!content) return
  const width = roomWidthM.value
  const depth = roomDepthM.value
  const wallThickness = 0.12
  const perimeterSegments: Array<{ roomIndex: number; start: Point; end: Point; key: string; id: string }> = []
  const edgeCounts = new Map<string, number>()
  const roomVertices = props.rooms.flat()
  for (const [roomIndex, room] of props.rooms.entries()) {
    for (let index = 0; index < room.length; index++) {
      const start = room[index]!
      const end = room[(index + 1) % room.length]!
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lengthSquared = dx * dx + dy * dy
      const cuts = roomVertices.flatMap((point) => {
        const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (lengthSquared || 1)
        const cross = Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx)
        return t > 0.001 && t < 0.999 && cross < 0.1 ? [{ point, t }] : []
      }).sort((a, b) => a.t - b.t)
      const splitPoints = [start, ...cuts.map((cut) => cut.point), end]
      for (let segmentIndex = 0; segmentIndex < splitPoints.length - 1; segmentIndex++) {
        const segmentStart = splitPoints[segmentIndex]!
        const segmentEnd = splitPoints[segmentIndex + 1]!
        const startKey = `${segmentStart.x.toFixed(2)},${segmentStart.y.toFixed(2)}`
        const endKey = `${segmentEnd.x.toFixed(2)},${segmentEnd.y.toFixed(2)}`
        const key = [startKey, endKey].sort().join('|')
        perimeterSegments.push({ roomIndex, start: segmentStart, end: segmentEnd, key, id: `${roomIndex}-${index}-${segmentIndex}` })
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
      }
    }
  }
  const renderedEdges = new Set<string>()
  let gridAdded = false
  for (const [roomIndex, room] of props.rooms.entries()) {
    const points = room.map((point) => roomPosition(point.x, point.y))
    const shape = new THREE.Shape()
    const first = points[0]
    if (!first) continue
    shape.moveTo(first.x, -first.z)
    for (const point of points.slice(1)) shape.lineTo(point.x, -point.z)
    shape.closePath()
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      material('#eae3d8', 0.96),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.position.y = -0.025
    content.add(floor)

    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minZ = Math.min(...points.map((point) => point.z))
    const maxZ = Math.max(...points.map((point) => point.z))
    const rectangular = points.length === 4 && points.every((point) =>
      (Math.abs(point.x - minX) < 0.001 || Math.abs(point.x - maxX) < 0.001)
      && (Math.abs(point.z - minZ) < 0.001 || Math.abs(point.z - maxZ) < 0.001))
    if (rectangular && !gridAdded) {
      const grid = new THREE.GridHelper(Math.max(width, depth), Math.round(Math.max(width, depth) * 4), '#d9d1c5', '#e1dbd1')
      grid.position.y = -0.015
      content.add(grid)
      gridAdded = true
    }

  const signedArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!
    return area + point.x * next.z - next.x * point.z
  }, 0) / 2
  const edges: Array<{
    id: string
    start: { x: number; z: number }
    end: { x: number; z: number }
    midpoint: { x: number; z: number }
    angle: number
    length: number
    outwardX: number
    outwardZ: number
    exterior: boolean
  }> = []
  for (const segment of perimeterSegments.filter((entry) => entry.roomIndex === roomIndex)) {
    const start = roomPosition(segment.start.x, segment.start.y)
    const end = roomPosition(segment.end.x, segment.end.y)
    const key = segment.key
    if (renderedEdges.has(key)) continue
    renderedEdges.add(key)
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz)
    if (length < 0.02) continue
    const outwardX = (signedArea >= 0 ? dz : -dz) / length
    const outwardZ = (signedArea >= 0 ? -dx : dx) / length
    const midpoint = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }
    const angle = -Math.atan2(dz, dx)
    edges.push({ id: segment.id, start, end, midpoint, angle, length, outwardX, outwardZ, exterior: edgeCounts.get(key) === 1 })
  }

  const wallMountedItems = props.items.filter((item) => getCatalogItem(item.kind).wallMounted)
  for (const edge of edges) {
    const dimensions = props.roomWallDimensions[edge.id]
    const wallHeight = (dimensions?.height ?? 265) / 100
    const wallThickness = (dimensions?.depth ?? 12) / 100
    const wallGroup = new THREE.Group()
    wallGroup.userData.wallId = edge.id
    wallGroup.position.set(edge.midpoint.x, 0, edge.midpoint.z)
    wallGroup.rotation.y = edge.angle
    content.add(wallGroup)

    const openings = wallMountedItems.flatMap((item) => {
      const position = roomPosition(item.x, item.y)
      const offsetX = position.x - edge.midpoint.x
      const offsetZ = position.z - edge.midpoint.z
      const edgeAxisX = (edge.end.x - edge.start.x) / edge.length
      const edgeAxisZ = (edge.end.z - edge.start.z) / edge.length
      const distanceFromEdge = Math.abs(offsetX * edge.outwardX + offsetZ * edge.outwardZ)
      const alignment = Math.abs(
        Math.cos(item.rotation * Math.PI / 180) * edgeAxisX
        + Math.sin(item.rotation * Math.PI / 180) * edgeAxisZ,
      )
      if (distanceFromEdge > 0.12 || alignment < 0.98) return []

      const center = offsetX * edgeAxisX + offsetZ * edgeAxisZ
      const width = item.width / 100
      const start = Math.max(-edge.length / 2, center - width / 2)
      const end = Math.min(edge.length / 2, center + width / 2)
      const bottom = Math.max(0, Math.min(wallHeight, (item.floorOffset ?? 0) / 100))
      const top = Math.max(bottom, Math.min(wallHeight, ((item.floorOffset ?? 0) + item.height) / 100))
      if (end - start < 0.02 || top - bottom < 0.02) return []
      return [{ item, start, end, bottom, top }]
    })
    const horizontalBreaks = [...new Set([
      -edge.length / 2,
      edge.length / 2,
      ...openings.flatMap(({ start, end }) => [start, end]),
    ])].sort((first, second) => first - second)
    for (let index = 0; index < horizontalBreaks.length - 1; index++) {
      const start = horizontalBreaks[index]!
      const end = horizontalBreaks[index + 1]!
      const width = end - start
      if (width < 0.001) continue
      const middle = (start + end) / 2
      const verticalHoles = openings
        .filter((opening) => middle > opening.start && middle < opening.end)
        .map(({ bottom, top }) => ({ bottom, top }))
        .sort((first, second) => first.bottom - second.bottom)
      const mergedHoles: Array<{ bottom: number; top: number }> = []
      for (const hole of verticalHoles) {
        const previous = mergedHoles.at(-1)
        if (previous && hole.bottom <= previous.top) previous.top = Math.max(previous.top, hole.top)
        else mergedHoles.push({ ...hole })
      }
      let floor = 0
      for (const hole of mergedHoles) {
        if (hole.bottom - floor > 0.001) {
          box(wallGroup, [width, hole.bottom - floor, wallThickness], [(start + end) / 2, (floor + hole.bottom) / 2, 0], '#ddd6cb')
        }
        floor = Math.max(floor, hole.top)
      }
      if (wallHeight - floor > 0.001) {
        box(wallGroup, [width, wallHeight - floor, wallThickness], [(start + end) / 2, (floor + wallHeight) / 2, 0], '#ddd6cb')
      }
    }

    for (const opening of openings) {
      const { item, start, end, bottom, top } = opening
      const openingCenter = (start + end) / 2
      const openingWidth = end - start
      const frameWidth = 0.055
      const frameDepth = wallThickness + 0.04
      const isWindow = item.wallDetailCategory === 'Windows'
      const frameColor = isWindow ? '#f5f2ec' : '#986746'
      const openingHeight = top - bottom
      box(wallGroup, [frameWidth, openingHeight, frameDepth], [start, bottom + openingHeight / 2, 0], frameColor, { castShadow: false })
      box(wallGroup, [frameWidth, openingHeight, frameDepth], [end, bottom + openingHeight / 2, 0], frameColor, { castShadow: false })
      box(wallGroup, [openingWidth + frameWidth * 2, frameWidth, frameDepth], [openingCenter, top, 0], frameColor, { castShadow: false })
      if (isWindow) {
        box(wallGroup, [openingWidth + frameWidth * 2, frameWidth, frameDepth], [openingCenter, bottom, 0], frameColor, { castShadow: false })
      }
    }

    perimeterWalls.push({
      group: wallGroup,
      midpoint: new THREE.Vector3(edge.midpoint.x, wallHeight / 2, edge.midpoint.z),
      outward: new THREE.Vector3(edge.outwardX, 0, edge.outwardZ),
      alwaysVisible: !edge.exterior,
    })
    if (props.selectedWallId === edge.id) {
      wallGroup.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const meshMaterial of materials) meshMaterial.color.set('#7a9a7f')
      })
    }
    pickableObjects.push(wallGroup)
  }
  }

}

function addFurniture(item: RoomItem) {
  if (!content) return
  const { x, z } = roomPosition(item.x, item.y)
  const definition = getCatalogItem(item.kind)
  const group = new THREE.Group()
  group.position.set(x, Math.max(0, item.floorOffset ?? 0) / 100, z)
  group.rotation.y = -item.rotation * Math.PI / 180
  group.userData.itemId = item.id
  content.add(group)
  itemGroups.set(item.id, group)
  definition.createScene({
    width: item.width / 100,
    depth: item.depth / 100,
    height: item.height / 100,
    color: item.color ?? definition.color,
    open: item.open,
  }, group, { box, addLegs })
  pickableObjects.push(group)
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const meshMaterial of materials) meshMaterial.dispose()
    } else if (object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const lineMaterial of materials) lineMaterial.dispose()
    }
  })
  group.clear()
}

function updateScene() {
  if (!content) return
  disposeGroup(content)
  pickableObjects = []
  itemGroups.clear()
  rotationAnimations.clear()
  perimeterWalls = []
  addRoom()
  for (const item of props.items) addFurniture(item)
  if (props.selectedId !== null) {
    const selected = pickableObjects.find((object) => object.userData.itemId === props.selectedId)
    if (selected) {
      content.updateMatrixWorld(true)
      const outline = new THREE.BoxHelper(selected, '#64846c')
      outline.userData.decorative = true
      content.add(outline)
    }
  }
}

function updateEgoCameraModel() {
  if (!egoCameraGroup) return
  egoCameraGroup.visible = props.rooms.length > 0 && !isFirstPersonMode.value
  setEgoCameraModelPose(props.egoCamera)
}

function setEgoCameraModelPose(egoCamera: EgoCamera) {
  if (!egoCameraGroup) return
  egoCameraGroup.visible = props.rooms.length > 0 && !isFirstPersonMode.value
  const position = roomPosition(egoCamera.x, egoCamera.y)
  egoCameraGroup.position.set(position.x, 0, position.z)
  egoCameraGroup.rotation.y = -egoCamera.rotation * Math.PI / 180
  setEgoCameraModelSelected(egoCameraGroup, props.isEgoCameraSelected)
}

function updateItemRotations() {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  for (const item of props.items) {
    const group = itemGroups.get(item.id)
    if (!group) continue
    const targetRotation = -item.rotation * Math.PI / 180
    const startRotation = group.rotation.y
    const delta = THREE.MathUtils.euclideanModulo(targetRotation - startRotation + Math.PI, Math.PI * 2) - Math.PI
    if (reduceMotion || Math.abs(delta) < 0.0001) {
      group.rotation.y = targetRotation
      rotationAnimations.delete(item.id)
      continue
    }
    rotationAnimations.set(item.id, {
      startedAt: performance.now(),
      startRotation,
      endRotation: startRotation + delta,
      targetRotation,
    })
  }
}

function animateItemRotations(timestamp: number) {
  for (const [id, animation] of rotationAnimations) {
    const group = itemGroups.get(id)
    if (!group) {
      rotationAnimations.delete(id)
      continue
    }
    const progress = Math.min((timestamp - animation.startedAt) / 220, 1)
    const eased = 1 - (1 - progress) ** 3
    group.rotation.y = animation.startRotation + (animation.endRotation - animation.startRotation) * eased
    if (progress >= 1) {
      group.rotation.y = animation.targetRotation
      rotationAnimations.delete(id)
    }
  }
}

function updatePerimeterWallVisibility() {
  if (!camera || perimeterWalls.length === 0) return
  camera.updateMatrixWorld()
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3())
  for (const wall of perimeterWalls) {
    if (showCameraFacingWalls.value) {
      wall.group.visible = true
      continue
    }
    if (wall.alwaysVisible) {
      wall.group.visible = true
      continue
    }
    const cameraDirection = cameraPosition.clone().sub(wall.midpoint).setY(0).normalize()
    wall.group.visible = wall.outward.dot(cameraDirection) <= 0.05
  }
}

function resize() {
  if (!host.value || !renderer || !camera) return
  const width = host.value.clientWidth
  const height = host.value.clientHeight
  if (width < 1 || height < 1) return
  renderer.setSize(width, height, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  if (isTopDownView.value) positionCamera()
}

function render(timestamp: number) {
  if (renderer && scene && camera && controls) {
    animateItemRotations(timestamp)
    if (isFirstPersonMode.value && firstPersonTransition) {
      const transition = firstPersonTransition
      const progress = Math.min((timestamp - transition.startedAt) / transition.duration, 1)
      const eased = 1 - (1 - progress) ** 3
      camera.position.lerpVectors(transition.startPosition, transition.endPosition, eased)
      camera.quaternion.slerpQuaternions(transition.startQuaternion, transition.endQuaternion, eased)
      camera.updateMatrixWorld()
      if (progress >= 1) {
        camera.position.copy(transition.endPosition)
        firstPersonController?.activate()
        firstPersonTransition = null
        previousRenderTime = timestamp
      }
    } else if (isFirstPersonMode.value) {
      const deltaSeconds = previousRenderTime
        ? Math.min((timestamp - previousRenderTime) / 1000, 0.05)
        : 0
      previousRenderTime = timestamp
      if (firstPersonController?.update(deltaSeconds, roomWidthM.value, roomDepthM.value)) {
        syncEgoCameraFromFirstPerson()
      }
    } else if (cameraTransition) {
      const transition = cameraTransition
      const progress = Math.min((timestamp - transition.startedAt) / transition.duration, 1)
      const eased = progress < 0.5
        ? 4 * progress ** 3
        : 1 - (-2 * progress + 2) ** 3 / 2
      camera.position.lerpVectors(transition.startPosition, transition.endPosition, eased)
      controls.target.lerpVectors(transition.startTarget, transition.endTarget, eased)
      camera.quaternion.slerpQuaternions(transition.startQuaternion, transition.endQuaternion, eased)
      camera.updateMatrixWorld()
      if (progress >= 1) {
        camera.up.copy(transition.endUp)
        camera.position.copy(transition.endPosition)
        controls.target.copy(transition.endTarget)
        cameraTransition = null
        controls.enabled = true
        controls.update()
      }
    } else {
      controls.update()
    }
    updatePerimeterWallVisibility()
    renderer.render(scene, camera)
  }
  animationFrame = window.requestAnimationFrame(render)
}

function onCanvasClick(event: MouseEvent) {
  if (pointerDragged) {
    pointerDragged = false
    pointerHitEgoCamera = false
    return
  }
  if (pointerHitEgoCamera) {
    pointerHitEgoCamera = false
    return
  }
  if (!canvas.value || !camera || !raycaster) return
  const bounds = canvas.value.getBoundingClientRect()
  const clientX = isFirstPersonMode.value ? bounds.left + bounds.width / 2 : event.clientX
  const clientY = isFirstPersonMode.value ? bounds.top + bounds.height / 2 : event.clientY
  const selection = pickRoomSceneSelection(camera, canvas.value, raycaster, pickableObjects, clientX, clientY)
  emit('egoCameraSelect', false)
  if (selection?.type === 'wall') {
    emit('select', null)
    emit('wallSelect', selection.id)
    return
  }
  emit('wallSelect', null)
  emit('select', selection?.type === 'item' ? selection.id : null)
}

function onCanvasPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const isEgoCameraHit = isEgoCameraPointerHit(event)
  pointerDown = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    egoCamera: isEgoCameraHit,
    controlsEnabled: controls?.enabled ?? false,
  }
  pointerDragged = false
  pointerHitEgoCamera = isEgoCameraHit
  if (!isEgoCameraHit || !canvas.value || !camera || !raycaster || !egoCameraGroup || !controls) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const bounds = canvas.value.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const planeHit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
  if (planeHit) egoCameraDragOffset.set(egoCameraGroup.position.x - planeHit.x, 0, egoCameraGroup.position.z - planeHit.z)
  controls.enabled = false
  canvas.value.setPointerCapture(event.pointerId)
  emit('egoCameraSelect', true)
}

function onCanvasPointerMove(event: PointerEvent) {
  if (!pointerDown || pointerDown.id !== event.pointerId) return
  if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) {
    pointerDragged = true
  }
  if (!pointerDown.egoCamera || !canvas.value || !camera || !raycaster || !egoCameraGroup) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const bounds = canvas.value.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const planeHit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
  if (!planeHit) return
  const worldX = planeHit.x + egoCameraDragOffset.x
  const worldZ = planeHit.z + egoCameraDragOffset.z
  const nextCamera = {
    x: props.roomX + (worldX + roomWidthM.value / 2) * 100,
    y: props.roomY + (worldZ + roomDepthM.value / 2) * 100,
    rotation: props.egoCamera.rotation,
  }
  if (!isEgoCameraPointInsideRooms(nextCamera, props.rooms)) return
  emit('egoCameraChange', nextCamera)
}

function onCanvasPointerUp(event: PointerEvent) {
  if (pointerDown?.id !== event.pointerId) return
  if (pointerDown.egoCamera) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    if (controls) controls.enabled = pointerDown.controlsEnabled
  }
  pointerDown = null
}

function onCanvasPointerCancel(event: PointerEvent) {
  if (pointerDown?.id === event.pointerId) {
    if (pointerDown.egoCamera && controls) controls.enabled = pointerDown.controlsEnabled
    pointerDown = null
    pointerDragged = false
    pointerHitEgoCamera = false
  }
}

function isEgoCameraPointerHit(event: PointerEvent) {
  if (isFirstPersonMode.value || !canvas.value || !camera || !raycaster || !egoCameraGroup) return false
  const bounds = canvas.value.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return false
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObject(egoCameraGroup, true).length > 0
}

function syncEgoCameraFromFirstPerson(force = false) {
  if (!firstPersonController || firstPersonTransition) return
  const pose = firstPersonController.getPlanPose(
    props.roomX,
    props.roomY,
    roomWidthM.value,
    roomDepthM.value,
  )
  setEgoCameraModelPose(pose)
  const now = performance.now()
  if (!force && now - lastEgoCameraEmitTime < 200) return
  lastEgoCameraEmitTime = now
  emit('egoCameraChange', pose)
}

function onFirstPersonMouseMove(event: MouseEvent) {
  if (isFirstPersonMode.value && !firstPersonTransition && document.pointerLockElement === canvas.value) {
    firstPersonController?.look(event.movementX, event.movementY)
    syncEgoCameraFromFirstPerson()
  }
}

function onFirstPersonKeyDown(event: KeyboardEvent) {
  if (!isFirstPersonMode.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    exitFirstPersonMode()
    return
  }
  if (!event.key.startsWith('Arrow')) return
  event.preventDefault()
  event.stopPropagation()
  if (firstPersonTransition) return
  firstPersonController?.setKey(event.key, true)
}

function onFirstPersonKeyUp(event: KeyboardEvent) {
  if (!isFirstPersonMode.value || !event.key.startsWith('Arrow')) return
  event.preventDefault()
  event.stopPropagation()
  firstPersonController?.setKey(event.key, false)
}

function onPointerLockChange() {
  if (isFirstPersonMode.value && document.pointerLockElement !== canvas.value) {
    exitFirstPersonMode(false)
  }
}

function onPointerLockError() {
  if (!isFirstPersonMode.value) return
  console.error('Could not lock the mouse for first-person mode.')
  firstPersonError.value = 'Your browser could not lock the mouse for first-person mode.'
  exitFirstPersonMode(false)
}

function cameraView(topDown: boolean) {
  if (!camera || !controls) return
  const target = new THREE.Vector3(0, topDown ? 0 : 0.55, 0)
  const up = new THREE.Vector3(0, 1, 0)
  let position: THREE.Vector3
  let maxDistance = 16
  if (topDown) {
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2)
    const fitHeight = (roomDepthM.value + 0.4) / (2 * Math.tan(halfFov))
    const fitWidth = (roomWidthM.value + 0.4) / (2 * Math.tan(halfFov) * camera.aspect)
    const distance = Math.max(fitHeight, fitWidth, 0.5) * 1.6
    up.set(0, 0, -1)
    position = new THREE.Vector3(0, distance, 0)
    maxDistance = Math.max(16, distance * 1.5)
  } else {
    position = new THREE.Vector3(roomWidthM.value * 1.08, roomDepthM.value * 1.05, roomDepthM.value * 1.45)
  }
  return { target, up, position, maxDistance }
}

function positionCamera() {
  if (!camera || !controls) return
  if (isFirstPersonMode.value) return
  cameraTransition = null
  controls.enabled = true
  const destination = cameraView(isTopDownView.value)
  if (!destination) return
  controls.target.copy(destination.target)
  camera.up.copy(destination.up)
  camera.position.copy(destination.position)
  controls.maxDistance = destination.maxDistance
  controls.maxPolarAngle = isTopDownView.value ? Math.PI / 2 : Math.PI * 0.485
  controls.update()
}

function snapshotVector(vector: THREE.Vector3): CameraVector {
  return { x: vector.x, y: vector.y, z: vector.z }
}

function emitCameraSnapshot() {
  if (!camera || !controls || isFirstPersonMode.value) return
  emit('cameraChange', {
    position: snapshotVector(camera.position),
    target: snapshotVector(controls.target),
    up: snapshotVector(camera.up),
    isTopDown: isTopDownView.value,
    showCameraFacingWalls: showCameraFacingWalls.value,
  })
}

function transitionCameraTo(
  destination: { target: THREE.Vector3; up: THREE.Vector3; position: THREE.Vector3; maxDistance: number },
  topDown: boolean,
  showFacingWalls: boolean,
) {
  if (!camera || !controls) return

  const endQuaternion = new THREE.Quaternion()
  const previousUp = camera.up.clone()
  camera.up.copy(destination.up)
  const previousPosition = camera.position.clone()
  camera.position.copy(destination.position)
  camera.lookAt(destination.target)
  endQuaternion.copy(camera.quaternion)
  camera.position.copy(previousPosition)
  camera.up.copy(previousUp)
  camera.lookAt(controls.target)

  cameraTransition = {
    startedAt: performance.now(),
    duration: 650,
    startPosition: camera.position.clone(),
    endPosition: destination.position,
    startTarget: controls.target.clone(),
    endTarget: destination.target,
    startQuaternion: camera.quaternion.clone(),
    endQuaternion,
    endUp: destination.up,
  }
  controls.enabled = false
  controls.maxDistance = destination.maxDistance
  controls.maxPolarAngle = topDown ? Math.PI / 2 : Math.PI * 0.485
  isTopDownView.value = topDown
  showCameraFacingWalls.value = showFacingWalls
}

function animateCameraTo(topDown: boolean) {
  const destination = cameraView(topDown)
  if (destination) transitionCameraTo(destination, topDown, topDown)
}

function animateCameraToSnapshot(snapshot: CameraSnapshot) {
  const target = new THREE.Vector3(snapshot.target.x, snapshot.target.y, snapshot.target.z)
  const position = new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z)
  const up = new THREE.Vector3(snapshot.up.x, snapshot.up.y, snapshot.up.z)
  transitionCameraTo({
    target,
    position,
    up,
    maxDistance: Math.max(16, position.distanceTo(target) * 1.5),
  }, snapshot.isTopDown, snapshot.showCameraFacingWalls)
}

function toggleCameraFacingWalls() {
  showCameraFacingWalls.value = !showCameraFacingWalls.value
  emitCameraSnapshot()
}

function toggleTopDownView() {
  if (isFirstPersonMode.value) return
  animateCameraTo(!isTopDownView.value)
}

async function enterFirstPersonMode() {
  if (!camera || !controls || !canvas.value || !firstPersonController) return
  firstPersonError.value = ''
  isFirstPersonMode.value = true
  updateEgoCameraModel()
  isTopDownView.value = false
  showCameraFacingWalls.value = false
  cameraTransition = null
  controls.enabled = false
  const destination = firstPersonController.prepareEntry(
    props.egoCamera,
    props.roomX,
    props.roomY,
    roomWidthM.value,
    roomDepthM.value,
  )
  firstPersonTransition = {
    startedAt: performance.now(),
    duration: 800,
    startPosition: camera.position.clone(),
    endPosition: destination.position,
    startQuaternion: camera.quaternion.clone(),
    endQuaternion: destination.quaternion,
  }
  previousRenderTime = 0
  emit('select', null)
  emit('wallSelect', null)

  const requestId = ++pointerLockRequestId
  try {
    await canvas.value.requestPointerLock()
    if (requestId !== pointerLockRequestId && document.pointerLockElement === canvas.value) {
      document.exitPointerLock()
    }
  } catch (error) {
    if (!isFirstPersonMode.value) return
    console.error('Could not lock the mouse for first-person mode.', error)
    firstPersonError.value = 'Your browser could not lock the mouse for first-person mode.'
    exitFirstPersonMode()
  }
}

function exitFirstPersonMode(releasePointerLock = true) {
  if (!isFirstPersonMode.value) return
  syncEgoCameraFromFirstPerson(true)
  pointerLockRequestId++
  isFirstPersonMode.value = false
  updateEgoCameraModel()
  firstPersonTransition = null
  firstPersonController?.clearKeys()
  if (releasePointerLock && document.pointerLockElement === canvas.value) {
    document.exitPointerLock()
  }
  animateCameraTo(false)
}

function toggleFirstPersonMode() {
  if (isFirstPersonMode.value) exitFirstPersonMode()
  else void enterFirstPersonMode()
}

function resetCamera() {
  if (isFirstPersonMode.value) {
    exitFirstPersonMode()
    return
  }
  animateCameraTo(false)
}

async function toggleFullscreen() {
  if (!host.value) return
  try {
    if (document.fullscreenElement === host.value) await document.exitFullscreen()
    else await host.value.requestFullscreen()
  } catch (error) {
    console.error('Could not change the 3D view fullscreen state.', error)
  }
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === host.value
  window.requestAnimationFrame(resize)
}

function onControlsStart() {
  if (cameraTransition) {
    cameraTransition = null
    controls!.enabled = true
  }
  if (isTopDownView.value) {
    isTopDownView.value = false
    showCameraFacingWalls.value = false
    if (controls) controls.maxPolarAngle = Math.PI * 0.485
  }
  emit('select', null)
  emitCameraSnapshot()
}

function onControlsChange() {
  emitCameraSnapshot()
}

watch(() => [
  props.items.map((item) => [item.id, item.kind, item.section, item.wallDetailCategory, item.x, item.y, item.width, item.depth, item.height, item.floorOffset, item.name, item.color, item.open]),
  props.roomWallDimensions,
  props.rooms,
  props.selectedId,
  props.selectedWallId,
  props.roomWidth,
  props.roomDepth,
], updateScene, { deep: true })
watch(() => props.items.map((item) => [item.id, item.rotation]), updateItemRotations, { deep: true })
watch(() => [props.egoCamera, props.isEgoCameraSelected], updateEgoCameraModel, { deep: true })
watch(() => [props.roomWidth, props.roomDepth], positionCamera)

onMounted(() => {
  if (!host.value || !canvas.value) return
  try {
    scene = new THREE.Scene()
    scene.background = new THREE.Color('#f4f2ec')
    scene.fog = new THREE.Fog('#f4f2ec', 12, 26)

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(roomWidthM.value * 1.08, roomDepthM.value * 1.05, roomDepthM.value * 1.45)

    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: false })
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.target.set(0, 0.55, 0)
    controls.minDistance = 2.5
    controls.maxDistance = 16
    controls.maxPolarAngle = Math.PI * 0.485

    scene.add(new THREE.HemisphereLight('#fff8ee', '#9a9689', 2.15))
    const sunlight = new THREE.DirectionalLight('#fff4df', 3.2)
    sunlight.position.set(-4, 9, 6)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    sunlight.shadow.camera.left = -8
    sunlight.shadow.camera.right = 8
    sunlight.shadow.camera.top = 8
    sunlight.shadow.camera.bottom = -8
    scene.add(sunlight)
    const fill = new THREE.DirectionalLight('#dce9f3', 1.1)
    fill.position.set(4, 4, -5)
    scene.add(fill)

    content = new THREE.Group()
    scene.add(content)
    egoCameraGroup = createEgoCameraModel()
    scene.add(egoCameraGroup)
    raycaster = new THREE.Raycaster()
    firstPersonController = new RoomSceneFirstPersonController(camera)
    updateEgoCameraModel()
    updateScene()
    resize()
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host.value)
    positionCamera()
    controls.addEventListener('start', onControlsStart)
    controls.addEventListener('change', onControlsChange)
    canvas.value.addEventListener('pointerdown', onCanvasPointerDown, true)
    canvas.value.addEventListener('pointermove', onCanvasPointerMove, true)
    canvas.value.addEventListener('pointerup', onCanvasPointerUp, true)
    canvas.value.addEventListener('pointercancel', onCanvasPointerCancel, true)
    canvas.value.addEventListener('click', onCanvasClick)
    document.addEventListener('mousemove', onFirstPersonMouseMove)
    document.addEventListener('keydown', onFirstPersonKeyDown, true)
    document.addEventListener('keyup', onFirstPersonKeyUp, true)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('pointerlockerror', onPointerLockError)
    isReady.value = true
    animationFrame = window.requestAnimationFrame(render)
    if (props.cameraSnapshot) {
      window.requestAnimationFrame(() => animateCameraToSnapshot(props.cameraSnapshot!))
    } else {
      const defaultView = cameraView(false)
      if (defaultView) {
        emit('cameraChange', {
          position: snapshotVector(defaultView.position),
          target: snapshotVector(defaultView.target),
          up: snapshotVector(defaultView.up),
          isTopDown: false,
          showCameraFacingWalls: false,
        })
      }
      window.requestAnimationFrame(() => animateCameraTo(false))
    }
  } catch (error) {
    sceneError.value = 'Your browser could not start the interactive 3D view. Try updating your browser or enabling hardware acceleration.'
    console.error('Could not initialize the interactive 3D room.', error)
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  if (isFirstPersonMode.value) syncEgoCameraFromFirstPerson(true)
  emitCameraSnapshot()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('mousemove', onFirstPersonMouseMove)
  document.removeEventListener('keydown', onFirstPersonKeyDown, true)
  document.removeEventListener('keyup', onFirstPersonKeyUp, true)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('pointerlockerror', onPointerLockError)
  if (document.pointerLockElement === canvas.value) document.exitPointerLock()
  window.cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.dispose()
  if (canvas.value) {
    canvas.value.removeEventListener('pointerdown', onCanvasPointerDown, true)
    canvas.value.removeEventListener('pointermove', onCanvasPointerMove, true)
    canvas.value.removeEventListener('pointerup', onCanvasPointerUp, true)
    canvas.value.removeEventListener('pointercancel', onCanvasPointerCancel, true)
    canvas.value.removeEventListener('click', onCanvasClick)
  }
  if (content) disposeGroup(content)
  if (egoCameraGroup) disposeGroup(egoCameraGroup)
  renderer?.dispose()
  renderer?.forceContextLoss()
})
</script>

<template>
  <div ref="host" class="room-scene">
    <canvas
      ref="canvas"
      class="room-scene-canvas"
      :aria-label="t(isFirstPersonMode ? 'Interactive 3D room. Use the arrow keys to move, the mouse to look around, click to select, and Escape to exit first-person mode.' : 'Interactive 3D room. Drag to orbit, scroll to zoom, right-drag to pan.')"
    />
    <div v-if="isFirstPersonMode" class="scene-crosshair" aria-hidden="true"></div>
    <div v-if="isFirstPersonMode" class="scene-first-person-help" role="note" :aria-label="t('First-person controls')">
      <span
        v-for="(interaction, index) in firstPersonInteractions.keyboard"
        :key="`first-person-key-${index}`"
        class="first-person-help-control"
      >
        <span class="first-person-help-keycaps" :class="{ 'first-person-help-arrow-keycaps': interaction.keys[0] === 'ArrowUp' }" aria-hidden="true">
          <kbd v-for="(key, keyIndex) in interaction.keys" :key="key" :class="`key-${keyIndex}`">{{ keyboardKeySymbols[key].symbol }}</kbd>
        </span>
        <span>{{ t(interaction.description) }}</span>
      </span>
      <span
        v-for="(interaction, index) in firstPersonInteractions.mouse"
        :key="`first-person-mouse-${index}`"
        class="first-person-help-control"
      >
        <svg class="first-person-help-mouse" viewBox="0 0 32 44" aria-hidden="true">
          <rect x="4" y="2" width="24" height="40" rx="11" />
          <path class="mouse-divider" d="M16 3v14M5 17h22" />
          <path :class="{ 'mouse-active': interaction.button === 'left' }" d="M16 3v14H5V13a10 10 0 0 1 11-10Z" />
          <path :class="{ 'mouse-active': interaction.button === 'right' }" d="M16 3v14h11v-4A10 10 0 0 0 16 3Z" />
          <rect class="mouse-wheel" :class="{ 'mouse-active': interaction.button === 'wheel' }" x="14" y="8" width="4" height="7" rx="2" />
        </svg>
        <span><strong>{{ t(interaction.gesture) }}</strong>{{ t(interaction.description) }}</span>
      </span>
    </div>
    <div v-if="firstPersonError" class="scene-first-person-error" role="alert">{{ t(firstPersonError) }}</div>
    <div v-if="sceneError" class="scene-loading scene-error">{{ t(sceneError) }}</div>
    <div v-else-if="!isReady" class="scene-loading">{{ t('Preparing your room…') }}</div>
    <div class="scene-top-left">
      <span class="scene-live-dot"></span>
      <span>{{ t('LIVE 3D') }}</span>
      <span class="scene-top-divider">·</span>
      <span>{{ roomWidthM.toFixed(2) }} × {{ roomDepthM.toFixed(2) }} m</span>
    </div>
    <button
      class="scene-walls-toggle"
      type="button"
      :aria-pressed="showCameraFacingWalls"
      @click="toggleCameraFacingWalls"
    >
      {{ t(showCameraFacingWalls ? 'Hide camera-facing walls' : 'Show camera-facing walls') }}
    </button>
    <button
      class="scene-top-view-toggle"
      type="button"
      :aria-pressed="isTopDownView"
      :aria-label="t(isTopDownView ? 'Exit north-aligned top-down view' : 'Switch to north-aligned top-down view')"
      @click="toggleTopDownView"
    >
      {{ t(isTopDownView ? 'Exit top-down view' : 'Top-down · North up') }}
    </button>
    <button
      class="scene-first-person-toggle"
      type="button"
      :aria-pressed="isFirstPersonMode"
      @click="toggleFirstPersonMode"
    >
      {{ t(isFirstPersonMode ? 'Exit first-person mode' : 'First-person mode') }}
    </button>
    <div class="scene-compass"><span>N</span><span>↑</span></div>
    <div v-if="selectedItem" class="scene-selection">
      <span :style="{ background: selectedItem.color || '#8e967e' }"></span>
      <strong>{{ selectedItem.name || getCatalogItem(selectedItem.kind).label[language] }}</strong>
      <small>{{ selectedItem.width }} × {{ selectedItem.depth }} × {{ selectedItem.height }} cm</small>
    </div>
    <button class="scene-reset" :aria-label="t('Reset 3D camera')" :title="t('Reset camera view')" @click="resetCamera">↗ <span>{{ t('Reset view') }}</span></button>
    <button class="scene-fullscreen" :aria-label="t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')" :title="t(isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')" @click="toggleFullscreen">{{ isFullscreen ? '↙' : '⛶' }} <span>{{ t(isFullscreen ? 'Exit fullscreen' : 'Fullscreen') }}</span></button>
  </div>
</template>