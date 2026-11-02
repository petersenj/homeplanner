<script setup lang="ts">
import { keyboardKeySymbols, keyboardMouseInteractions } from '~/data/keyboardMouseInteractions'

defineProps<{
  open: boolean
  view: '2d' | '3d'
  t: (key: string) => string
}>()

const emit = defineEmits<{ close: [] }>()
const views = ['2d', '3d'] as const
</script>

<template>
  <AppConfirmationDialog
    :open="open"
    title-id="keyboard-mouse-helper-title"
    dialog-class="keyboard-mouse-dialog"
    backdrop-class="keyboard-mouse-backdrop"
    @cancel="emit('close')"
  >
    <template #heading>
      <div class="helper-heading">
        <div>
          <span class="section-eyebrow">{{ t('INTERACTION GUIDE') }}</span>
          <h2 id="keyboard-mouse-helper-title">{{ t('Keyboard & mouse') }}</h2>
        </div>
        <button class="helper-close" type="button" :aria-label="t('Close interaction guide')" @click="emit('close')">×</button>
      </div>
    </template>
    <p class="helper-intro">{{ t('Controls for editing your floor plan and exploring it in 3D.') }}</p>
    <div class="helper-views">
      <section
        v-for="mode in views"
        :key="mode"
        class="helper-view"
        :class="{ 'helper-view-active': view === mode }"
        :aria-label="t(mode === '2d' ? '2D plan' : '3D view')"
      >
        <h3>{{ t(mode === '2d' ? '2D plan' : '3D view') }}<span v-if="view === mode">{{ t('Current view') }}</span></h3>
        <div class="helper-groups">
          <section class="helper-group">
            <h4>{{ t('Keyboard') }}</h4>
            <ul>
              <li v-for="(interaction, index) in keyboardMouseInteractions[mode].keyboard" :key="`${mode}-key-${index}`">
                <span class="keycaps" :class="{ 'arrow-keycaps': interaction.keys[0] === 'ArrowUp' }">
                  <kbd v-for="(key, keyIndex) in interaction.keys" :key="key" :class="`key-${keyIndex}`" :aria-label="t(keyboardKeySymbols[key].label)">{{ keyboardKeySymbols[key].symbol }}</kbd>
                </span>
                <span>{{ t(interaction.description) }}</span>
              </li>
            </ul>
          </section>
          <section class="helper-group">
            <h4>{{ t('Mouse') }}</h4>
            <ul>
              <li v-for="(interaction, index) in keyboardMouseInteractions[mode].mouse" :key="`${mode}-mouse-${index}`">
                <svg
                  class="mouse-diagram"
                  viewBox="0 0 32 44"
                  role="img"
                  :aria-label="t(interaction.gesture)"
                >
                  <rect x="4" y="2" width="24" height="40" rx="11" />
                  <path class="mouse-divider" d="M16 3v14M5 17h22" />
                  <path :class="{ 'mouse-active': interaction.button === 'left' }" d="M16 3v14H5V13a10 10 0 0 1 11-10Z" />
                  <path :class="{ 'mouse-active': interaction.button === 'right' }" d="M16 3v14h11v-4A10 10 0 0 0 16 3Z" />
                  <rect class="mouse-wheel" :class="{ 'mouse-active': interaction.button === 'wheel' }" x="14" y="8" width="4" height="7" rx="2" />
                </svg>
                <span><strong>{{ t(interaction.gesture) }}</strong>{{ t(interaction.description) }}</span>
              </li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  </AppConfirmationDialog>
</template>

<style scoped>
.helper-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.helper-heading h2 { margin: 6px 0 0; color: #3e433c; font: 700 18px 'Manrope', sans-serif; }
.helper-heading :deep(.section-eyebrow) { color: #85877e; font-size: 8px; font-weight: 700; letter-spacing: 1px; }
.helper-close { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid #e8e7e0; border-radius: 5px; background: #fff; color: #777a71; font-size: 20px; line-height: 1; cursor: pointer; }
.helper-intro { margin: 8px 0 16px !important; }
.helper-views { display: grid; gap: 12px; max-height: min(65vh, 570px); overflow-y: auto; padding: 1px 3px 2px 1px; }
.helper-view { padding: 13px; border: 1px solid #eeede8; border-radius: 8px; background: #fcfbf9; }
.helper-view-active { border-color: #bdcbbd; background: #fbfcf9; }
.helper-view > h3 { display: flex; align-items: center; gap: 9px; margin: 0 0 12px; color: #454940; font-size: 12px; }
.helper-view > h3 span { padding: 3px 6px; border-radius: 4px; background: #eaf0e9; color: #668371; font-size: 8px; font-weight: 600; }
.helper-groups { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.helper-group h4 { margin: 0 0 8px; color: #84867d; font-size: 9px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
.helper-group ul { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.helper-group li { display: flex; align-items: center; gap: 9px; color: #65695f; font-size: 10px; line-height: 1.45; }
.keycaps { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; }
.keycaps kbd { display: grid; min-width: 23px; height: 23px; place-items: center; padding: 0 4px; border: 1px solid #deddd6; border-bottom-width: 2px; border-radius: 4px; background: #fff; color: #4e524a; font: 600 11px/1 sans-serif; }
.arrow-keycaps { display: grid; grid-template-columns: repeat(3, 23px); grid-template-rows: repeat(2, 23px); gap: 2px; }
.arrow-keycaps kbd { padding: 0; }
.arrow-keycaps .key-0 { grid-column: 2; grid-row: 1; }
.arrow-keycaps .key-1 { grid-column: 1; grid-row: 2; }
.arrow-keycaps .key-2 { grid-column: 2; grid-row: 2; }
.arrow-keycaps .key-3 { grid-column: 3; grid-row: 2; }
.mouse-diagram { flex: 0 0 24px; width: 24px; height: 34px; fill: #f1f0eb; stroke: #a4a69d; stroke-width: 1.2; }
.mouse-diagram .mouse-divider { fill: none; }
.mouse-diagram .mouse-active { fill: #cbd9cc; stroke: #668371; }
.mouse-diagram .mouse-wheel { fill: #fff; }
.mouse-diagram .mouse-wheel.mouse-active { fill: #668371; }
.helper-group li > span:last-child { display: grid; gap: 2px; }
.helper-group li strong { color: #4c5148; font-size: 9px; }
:deep(.keyboard-mouse-backdrop) { z-index: 22; }
:deep(.keyboard-mouse-dialog) { width: min(100%, 760px); max-height: min(90vh, 780px); display: flex; flex-direction: column; }
@media (max-width: 620px) {
  .helper-groups { grid-template-columns: 1fr; gap: 13px; }
  .helper-views { max-height: 65vh; }
}
</style>
