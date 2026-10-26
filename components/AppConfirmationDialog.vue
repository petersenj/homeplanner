<script setup lang="ts">
defineProps<{
  open: boolean
  eyebrow: string
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <div v-if="open" class="confirmation-backdrop" @click.self="emit('cancel')">
    <section
      class="confirmation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
    >
      <span class="section-eyebrow">{{ eyebrow }}</span>
      <h2 id="confirmation-dialog-title">{{ title }}</h2>
      <p id="confirmation-dialog-description">{{ description }}</p>
      <div class="confirmation-actions">
        <button class="confirmation-cancel" @click="emit('cancel')">{{ cancelLabel }}</button>
        <button class="confirmation-accept" @click="emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </section>
  </div>
</template>
