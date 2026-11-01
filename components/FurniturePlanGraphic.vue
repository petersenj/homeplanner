<script setup lang="ts">
import type { CatalogItem } from '~/catalog/types'
import { getCatalogItem } from '~/catalog'

defineProps<{
  item: CatalogItem
}>()
</script>

<template>
  <g :filter="getCatalogItem(item.kind).planFilter">
    <CatalogGraphic :shapes="getCatalogItem(item.kind).planShapes(item)" view-box="0 0 1280 1280" group />
  </g>
</template>
