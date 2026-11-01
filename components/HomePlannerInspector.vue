<script setup lang="ts">
type PlanItem = {
  kind: string
  name?: string
  width: number
  depth: number
  height: number
  rotation: number
  floorOffset?: number
}

defineProps<{
  item: PlanItem
  t: (key: string) => string
  itemLabel: (kind: string) => string
}>()

const emit = defineEmits<{
  close: []
  rotate: []
  remove: []
  rotationChange: [rotation: number]
}>()

function onRotationChange(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const rotation = Number(event.target.value)
  if (Number.isFinite(rotation)) emit('rotationChange', rotation)
}
</script>

<template>
  <aside class="inspector">
    <div class="inspector-heading">
      <div><span class="section-eyebrow">{{ t('SELECTED OBJECT') }}</span><input v-model="item.name"
          class="inspector-title-input" :aria-label="`${t('Name for')} ${itemLabel(item.kind)}`"
          :placeholder="itemLabel(item.kind)"></div><button class="icon-button" :aria-label="t('Close inspector')"
        @click="emit('close')">×</button>
    </div>
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

  &-heading .icon-button {
    font-size: 19px;
    line-height: 17px;
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