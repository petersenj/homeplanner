<script setup lang="ts">
import { keyboardKeySymbols } from '~/data/keyboardMouseInteractions'

defineProps<{
  t: (key: string) => string
  view: '2d' | '3d'
}>()

const isOpen = ref(false)
</script>

<template>
  <div class="keyboard-mouse-aid">
    <button
      class="keyboard-mouse-aid-button"
      type="button"
      :aria-label="t('Show keyboard and mouse controls')"
      :title="t('Show keyboard and mouse controls')"
      @click="isOpen = true"
    >
      <span class="aid-arrow-keys" aria-hidden="true">
        <kbd class="aid-arrow-up">{{ keyboardKeySymbols.ArrowUp.symbol }}</kbd>
        <kbd class="aid-arrow-left">{{ keyboardKeySymbols.ArrowLeft.symbol }}</kbd>
        <kbd class="aid-arrow-down">{{ keyboardKeySymbols.ArrowDown.symbol }}</kbd>
        <kbd class="aid-arrow-right">{{ keyboardKeySymbols.ArrowRight.symbol }}</kbd>
      </span>
      <svg class="aid-mouse" viewBox="0 0 20 28" aria-hidden="true">
        <path d="M10 1.5a7 7 0 0 0-7 7v11a7 7 0 0 0 14 0v-11a7 7 0 0 0-7-7Z" />
        <path d="M10 2v8m-7-1h14" />
      </svg>
      <span class="aid-help" aria-hidden="true">?</span>
    </button>
    <AppKeyboardMouseHelper
      :open="isOpen"
      :view="view"
      :t="t"
      @close="isOpen = false"
    />
  </div>
</template>

<style scoped>
.keyboard-mouse-aid { display: flex; align-items: center; }
.keyboard-mouse-aid-button { display: flex; align-items: center; gap: 7px; padding: 4px 8px; border: 1px solid #e8e7e0; border-radius: 6px; background: #fff; color: #777a71; cursor: pointer; }
.keyboard-mouse-aid-button:hover { border-color: #b7c3b4; background: #fafbf8; }
.keyboard-mouse-aid-button:focus-visible { outline: 2px solid #668371; outline-offset: 2px; }
.aid-arrow-keys { display: grid; grid-template-columns: repeat(3, 12px); grid-template-rows: repeat(2, 12px); gap: 2px; }
.aid-arrow-keys kbd { display: grid; place-items: center; width: 12px; height: 12px; border: 1px solid #deddd6; border-radius: 2px; background: #faf9f6; color: #555950; font: 8px/1 sans-serif; }
.aid-arrow-up { grid-column: 2; grid-row: 1; }
.aid-arrow-left { grid-column: 1; grid-row: 2; }
.aid-arrow-down { grid-column: 2; grid-row: 2; }
.aid-arrow-right { grid-column: 3; grid-row: 2; }
.aid-mouse { width: 13px; height: 19px; fill: #f7f6f2; stroke: #777a71; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.4; }
.aid-help { display: grid; place-items: center; width: 14px; height: 14px; border-radius: 50%; background: #668371; color: #fff; font: 700 9px/1 sans-serif; }
</style>
