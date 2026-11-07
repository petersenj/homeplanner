<script setup lang="ts">
import type { CatalogItem } from '~/catalog/types'

type PlanItem = Pick<CatalogItem, 'kind' | 'section' | 'wallDetailCategory' | 'name' | 'width' | 'depth' | 'height' | 'rotation' | 'floorOffset' | 'color' | 'open'>
type WallInspector = { length: number; minimumLength: number; depth: number; height: number }
type RoomFloorInspector = { name: string; type: string | null; tint: string; rotation: number }
type FloorOption = { id: string; label: string }
type FloorTintOption = FloorOption & { color: string }

const props = defineProps<{
  item: PlanItem | null
  wall: WallInspector | null
  roomFloor: RoomFloorInspector | null
  floorTypeOptions: FloorOption[]
  floorTintOptions: FloorTintOption[]
  surfaceColors: string[]
  selectedSurfaceColor: string
  openable: boolean
  t: (key: string) => string
  itemLabel: (kind: string) => string
}>()

const emit = defineEmits<{
  close: []
  rotate: []
  remove: []
  rotationChange: [rotation: number]
  surfaceColorChange: [color: string]
  openChange: [open: boolean]
  wallLengthChange: [length: number]
  wallDepthChange: [depth: number]
  wallHeightChange: [height: number]
  floorTypeChange: [type: string | null]
  floorTintChange: [tint: string]
  floorRotationChange: [rotation: number]
}>()

const activeTab = ref<'properties' | 'appearance'>('properties')
const hasAppearance = computed(() => Boolean(props.roomFloor) || props.surfaceColors.length > 0 || props.item?.section === 'wall-details' || props.openable)

watch(hasAppearance, (available) => {
  if (!available) activeTab.value = 'properties'
})

watch(() => props.roomFloor, (roomFloor) => {
  if (roomFloor) activeTab.value = 'appearance'
})

function onRotationChange(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const rotation = Number(event.target.value)
  if (Number.isFinite(rotation)) emit('rotationChange', rotation)
}

function onFloorTypeChange(event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return
  emit('floorTypeChange', event.target.value || null)
}

function onFloorRotationChange(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const rotation = Number(event.target.value)
  if (Number.isFinite(rotation)) emit('floorRotationChange', rotation)
}

function onWallDimensionChange(event: Event, dimension: 'length' | 'depth' | 'height') {
  if (!(event.target instanceof HTMLInputElement)) return
  const value = Number(event.target.value)
  if (!Number.isFinite(value) || value < 1) return
  if (dimension === 'length' && props.wall && value < props.wall.minimumLength) {
    event.target.value = props.wall.length.toFixed(2)
    return
  }
  if (dimension === 'length') emit('wallLengthChange', value)
  else if (dimension === 'depth') emit('wallDepthChange', value)
  else emit('wallHeightChange', value)
}
</script>

<template>
  <aside class="inspector">
    <div class="inspector-heading">
      <div><span class="section-eyebrow">{{ t(roomFloor ? 'ROOM APPEARANCE' : wall ? 'SELECTED WALL' : 'SELECTED OBJECT') }}</span><input v-if="item" v-model="item.name"
          class="inspector-title-input" :aria-label="`${t('Name for')} ${itemLabel(item.kind)}`"
          :placeholder="itemLabel(item.kind)"><strong v-else class="inspector-wall-title">{{ roomFloor?.name ?? t('Wall') }}</strong></div><button class="icon-button" :aria-label="t('Close inspector')"
        @click="emit('close')">×</button>
    </div>
    <template v-if="wall">
      <label class="property-label">{{ t('Length') }} <span>cm</span><input
          :value="wall.length.toFixed(2)" type="number" :min="wall.minimumLength" step="any"
          @change="onWallDimensionChange($event, 'length')"></label>
      <label class="property-label">{{ t('Depth') }} <span>cm</span><input
          :value="wall.depth" type="number" min="1" step="any"
          @change="onWallDimensionChange($event, 'depth')"></label>
      <label class="property-label">{{ t('Height') }} <span>cm</span><input
          :value="wall.height" type="number" min="1" step="any"
          @change="onWallDimensionChange($event, 'height')"></label>
    </template>
    <template v-else-if="roomFloor">
      <div class="inspector-tabs" role="tablist">
        <button id="room-appearance-tab" class="inspector-tab is-active" role="tab" aria-selected="true" aria-controls="room-appearance-panel">{{ t('Appearance') }}</button>
      </div>
      <div id="room-appearance-panel" class="appearance-panel" role="tabpanel" aria-labelledby="room-appearance-tab">
        <label class="property-label">{{ t('Floor type') }}
          <select :value="roomFloor.type ?? ''" @change="onFloorTypeChange">
            <option value="">{{ t('No flooring') }}</option>
            <option v-for="floorType in floorTypeOptions" :key="floorType.id" :value="floorType.id">{{ floorType.label }}</option>
          </select>
        </label>
        <template v-if="roomFloor.type">
          <span class="property-label">{{ t('Tint') }}</span>
          <div class="floor-tint-options" role="group" :aria-label="t('Tint')">
            <button
              v-for="tint in floorTintOptions"
              :key="tint.id"
              class="floor-tint-option"
              :class="{ 'is-selected': roomFloor.tint === tint.id }"
              type="button"
              :aria-label="`${t('Select tint')} ${tint.label}`"
              :aria-pressed="roomFloor.tint === tint.id"
              @click="emit('floorTintChange', tint.id)"
            >
              <span class="floor-tint-swatch" :style="{ '--swatch-color': tint.color }"></span>
              <span>{{ tint.label }}</span>
            </button>
          </div>
          <label class="property-label rotation-property-label">{{ t('Flooring angle') }}
            <span>°</span>
            <div class="rotation-controls">
              <input :value="roomFloor.rotation" :aria-label="t('Flooring angle')" type="number" min="0" max="359" step="1" @change="onFloorRotationChange">
              <button class="rotate-button" type="button" :aria-label="t('Rotate flooring 90°')" :title="t('Rotate flooring 90°')" @click="emit('floorRotationChange', roomFloor.rotation + 90)">↻</button>
            </div>
          </label>
        </template>
      </div>
    </template>
    <template v-else-if="item">
      <div v-if="hasAppearance" class="inspector-tabs" role="tablist">
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
      <div v-if="activeTab === 'properties' || !hasAppearance" id="properties-panel" role="tabpanel" aria-labelledby="properties-tab">
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
                :step="item.section === 'wall-details' ? 180 : 'any'"
                @change="onRotationChange"
              >
              <button
                class="rotate-button"
                type="button"
                :aria-label="t(item.section === 'wall-details' ? 'Rotate 180°' : 'Rotate 90°')"
                :title="t(item.section === 'wall-details' ? 'Rotate 180°' : 'Rotate 90°')"
                @click="emit('rotate')"
              >↻</button>
            </div>
          </label></div>
        <label class="property-label">{{ t('Distance from floor') }} <span>cm</span><input v-model.number="item.floorOffset"
            type="number" min="0" step="1"></label>
        <button class="delete-button" @click="emit('remove')">{{ t('Remove object') }}</button>
      </div>
      <div v-else id="appearance-panel" class="appearance-panel" role="tabpanel" aria-labelledby="appearance-tab">
        <template v-if="surfaceColors.length">
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
        </template>
        <div v-if="openable" class="opening-state-control">
          <span class="opening-state-label">{{ t('Open state') }}</span>
          <AppSwitch
            :model-value="item.open === true"
            :label="t('Open state')"
            :checked-text="t('Open')"
            :unchecked-text="t('Closed')"
            @update:model-value="emit('openChange', $event)"
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

  select {
    display: block;
    width: 100%;
    height: 34px;
    margin-top: 5px;
    padding: 0 8px;
    border: 1px solid #e3e3dc;
    border-radius: 6px;
    background: #fff;
    color: #41443e;
    font: 500 12px 'Manrope', sans-serif;
  }
}

.floor-tint-options {
  display: grid;
  gap: 5px;
  margin: 0 0 14px;
}

.floor-tint-option {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 31px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #fff;
  color: #555850;
  font: 500 11px 'Manrope', sans-serif;
  text-align: left;
  cursor: pointer;

  &.is-selected {
    border-color: #91a490;
    background: #f3f6f1;
    color: #41443e;
  }

  &:focus-visible {
    outline: 2px solid #526d57;
    outline-offset: 2px;
  }
}

.floor-tint-swatch {
  width: 19px;
  height: 19px;
  flex: 0 0 19px;
  border-radius: 50%;
  background: var(--swatch-color);
  box-shadow: 0 0 0 1px #d8d8d0;
}

.opening-state-control {
  display: grid;
  gap: 8px;
}

.opening-state-label {
  color: #777a72;
  font: 600 11px 'Manrope', sans-serif;
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