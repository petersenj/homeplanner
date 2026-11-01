import type * as THREE from 'three'

export type FurnitureSide = 'top' | 'right' | 'bottom' | 'left'
export type CatalogLanguage = 'en' | 'de'
export type CatalogSection = 'catalog' | 'wall-details'
export type WallDetailCategory = 'Windows' | 'Doors'

export type SvgShape = {
  tag: 'path' | 'rect' | 'line' | 'circle'
  attributes: Record<string, string | number | undefined>
}

export type CatalogItem = {
  id: number
  kind: string
  section: CatalogSection
  wallDetailCategory?: WallDetailCategory
  x: number
  y: number
  width: number
  depth: number
  height: number
  floorOffset?: number
  rotation: number
  name?: string
  color?: string
  open?: boolean
}

export type SceneItem = {
  width: number
  depth: number
  height: number
  color: string
  open?: boolean
}

export type SceneBoxOptions = {
  roughness?: number
  castShadow?: boolean
  receiveShadow?: boolean
  transparent?: boolean
  opacity?: number
  metalness?: number
}

export type SceneHelpers = {
  box: (
    parent: THREE.Object3D,
    size: [number, number, number],
    position: [number, number, number],
    color: THREE.ColorRepresentation,
    options?: SceneBoxOptions,
  ) => THREE.Mesh
  addLegs: (
    group: THREE.Group,
    width: number,
    depth: number,
    height: number,
    color: string,
    inset?: number,
  ) => void
}

export type CatalogItemDefinition = {
  section: CatalogSection
  wallDetailCategory?: WallDetailCategory
  label: Record<CatalogLanguage, string>
  detail: string
  dimensions: [width: number, depth: number, height: number]
  color: string
  surfaceColors?: string[]
  catalogIcon: SvgShape[]
  planFilter?: 'url(#soft-shadow)'
  planShapes: (item: CatalogItem) => SvgShape[]
  wallMounted?: boolean
  openable?: boolean
  mountingEdge?: 'longest' | 'second'
  defaultFloorOffset?: number
  rearSide?: (width: number, depth: number) => FurnitureSide
  createScene: (item: SceneItem, group: THREE.Group, helpers: SceneHelpers) => void
  normalizeSavedItem?: (item: CatalogItem) => CatalogItem
}

export type RegisteredCatalogItemDefinition = CatalogItemDefinition & {
  kind: string
  category: 'furniture' | 'objects'
}
