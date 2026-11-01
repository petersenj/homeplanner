<script setup lang="ts">
import type { SvgShape } from '~/catalog/types'

defineProps<{
  shapes: SvgShape[]
  viewBox: string
  ariaHidden?: boolean
  group?: boolean
}>()
</script>

<template>
  <component
    :is="group ? 'g' : 'svg'"
    :viewBox="group ? undefined : viewBox"
    :aria-hidden="!group && ariaHidden ? 'true' : undefined"
  >
    <component
      :is="shape.tag"
      v-for="(shape, index) in shapes"
      :key="index"
      v-bind="shape.attributes"
    />
  </component>
</template>
