<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  label: string
  checkedText: string
  uncheckedText: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function onChange(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  emit('update:modelValue', event.target.checked)
}
</script>

<template>
  <label class="app-switch">
    <input
      class="app-switch-input"
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :aria-label="label"
      @change="onChange"
    >
    <span class="app-switch-track" aria-hidden="true"><span class="app-switch-thumb" /></span>
    <span class="app-switch-state" aria-hidden="true">{{ modelValue ? checkedText : uncheckedText }}</span>
  </label>
</template>

<style lang="scss" scoped>
.app-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #41443e;
  font: 500 11px 'Manrope', sans-serif;
  cursor: pointer;
}

.app-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.app-switch-track {
  display: flex;
  width: 36px;
  height: 20px;
  align-items: center;
  padding: 2px;
  border: 2px solid #797b75;
  border-radius: 999px;
  background: #e8e9e4;
  transition: background-color 150ms ease, border-color 150ms ease;
}

.app-switch-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #797b75;
  transition: transform 150ms ease, background-color 150ms ease;
}

.app-switch-input:checked + .app-switch-track {
  border-color: #7a927c;
  background: #7a927c;
}

.app-switch-input:checked + .app-switch-track .app-switch-thumb {
  transform: translateX(16px);
  background: #fff;
}

.app-switch-input:focus-visible + .app-switch-track {
  outline: 2px solid #526d57;
  outline-offset: 3px;
}
</style>
