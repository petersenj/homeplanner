<script setup lang="ts">
import AppConfirmationDialog from '~/components/AppConfirmationDialog.vue'
import { downloadPlanFile, parsePlanFile } from '~/utils/planFile'
import type { ImportedPlan, PlanFileExport } from '~/utils/planFile'
import type { Point } from '~/types/planner'

const props = defineProps<{
  t: (key: string) => string
  plan: PlanFileExport
  validateRoomLayout: (rooms: Point[][]) => boolean
}>()

const importedPlan = defineModel<ImportedPlan | null>('importedPlan')

const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref('')
const pendingPlan = ref<ImportedPlan | null>(null)
const confirmationOpen = ref(false)

function exportPlan() {
  downloadPlanFile(props.plan)
}

function requestImport() {
  importError.value = ''
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importError.value = ''
  let contents: string
  try {
    contents = await file.text()
  } catch (error) {
    console.error(props.t('Could not read the selected file.'), error)
    importError.value = props.t('Could not read the selected file.')
    input.value = ''
    return
  }
  input.value = ''

  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    importError.value = props.t('The selected file is not valid JSON.')
    return
  }

  try {
    pendingPlan.value = parsePlanFile(value, props.validateRoomLayout)
  } catch (error) {
    console.error(props.t('The selected file is not a valid Floorwise plan.'), error)
    importError.value = props.t('The selected file is not a valid Floorwise plan.')
    return
  }
  confirmationOpen.value = true
}

function cancelImport() {
  confirmationOpen.value = false
  pendingPlan.value = null
}

function importPlan() {
  if (!pendingPlan.value) return
  importedPlan.value = pendingPlan.value
  cancelImport()
  importError.value = ''
}
</script>

<template>
  <span class="action-divider"></span>
  <button class="import-button" type="button" @click="requestImport">{{ t('Import JSON') }}</button>
  <button class="export-button" type="button" @click="exportPlan">{{ t('Export JSON') }} <span>↗</span></button>
  <input
    ref="fileInput"
    class="import-file-input"
    type="file"
    accept="application/json,.json"
    :aria-label="t('Import JSON')"
    @change="onFileSelected"
  >
  <div v-if="importError" class="import-error" role="alert">
    {{ importError }}
    <button type="button" :aria-label="t('Dismiss')" @click="importError = ''">×</button>
  </div>
  <AppConfirmationDialog
    :open="confirmationOpen"
    :eyebrow="t('IMPORT PLAN')"
    :title="t('Replace the current floorplan?')"
    :description="t('Importing this file will replace your current floorplan, including rooms, furniture, walls, and measurements.')"
    :cancel-label="t('Cancel')"
    :confirm-label="t('Import plan')"
    @cancel="cancelImport"
    @confirm="importPlan"
  />
</template>

<style lang="scss" scoped>
.import-button {
  height: 33px;
  border: 1px solid #e6e5df;
  border-radius: 6px;
  background: #fff;
  padding: 0 11px;
  color: #555a52;
  font-size: 10px;
}

.import-button:hover {
  border-color: #b8c5b7;
  background: #f7f9f6;
}

.import-file-input {
  display: none;
}

.import-error {
  position: fixed;
  z-index: 30;
  top: 72px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 12px;
  border: 1px solid #e3c9c1;
  border-radius: 7px;
  background: #fff8f6;
  color: #875e50;
  font-size: 11px;
  box-shadow: 0 4px 14px #34322814;
}

.import-error button {
  padding: 0 3px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 16px;
}

@media (max-width: 760px) {
  .import-button {
    height: 30px;
    padding: 0 7px;
    font-size: 9px;
  }

  .import-error {
    top: 62px;
    right: 8px;
  }
}
</style>
