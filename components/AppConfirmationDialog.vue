<script setup lang="ts">
defineProps<{
  open: boolean
  eyebrow?: string
  title?: string
  description?: string
  cancelLabel?: string
  confirmLabel?: string
  titleId?: string
  dialogClass?: string
  backdropClass?: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <div
    v-if="open"
    class="confirmation-backdrop"
    :class="backdropClass"
    @click.self="emit('cancel')"
    @keydown.esc.window="emit('cancel')"
  >
    <section
      class="confirmation-dialog"
      :class="dialogClass"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId ?? (title ? 'confirmation-dialog-title' : undefined)"
      :aria-describedby="description ? 'confirmation-dialog-description' : undefined"
    >
      <div class="confirmation-heading">
        <slot name="heading">
          <div class="confirmation-title-group">
            <span v-if="eyebrow" class="section-eyebrow">{{ eyebrow }}</span>
            <h2 v-if="title" :id="titleId ?? 'confirmation-dialog-title'">{{ title }}</h2>
          </div>
        </slot>
      </div>
      <p v-if="description" id="confirmation-dialog-description">{{ description }}</p>
      <slot />
      <slot name="actions">
        <div v-if="cancelLabel && confirmLabel" class="confirmation-actions">
          <button class="confirmation-cancel" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button class="confirmation-accept" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </slot>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.confirmation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #20231f66;
}

.confirmation-dialog {
  width: min(100%, 390px);
  padding: 24px;
  border: 1px solid #e8e7e0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 60px #22251f38;

  h2 {
    margin: 8px 0;
    color: #3e433c;
    font: 700 18px 'Manrope', sans-serif;
  }

  p {
    margin: 0;
    color: #777a71;
    font-size: 12px;
    line-height: 1.6;
  }
}

.confirmation-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.confirmation-title-group {
  min-width: 0;
}

.confirmation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;

  button {
    min-height: 34px;
    padding: 0 13px;
    border: 1px solid #e4e5df;
    border-radius: 6px;
    background: #fff;
    color: #686d64;
    font-size: 11px;
  }

  .confirmation-accept {
    border-color: #668371;
    background: #668371;
    color: #fff;
    font-weight: 600;
  }
}
</style>
