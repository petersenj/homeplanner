<script setup lang="ts">
import { catalogItems } from '~/catalog'
import type { CatalogLanguage } from '~/catalog/types'

const props = defineProps<{
  t: (key: string) => string
  canPlace: boolean
  language: CatalogLanguage
}>()

const emit = defineEmits<{
  place: [kind: string]
}>()

const furnitureCategory = ref('All items')
const wallDetailCategory = ref('All items')

const entries = computed(() => catalogItems.filter((item) =>
  item.section === 'catalog'
  && (furnitureCategory.value === 'All items'
    || (furnitureCategory.value === 'Furniture' ? item.category === 'furniture' : item.category === 'objects')))
  .sort((first, second) => first.label[props.language].localeCompare(second.label[props.language], props.language)))
const wallDetails = computed(() => catalogItems.filter((item) =>
  item.section === 'wall-details'
  && (wallDetailCategory.value === 'All items'
    || item.wallDetailCategory === wallDetailCategory.value))
  .sort((first, second) => first.label[props.language].localeCompare(second.label[props.language], props.language)))
</script>

<template>
  <div class="section-heading"><span class="section-eyebrow">{{ t('FURNITURE & OBJECTS') }}</span><span class="count-pill">{{ entries.length }}</span></div>
  <div class="category-switcher">
    <button v-for="category in ['All items', 'Furniture', 'Misc']" :key="category" :class="{ active: furnitureCategory === category }" :aria-pressed="furnitureCategory === category" @click="furnitureCategory = category">{{ t(category) }}</button>
  </div>
  <div class="catalog-grid">
    <button v-for="entry in entries" :key="entry.kind" class="catalog-card" :disabled="!canPlace" @click="emit('place', entry.kind)">
      <span class="catalog-icon" :class="`icon-${entry.kind}`">
        <CatalogGraphic :shapes="entry.catalogIcon" view-box="0 0 42 42" aria-hidden />
      </span>
      <strong>{{ entry.label[language] }}</strong><small>{{ entry.detail }}</small>
      <span class="catalog-plus">+</span>
    </button>
  </div>
  <div class="section-heading structure-heading"><span class="section-eyebrow">{{ t('WALL DETAILS') }}</span><span class="count-pill">{{ wallDetails.length }}</span></div>
  <div class="category-switcher">
    <button v-for="category in ['All items', 'Windows', 'Doors']" :key="category" :class="{ active: wallDetailCategory === category }" :aria-pressed="wallDetailCategory === category" @click="wallDetailCategory = category">{{ t(category) }}</button>
  </div>
  <div class="catalog-grid">
    <button v-for="entry in wallDetails" :key="entry.kind" class="catalog-card" :disabled="!canPlace" @click="emit('place', entry.kind)">
      <span class="catalog-icon" :class="`icon-${entry.kind}`">
        <CatalogGraphic :shapes="entry.catalogIcon" view-box="0 0 42 42" aria-hidden />
      </span>
      <strong>{{ entry.label[language] }}</strong>
      <small>{{ entry.detail }}</small>
      <span class="catalog-plus">+</span>
    </button>
  </div>
  <div class="import-card import-planned" aria-disabled="true"><span class="import-icon">↥</span><span><strong>{{ t('Import 3D model') }}</strong><small>{{ t('Model import coming soon') }}</small></span></div>
</template>
