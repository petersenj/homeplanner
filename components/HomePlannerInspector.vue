<script setup lang="ts">
import type { CatalogItem } from '~/catalog/types'

type PlanItem = Pick<CatalogItem, 'kind' | 'name' | 'width' | 'depth' | 'height' | 'rotation' | 'floorOffset' | 'color'>
type WallInspector = { length: number; depth: number; height: number }

const props = defineProps<{
  item: PlanItem | null
  wall: WallInspector | null
  surfaceColors: string[]
  selectedSurfaceColor: string
  t: (key: string) => string
  itemLabel: (kind: string) => string
}>()

const emit = defineEmits<{
  close: []
  rotate: []
  remove: []
  rotationChange: [rotation: number]
  surfaceColorChange: [color: string]
  wallLengthChange: [length: number]
  wallDepthChange: [depth: number]
  wallHeightChange: [height: number]
}>()

const activeTab = ref<'properties' | 'appearance'>('properties')

watch(() => props.surfaceColors.length, (count) => {
  if (!count) activeTab.value = 'properties'
})

function onRotationChange(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const rotation = Number(event.target.value)
  if (Number.isFinite(rotation)) emit('rotationChange', rotation)
}

function onWallDimensionChange(event: Event, dimension: 'length' | 'depth' | 'height') {
  if (!(event.target instanceof HTMLInputElement)) return
  const value = Number(event.target.value)
  if (!Number.isFinite(value) || value < 1) return
  if (dimension === 'length') emit('wallLengthChange', value)
  else if (dimension === 'depth') emit('wallDepthChange', value)
  else emit('wallHeightChange', value)
}
</script>

<template>
  <aside class="inspector">
    <div class="inspector-heading">
      <div><span class="section-eyebrow">{{ t(wall ? 'SELECTED WALL' : 'SELECTED OBJECT') }}</span><input v-if="item" v-model="item.name"
          class="inspector-title-input" :aria-label="`${t('Name for')} ${itemLabel(item.kind)}`"
          :placeholder="itemLabel(item.kind)"><strong v-else class="inspector-wall-title">{{ t('Wall') }}</strong></div><button class="icon-button" :aria-label="t('Close inspector')"
        @click="emit('close')">×</button>
    </div>
    <template v-if="wall">
      <label class="property-label">{{ t('Length') }} <span>cm</span><input
          :value="wall.length.toFixed(2)" type="number" min="1" step="any"
          @change="onWallDimensionChange($event, 'length')"></label>
      <label class="property-label">{{ t('Depth') }} <span>cm</span><input
          :value="wall.depth" type="number" min="1" step="any"
          @change="onWallDimensionChange($event, 'depth')"></label>
      <label class="property-label">{{ t('Height') }} <span>cm</span><input
          :value="wall.height" type="number" min="1" step="any"
          @change="onWallDimensionChange($event, 'height')"></label>
    </template>
    <template v-else-if="item">
      <div v-if="surfaceColors.length" class="inspector-tabs" role="tablist">
        <button
          id="properties-tab"
          class="inspector-tab"
          :class="{ 'is-active': activeTab === 'properties' }"
          role="tab"
          :aria-selected="activeTab === 'properties'"
          aria-controls="properties-panel"
          @click="activeTab = 'properties'"
        >{{ t('Properties') }}</button>
        <button
          id="appearance-tab"
          class="inspector-tab"
          :class="{ 'is-active': activeTab === 'appearance' }"
          role="tab"
          :aria-selected="activeTab === 'appearance'"
          aria-controls="appearance-panel"
          @click="activeTab = 'appearance'"
        >{{ t('Appearance') }}</button>
      </div>
      <div v-if="activeTab === 'properties' || !surfaceColors.length" id="properties-panel" role="tabpanel" aria-labelledby="properties-tab">
        <div class="property-row"><label class="property-label">{{ t('Width') }} <span>cm</span><input
              v-model.number="item.width" type="number" min="1"></label><label class="property-label">{{ t('Depth') }}
            <span>cm</span><input v-model.number="item.depth" type="number" min="1"></label></div>
        <div class="property-row"><label class="property-label">{{ t('Height') }} <span>cm</span><input
              v-model.number="item.height" type="number" min="1"></label><label class="property-label rotation-property-label">{{ t('Rotation') }}
            <span>°</span>
            <div class="rotation-controls">
              <input
                :value="item.rotation"
                :aria-label="t('Rotation')"
                type="number"
                min="0"
                max="360"
                step="any"
                @change="onRotationChange"
              >
              <button
                class="rotate-button"
                type="button"
                :aria-label="t('Rotate 90°')"
                :title="t('Rotate 90°')"
                @click="emit('rotate')"
              >↻</button>
            </div>
          </label></div>
        <label class="property-label">{{ t('Distance from floor') }} <span>cm</span><input v-model.number="item.floorOffset"
            type="number" min="0" step="1"></label>
        <button class="delete-button" @click="emit('remove')">{{ t('Remove object') }}</button>
      </div>
      <div v-else id="appearance-panel" class="appearance-panel" role="tabpanel" aria-labelledby="appearance-tab">
        <span class="property-label">{{ t('Color') }}</span>
        <div class="surface-swatches" role="group" :aria-label="t('Color')">
          <button
            v-for="color in surfaceColors"
            :key="color"
            class="surface-swatch"
            :class="{ 'is-selected': selectedSurfaceColor.toLowerCase() === color.toLowerCase() }"
            type="button"
            :style="{ '--swatch-color': color }"
            :aria-label="`${t('Select color')} ${color}`"
            :aria-pressed="selectedSurfaceColor.toLowerCase() === color.toLowerCase()"
            :title="color"
            @click="emit('surfaceColorChange', color)"
          />
        </div>
      </div>
    </template>
  </aside>
</template>

<style lang="scss" scoped>
.inspector {
  position: absolute;
  top: 137px;
  right: 48px;
  z-index: 1;
  width: 234px;
  padding: 16px;
  border: 1px solid #e8e7e0;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 6px 24px #2d302016;

  &-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  &-title-input {
    display: block;
    width: 100%;
    max-width: 210px;
    margin-top: 5px;
    padding: 2px 0;
    border: 0;
    border-bottom: 1px solid transparent;
    outline: none;
    background: transparent;
    color: #41443e;
    font: 700 15px 'Manrope', sans-serif;
  }

  &-title-input:focus {
    border-bottom-color: #8ea18d;
  }

  &-title-input::placeholder {
    color: #41443e;
    opacity: 1;
  }

  .inspector-wall-title {
    display: block;
    margin-top: 5px;
    color: #41443e;
    font: 700 15px 'Manrope', sans-serif;
  }

  &-heading .icon-button {
    font-size: 19px;
    line-height: 17px;
  }
}

.inspector-tabs {
  display: flex;
  gap: 16px;
  margin: -2px 0 16px;
  border-bottom: 1px solid #e8e7e0;
}

.inspector-tab {
  padding: 0 0 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #777a72;
  font: 600 12px 'Manrope', sans-serif;
  cursor: pointer;

  &.is-active {
    border-bottom-color: #7a927c;
    color: #41443e;
  }
}

.appearance-panel {
  .property-label {
    display: block;
    margin-bottom: 10px;
  }
}

.surface-swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.surface-swatch {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--swatch-color);
  box-shadow: 0 0 0 1px #d8d8d0;
  cursor: pointer;

  &.is-selected {
    box-shadow: 0 0 0 2px #526d57;
  }

  &:focus-visible {
    outline: 2px solid #526d57;
    outline-offset: 3px;
  }
}

.rotation-controls {
  display: flex;
  width: 100%;
  gap: 5px;
  margin-top: 5px;

  input {
    flex: 1;
    min-width: 0;
    margin-top: 0;
  }

  .rotate-button {
    flex: 0 0 31px;
    width: 31px;
    height: 31px;
    padding: 0;
    font-size: 16px;
  }
}
</style>