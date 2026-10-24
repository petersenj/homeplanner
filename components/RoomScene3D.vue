<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

type RoomItem = {
  id: number
  kind: 'chair' | 'table' | 'cupboard' | 'shelf' | 'cube' | 'window' | 'door'
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation: number
  name?: string
  color?: string
}
type Wall = { id: number; start: { x: number; y: number }; end: { x: number; y: number } }
type Point = { x: number; y: number }

const props = defineProps<{
  items: RoomItem[]
  walls: Wall[]
  rooms: Point[][]
  roomWidth: number
  roomDepth: number
  roomX: number
  roomY: number
  selectedId: number | null
}>()
const emit = defineEmits<{ select: [id: number | null] }>()
const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const isReady = ref(false)
const sceneError = ref('')
const isFullscreen = ref(false)
const selectedItem = computed(() => props.items.find((item) => item.id === props.selectedId) ?? null)

let renderer: THREE.WebGLRenderer | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let scene: THREE.Scene | undefined
let content: THREE.Group | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let raycaster: THREE.Raycaster | undefined
let pointer: THREE.Vector2 | undefined
let pickableObjects: THREE.Object3D[] = []
let perimeterWalls: Array<{ group: THREE.Group; midpoint: THREE.Vector3; outward: THREE.Vector3; alwaysVisible: boolean }> = []

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

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: THREE.ColorRepresentation,
  options: { roughness?: number; castShadow?: boolean; receiveShadow?: boolean; transparent?: boolean; opacity?: number; metalness?: number } = {},
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

function addRoom() {
  if (!content) return
  const width = roomWidthM.value
  const depth = roomDepthM.value
  const wallHeight = 2.65
  const wallThickness = 0.12
  const perimeterSegments: Array<{ roomIndex: number; start: Point; end: Point; key: string }> = []
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
        perimeterSegments.push({ roomIndex, start: segmentStart, end: segmentEnd, key })
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
  const cameraDirection = new THREE.Vector2(1, 1).normalize()
  const edges: Array<{
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
    edges.push({ start, end, midpoint, angle, length, outwardX, outwardZ, exterior: edgeCounts.get(key) === 1 })
  }

  const farEdges = edges.filter((edge) => edge.exterior && edge.outwardX * cameraDirection.x + edge.outwardZ * cameraDirection.y <= 0.05)
  const windowEdge = farEdges.length
    ? farEdges.reduce((longest, edge) => edge.length > longest.length ? edge : longest, farEdges[0]!)
    : undefined

  const sillHeight = 1.22
  const windowHeight = 1.08
  const headerHeight = wallHeight - sillHeight - windowHeight
  const openingWidth = windowEdge ? Math.min(1.25, windowEdge.length * 0.6) : 0
  for (const edge of edges) {
    const wallGroup = new THREE.Group()
    wallGroup.position.set(edge.midpoint.x, 0, edge.midpoint.z)
    wallGroup.rotation.y = edge.angle
    content.add(wallGroup)

    if (edge === windowEdge && openingWidth > 0) {
      const sideWidth = Math.max(0, (edge.length - openingWidth) / 2)
      if (sideWidth > 0.001) {
        box(wallGroup, [sideWidth, wallHeight, wallThickness], [-(openingWidth + sideWidth) / 2, wallHeight / 2, 0], '#ddd6cb')
        box(wallGroup, [sideWidth, wallHeight, wallThickness], [(openingWidth + sideWidth) / 2, wallHeight / 2, 0], '#ddd6cb')
      }
      box(wallGroup, [openingWidth, sillHeight, wallThickness], [0, sillHeight / 2, 0], '#ddd6cb')
      if (headerHeight > 0.001) {
        box(wallGroup, [openingWidth, headerHeight, wallThickness], [0, sillHeight + windowHeight + headerHeight / 2, 0], '#ddd6cb')
      }

      const localZAxis = { x: Math.sin(edge.angle), z: Math.cos(edge.angle) }
      const inwardZ = localZAxis.x * -edge.outwardX + localZAxis.z * -edge.outwardZ >= 0 ? 1 : -1
      const openingFaceZ = inwardZ * (wallThickness / 2 + 0.012)
      const glass = box(
        wallGroup,
        [openingWidth - 0.08, windowHeight - 0.08, 0.035],
        [0, sillHeight + windowHeight / 2, openingFaceZ],
        '#84c3c9',
        { transparent: true, opacity: 0.72, roughness: 0.22, metalness: 0.08, castShadow: false },
      )
      glass.material.side = THREE.DoubleSide
      box(wallGroup, [openingWidth, 0.045, 0.07], [0, sillHeight, openingFaceZ], '#f5f2ec', { castShadow: false })
      box(wallGroup, [openingWidth, 0.045, 0.07], [0, sillHeight + windowHeight, openingFaceZ], '#f5f2ec', { castShadow: false })
      box(wallGroup, [0.045, windowHeight, 0.07], [-openingWidth / 2, sillHeight + windowHeight / 2, openingFaceZ], '#f5f2ec', { castShadow: false })
      box(wallGroup, [0.045, windowHeight, 0.07], [openingWidth / 2, sillHeight + windowHeight / 2, openingFaceZ], '#f5f2ec', { castShadow: false })
      box(wallGroup, [0.035, windowHeight - 0.08, 0.075], [0, sillHeight + windowHeight / 2, openingFaceZ], '#f5f2ec', { castShadow: false })
    } else {
      box(wallGroup, [edge.length + wallThickness * 0.25, wallHeight, wallThickness], [0, wallHeight / 2, 0], '#ddd6cb')
    }

    perimeterWalls.push({
      group: wallGroup,
      midpoint: new THREE.Vector3(edge.midpoint.x, wallHeight / 2, edge.midpoint.z),
      outward: new THREE.Vector3(edge.outwardX, 0, edge.outwardZ),
      alwaysVisible: !edge.exterior,
    })
  }
  }

  for (const wall of props.walls) {
    const start = roomPosition(wall.start.x, wall.start.y)
    const end = roomPosition(wall.end.x, wall.end.y)
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz)
    if (length < 0.02) continue
    const wallMesh = box(content, [length, 1.55, wallThickness], [(start.x + end.x) / 2, 0.775, (start.z + end.z) / 2], '#d4cdc2')
    wallMesh.rotation.y = -Math.atan2(dz, dx)
  }
}

function addLegs(group: THREE.Group, width: number, depth: number, height: number, color: string, inset = 0.1) {
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

function addFurniture(item: RoomItem) {
  if (!content) return
  const { x, z } = roomPosition(item.x, item.y)
  const width = item.width / 100
  const depth = item.depth / 100
  const height = item.height / 100
  const color = item.color ?? ({
    chair: '#c98d65',
    table: '#b28a63',
    cupboard: '#818d77',
    shelf: '#a88c72',
    cube: '#8097a8',
    window: '#77b9c1',
    door: '#c98d65',
  }[item.kind])
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = -item.rotation * Math.PI / 180
  group.userData.itemId = item.id
  content.add(group)

  if (item.kind === 'chair') {
    const seatHeight = Math.min(0.48, height * 0.55)
    box(group, [width, 0.1, depth], [0, seatHeight, 0], color)
    box(group, [width * 0.92, 0.045, depth * 0.82], [0, seatHeight + 0.057, 0], '#dfbd9f')
    box(group, [width * 0.88, height - seatHeight, 0.075], [0, (height + seatHeight) / 2, -depth * 0.42], color)
    for (const px of [-1, 1]) {
      for (const pz of [-1, 1]) {
        box(group, [0.035, seatHeight, 0.035], [px * (width / 2 - 0.055), seatHeight / 2, pz * (depth / 2 - 0.055)], '#927153')
      }
    }
  } else if (item.kind === 'table') {
    const topThickness = Math.max(0.055, Math.min(0.1, height * 0.12))
    addLegs(group, width, depth, Math.max(0.12, height - topThickness), color, 0.12)
    box(group, [width, topThickness, depth], [0, height - topThickness / 2, 0], color)
    box(group, [width * 0.92, 0.025, depth * 0.88], [0, height + 0.012, 0], '#c6a47e')
  } else if (item.kind === 'cupboard') {
    box(group, [width, height, depth], [0, height / 2, 0], color)
    box(group, [width * 0.88, height * 0.9, 0.025], [0, height / 2, depth / 2 + 0.014], '#d9d1c3')
    box(group, [0.014, height * 0.88, 0.035], [0, height / 2, depth / 2 + 0.03], '#898d7e')
    for (const px of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), material('#e9e0ce'))
      knob.position.set(px * 0.045, height / 2, depth / 2 + 0.052)
      group.add(knob)
    }
  } else if (item.kind === 'shelf') {
    const shelfCount = 4
    const supportWidth = Math.min(0.045, width * 0.12, depth * 0.12)
    for (const px of [-1, 1]) {
      for (const pz of [-1, 1]) {
        box(
          group,
          [supportWidth, height, supportWidth],
          [px * (width / 2 - supportWidth / 2), height / 2, pz * (depth / 2 - supportWidth / 2)],
          color,
        )
      }
    }
    for (let index = 0; index < shelfCount; index++) {
      const shelfY = index * (height - 0.035) / (shelfCount - 1) + 0.0175
      box(
        group,
        [Math.max(0.02, width - supportWidth * 2), 0.035, Math.max(0.02, depth - supportWidth * 2)],
        [0, shelfY, 0],
        '#dbc9b1',
      )
    }
  } else if (item.kind === 'window') {
    box(group, [width, height, 0.045], [0, height / 2 + 0.85, 0], '#75b8c1', {
      transparent: true,
      opacity: 0.7,
      roughness: 0.2,
      castShadow: false,
    })
  } else if (item.kind === 'door') {
    box(group, [width, height, Math.max(depth, 0.055)], [0, height / 2, 0], color)
    box(group, [0.022, 0.08, 0.025], [width * 0.35, height * 0.48, depth / 2 + 0.02], '#ead8b7')
  } else {
    box(group, [width, height, depth], [0, height / 2, 0], color)
    box(group, [width * 0.86, 0.015, depth * 0.86], [0, height + 0.01, 0], '#d0dce2', { castShadow: false })
  }
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

function updatePerimeterWallVisibility() {
  if (!camera || perimeterWalls.length === 0) return
  camera.updateMatrixWorld()
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3())
  for (const wall of perimeterWalls) {
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
}

function render() {
  if (renderer && scene && camera && controls) {
    controls.update()
    updatePerimeterWallVisibility()
    renderer.render(scene, camera)
  }
  animationFrame = window.requestAnimationFrame(render)
}

function onCanvasClick(event: MouseEvent) {
  if (!canvas.value || !camera || !scene || !raycaster || !pointer) return
  const bounds = canvas.value.getBoundingClientRect()
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const intersections = raycaster.intersectObjects(pickableObjects, true)
  const hit = intersections.find((intersection) => intersection.object.parent?.userData.itemId !== undefined || intersection.object.userData.itemId !== undefined)
  const itemId = hit?.object.parent?.userData.itemId ?? hit?.object.userData.itemId ?? null
  emit('select', itemId)
}

function resetCamera() {
  if (!camera || !controls) return
  camera.position.set(roomWidthM.value * 1.08, roomDepthM.value * 1.05, roomDepthM.value * 1.45)
  controls.target.set(0, 0.55, 0)
  controls.update()
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

watch(() => [props.items, props.walls, props.rooms, props.selectedId, props.roomWidth, props.roomDepth], updateScene, { deep: true })
watch(() => [props.roomWidth, props.roomDepth], resetCamera)

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
    raycaster = new THREE.Raycaster()
    pointer = new THREE.Vector2()
    updateScene()
    resize()
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host.value)
    controls.addEventListener('start', () => emit('select', null))
    canvas.value.addEventListener('click', onCanvasClick)
    isReady.value = true
    animationFrame = window.requestAnimationFrame(render)
  } catch (error) {
    sceneError.value = 'Your browser could not start the interactive 3D view. Try updating your browser or enabling hardware acceleration.'
    console.error('Could not initialize the interactive 3D room.', error)
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.dispose()
  if (canvas.value) canvas.value.removeEventListener('click', onCanvasClick)
  if (content) disposeGroup(content)
  renderer?.dispose()
  renderer?.forceContextLoss()
})
</script>

<template>
  <div ref="host" class="room-scene">
    <canvas ref="canvas" class="room-scene-canvas" aria-label="Interactive 3D room. Drag to orbit, scroll to zoom, right-drag to pan." />
    <div v-if="sceneError" class="scene-loading scene-error">{{ sceneError }}</div>
    <div v-else-if="!isReady" class="scene-loading">Preparing your room…</div>
    <div class="scene-top-left">
      <span class="scene-live-dot"></span>
      <span>LIVE 3D</span>
      <span class="scene-top-divider">·</span>
      <span>{{ roomWidthM.toFixed(2) }} × {{ roomDepthM.toFixed(2) }} m</span>
    </div>
    <div class="scene-controls" aria-label="3D view controls">
      <span><i class="control-orbit">↻</i> Drag to orbit</span>
      <span><i class="control-pan">✥</i> Right-drag to pan</span>
      <span><i class="control-zoom">⌕</i> Scroll to zoom</span>
    </div>
    <div class="scene-compass"><span>N</span><span>↑</span></div>
    <div v-if="selectedItem" class="scene-selection">
      <span :style="{ background: selectedItem.color || '#8e967e' }"></span>
      <strong>{{ selectedItem.name || selectedItem.kind }}</strong>
      <small>{{ selectedItem.width }} × {{ selectedItem.depth }} × {{ selectedItem.height }} cm</small>
    </div>
    <button class="scene-reset" aria-label="Reset 3D camera" title="Reset camera view" @click="resetCamera">↗ <span>Reset view</span></button>
    <button class="scene-fullscreen" :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'" :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'" @click="toggleFullscreen">{{ isFullscreen ? '↙' : '⛶' }} <span>{{ isFullscreen ? 'Exit fullscreen' : 'Fullscreen' }}</span></button>
  </div>
</template>
