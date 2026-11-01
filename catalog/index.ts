import type { CatalogItemDefinition, RegisteredCatalogItemDefinition } from './types'

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

export function getCatalogItem(kind: string): RegisteredCatalogItemDefinition {
  const definition = catalogItemsByKind.get(kind)
  if (!definition) throw new Error(`No catalog item definition found for "${kind}".`)
  return definition
}
