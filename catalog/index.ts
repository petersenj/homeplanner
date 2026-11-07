import type { CatalogItemDefinition, RegisteredCatalogItemDefinition } from './types'
import type { FloorMaterialDefinition } from './types'

const definitions = import.meta.glob<CatalogItemDefinition>('./{furniture,objects}/*.ts', {
  eager: true,
  import: 'definition',
})

export const catalogItems: RegisteredCatalogItemDefinition[] = Object.entries(definitions)
  .map(([path, definition]) => {
    const category: RegisteredCatalogItemDefinition['category'] | null = path.startsWith('./furniture/')
      ? 'furniture'
      : path.startsWith('./objects/')
        ? 'objects'
        : null
    const kind = path.match(/^\.\/(?:furniture|objects)\/([^/]+)\.ts$/)?.[1]
    if (!category || !kind) throw new Error(`Catalog definition has an unexpected path: "${path}".`)
    return { ...definition, category, kind }
  })
  .sort((first, second) => first.label.en.localeCompare(second.label.en))

export const catalogItemsByKind = new Map(catalogItems.map((item) => [item.kind, item]))

const floorMaterialDefinitions = import.meta.glob<FloorMaterialDefinition>('./floormaterials/*.json', {
  eager: true,
  import: 'default',
})

export const floorMaterials = Object.values(floorMaterialDefinitions)
  .sort((first, second) => first.label.en.localeCompare(second.label.en))

export const floorMaterialsByType = new Map(floorMaterials.map((material) => [material.type, material]))

export function getFloorMaterial(type: string): FloorMaterialDefinition {
  const definition = floorMaterialsByType.get(type)
  if (!definition) throw new Error(`No floor material definition found for "${type}".`)
  return definition
}

export function getCatalogItem(kind: string): RegisteredCatalogItemDefinition {
  const definition = catalogItemsByKind.get(kind)
  if (!definition) throw new Error(`No catalog item definition found for "${kind}".`)
  return definition
}
