<script setup lang="ts">
import AppConfirmationDialog from '~/components/AppConfirmationDialog.vue'
import { downloadPlanFile, parsePlanFile } from '~/utils/planFile'
import type { ImportedPlan, PlanFileExport } from '~/utils/planFile'
import type { Point } from '~/types/planner'
import { usePlanLibrary } from '~/composables/usePlanLibrary'

const props = defineProps<{
  t: (key: string) => string
  plan: PlanFileExport
  validateRoomLayout: (rooms: Point[][]) => boolean
}>()
const emit = defineEmits<{
  'saved-before-new': []
  'save-before-new-cancelled': []
  'save-before-new-failed': []
}>()

const importedPlan = defineModel<ImportedPlan | null>('importedPlan')
const planName = defineModel<string>('planName', { default: 'My apartment' })

const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref('')
const pendingPlan = ref<ImportedPlan | null>(null)
const pendingPlanName = ref('')
const confirmationOpen = ref(false)

const {
  cancelDialog,
  cancelDeletePlan,
  confirmDeletePlan,
  dialog,
  openSelectedPlan,
  operationError,
  markUnsaved,
  pendingDeletePlanId,
  requestOpen,
  requestDeletePlan,
  requestSaveAs,
  saveAsName,
  savePlan,
  savePlanAs,
  savedPlans,
  selectedPlanId,
} = usePlanLibrary({
  getPlan: () => props.plan,
  getPlanName: () => planName.value,
  setPlanName: (name) => { planName.value = name },
  loadPlan: (plan) => { importedPlan.value = plan },
  validateRoomLayout: props.validateRoomLayout,
  t: props.t,
})
const pendingDeletePlan = computed(() =>
  savedPlans.value.find((plan) => plan.id === pendingDeletePlanId.value) ?? null)
const sortedSavedPlans = computed(() => [...savedPlans.value].sort((first, second) => {
  const firstTime = Date.parse(first.updatedAt)
  const secondTime = Date.parse(second.updatedAt)
  if (!Number.isFinite(firstTime)) return Number.isFinite(secondTime) ? 1 : 0
  if (!Number.isFinite(secondTime)) return -1
  return secondTime - firstTime
}))

function exportPlan() {
  downloadPlanFile({ ...props.plan, name: planName.value }, planName.value)
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
  pendingPlanName.value = typeof value === 'object'
    && value !== null
    && 'name' in value
    && typeof value.name === 'string'
    && value.name.trim()
    ? value.name.trim()
    : planName.value
  confirmationOpen.value = true
}

function cancelImport() {
  confirmationOpen.value = false
  pendingPlan.value = null
}

function importPlan() {
  if (!pendingPlan.value) return
  if (!markUnsaved()) return
  importedPlan.value = pendingPlan.value
  planName.value = pendingPlanName.value
  cancelImport()
  importError.value = ''
}

function saveBeforeNewFloorplan() {
  savePlan({
    onSaved: () => emit('saved-before-new'),
    onCancelled: () => emit('save-before-new-cancelled'),
    onFailed: () => emit('save-before-new-failed'),
  })
}

function markCurrentPlanUnsaved() {
  return markUnsaved()
}

defineExpose({ markCurrentPlanUnsaved, saveBeforeNewFloorplan })
</script>

<template>
      <button type="button" @click="requestOpen">{{ t('Open') }}</button>
      ---
    <button type="button" @click="savePlan()">{{ t('Save') }}</button>
    <button type="button" @click="requestSaveAs()">{{ t('Save as') }}</button>
    ---
    <button type="button" @click="requestImport">{{ t('Import JSON') }}</button>
    <button type="button" @click="exportPlan">{{ t('Export JSON') }}</button>
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
  <div v-if="operationError" class="import-error" role="alert">
    {{ operationError }}
    <button type="button" :aria-label="t('Dismiss')" @click="operationError = ''">×</button>
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
  <AppConfirmationDialog
    :open="dialog === 'save-as'"
    :eyebrow="t('SAVE PLAN AS')"
    :title="t('Save plan as')"
    :description="t('Create a separate saved copy of this floorplan.')"
    :cancel-label="t('Cancel')"
    :confirm-label="t('Save')"
    @cancel="cancelDialog"
    @confirm="savePlanAs"
  >
    <label class="save-as-label">
      {{ t('Plan name') }}
      <input v-model="saveAsName" maxlength="100" autofocus :aria-label="t('Plan name')">
    </label>
  </AppConfirmationDialog>
  <AppConfirmationDialog
    :open="dialog === 'open'"
    :eyebrow="t('SAVED PLANS')"
    :title="t('Open a plan')"
    :description="t('Choose a saved plan to open.')"
    :cancel-label="t('Cancel')"
    :confirm-label="t('Open')"
    @cancel="cancelDialog"
    @confirm="openSelectedPlan"
  >
    <p v-if="!savedPlans.length" class="empty-plan-library">{{ t('No saved plans yet.') }}</p>
    <div v-for="plan in sortedSavedPlans" :key="plan.id" class="saved-plan-option">
      <label>
        <input v-model="selectedPlanId" type="radio" name="saved-plan" :value="plan.id">
        <span><strong>{{ plan.name }}</strong><small>{{ new Date(plan.updatedAt).toLocaleString() }}</small></span>
      </label>
      <button
        class="delete-saved-plan"
        type="button"
        :aria-label="`${t('Delete saved plan')}: ${plan.name}`"
        @click="requestDeletePlan(plan.id)"
      >
        {{ t('Delete') }}
      </button>
    </div>
  </AppConfirmationDialog>
  <AppConfirmationDialog
    :open="dialog === 'delete-plan'"
    :eyebrow="t('DELETE SAVED PLAN')"
    :title="t('Delete this saved plan?')"
    :description="t('This will permanently delete the saved plan. This cannot be undone.')"
    :cancel-label="t('Cancel')"
    :confirm-label="t('Delete')"
    @cancel="cancelDeletePlan"
    @confirm="confirmDeletePlan"
  >
    <p v-if="pendingDeletePlan" class="plan-delete-name">{{ pendingDeletePlan.name }}</p>
  </AppConfirmationDialog>
</template>

<style lang="scss" scoped>
.plan-file-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  width: 100%;
  margin-bottom: 5px;
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

.save-as-label {
  display: grid;
  gap: 7px;
  margin-top: 16px;
  color: #686d64;
  font-size: 11px;
}

.save-as-label input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid #dfe1da;
  border-radius: 6px;
  color: #343731;
}

.empty-plan-library {
  margin-top: 14px !important;
}

.saved-plan-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #efeee9;
  color: #555a52;
}

.saved-plan-option label {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 10px;
  cursor: pointer;
}

.saved-plan-option input {
  accent-color: #668371;
}

.saved-plan-option span {
  display: grid;
  gap: 3px;
}

.saved-plan-option strong {
  font-size: 11px;
  font-weight: 600;
}

.saved-plan-option small {
  color: #92948b;
  font-size: 9px;
}

.delete-saved-plan {
  padding: 5px 8px;
  border: 1px solid #e8d4cd;
  border-radius: 5px;
  background: #fff8f6;
  color: #875e50;
  font-size: 10px;
}

.delete-saved-plan:hover {
  border-color: #d7b4a9;
  background: #fdf0eb;
}

.plan-delete-name {
  margin-top: 12px !important;
  color: #555a52 !important;
  font-weight: 600;
}

@media (max-width: 760px) {
  .plan-action-button {
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
