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

const props = defineProps<{
  items: RoomItem[]
  walls: Wall[]
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
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    material('#eae3d8', 0.96),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.position.y = -0.025
  content.add(floor)

  const grid = new THREE.GridHelper(Math.max(width, depth), Math.round(Math.max(width, depth) * 4), '#d9d1c5', '#e1dbd1')
  grid.position.y = 0.002
  content.add(grid)

  box(content, [width + wallThickness, wallHeight, wallThickness], [0, wallHeight / 2, -depth / 2], '#e4ded4')
  box(content, [wallThickness, wallHeight, depth + wallThickness], [-width / 2, wallHeight / 2, 0], '#d8d1c7')

  const windowX = -width / 2 + 1.05
  box(content, [1.1, 1.12, 0.035], [windowX, 1.72, -depth / 2 + 0.05], '#84c3c9', {
    transparent: true,
    opacity: 0.72,
    roughness: 0.22,
    metalness: 0.08,
    castShadow: false,
  })
  box(content, [1.16, 0.055, 0.07], [windowX, 1.72, -depth / 2 + 0.06], '#f5f2ec', { castShadow: false })
  box(content, [0.045, 1.16, 0.07], [windowX, 1.72, -depth / 2 + 0.06], '#f5f2ec', { castShadow: false })

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
  } else if (item.kind === 'cupboard' || item.kind === 'shelf') {
    const shelfCount = item.kind === 'shelf' ? 4 : 2
    box(group, [width, height, depth], [0, height / 2, 0], color)
    box(group, [width * 0.88, height * 0.9, 0.025], [0, height / 2, depth / 2 + 0.014], '#d9d1c3')
    if (item.kind === 'cupboard') {
      box(group, [0.014, height * 0.88, 0.035], [0, height / 2, depth / 2 + 0.03], '#898d7e')
      for (const px of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), material('#e9e0ce'))
        knob.position.set(px * 0.045, height / 2, depth / 2 + 0.052)
        group.add(knob)
      }
    }
    for (let index = 1; index < shelfCount; index++) {
      const shelf = box(
        group,
        [width * 0.9, 0.035, depth * 0.88],
        [0, height * index / shelfCount, 0],
        item.kind === 'shelf' ? '#dbc9b1' : '#8d9a82',
      )
      if (item.kind === 'shelf') shelf.position.z = -depth * 0.04
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

watch(() => [props.items, props.walls, props.selectedId, props.roomWidth, props.roomDepth], updateScene, { deep: true })
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
