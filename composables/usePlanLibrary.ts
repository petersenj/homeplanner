import { onMounted, ref, watch } from 'vue'
import { parsePlanFile } from '~/utils/planFile'
import type { ImportedPlan, PlanFileExport } from '~/utils/planFile'
import {
  ACTIVE_PLAN_ID_STORAGE_KEY,
  ACTIVE_PLAN_NAME_STORAGE_KEY,
  PLAN_LIBRARY_STORAGE_KEY,
  parsePlanLibrary,
} from '~/utils/planLibrary'
import type { SavedPlan } from '~/utils/planLibrary'
import type { Point } from '~/types/planner'

type PlanLibraryDialog = 'save-as' | 'open' | null

export function usePlanLibrary(options: {
  getPlan: () => PlanFileExport
  getPlanName: () => string
  setPlanName: (name: string) => void
  loadPlan: (plan: ImportedPlan) => void
  validateRoomLayout: (rooms: Point[][]) => boolean
  t: (key: string) => string
}) {
  const savedPlans = ref<SavedPlan[]>([])
  const activePlanId = ref<string | null>(null)
  const dialog = ref<PlanLibraryDialog>(null)
  const saveAsName = ref('')
  const selectedPlanId = ref<string | null>(null)
  const operationError = ref('')
  let isMounted = false

  function reportError(key: string, error: unknown) {
    console.error(options.t(key), error)
    operationError.value = options.t(key)
  }

  function persistLibrary(plans: SavedPlan[]) {
    window.localStorage.setItem(PLAN_LIBRARY_STORAGE_KEY, JSON.stringify(plans))
    savedPlans.value = plans
  }

  onMounted(() => {
    isMounted = true
    try {
      const savedLibrary = window.localStorage.getItem(PLAN_LIBRARY_STORAGE_KEY)
      savedPlans.value = savedLibrary ? parsePlanLibrary(JSON.parse(savedLibrary)) : []
      const storedActivePlanId = window.localStorage.getItem(ACTIVE_PLAN_ID_STORAGE_KEY)
      activePlanId.value = savedPlans.value.some((plan) => plan.id === storedActivePlanId)
        ? storedActivePlanId
        : null
      const storedPlanName = window.localStorage.getItem(ACTIVE_PLAN_NAME_STORAGE_KEY)
      if (storedPlanName?.trim()) options.setPlanName(storedPlanName)
    } catch (error) {
      reportError('Could not load saved plans.', error)
    }
  })

  watch(() => options.getPlanName(), (name) => {
    if (!isMounted) return
    try {
      window.localStorage.setItem(ACTIVE_PLAN_NAME_STORAGE_KEY, name)
    } catch (error) {
      reportError('Could not save the plan name.', error)
    }
  })

  function requestSaveAs() {
    operationError.value = ''
    saveAsName.value = options.getPlanName()
    dialog.value = 'save-as'
  }

  function savePlanAs() {
    const name = saveAsName.value.trim()
    if (!name) {
      operationError.value = options.t('Enter a name for this plan.')
      return
    }

    try {
      const plan: SavedPlan = {
        id: crypto.randomUUID(),
        name,
        updatedAt: new Date().toISOString(),
        plan: { ...options.getPlan(), name },
      }
      persistLibrary([...savedPlans.value, plan])
      window.localStorage.setItem(ACTIVE_PLAN_ID_STORAGE_KEY, plan.id)
      activePlanId.value = plan.id
      options.setPlanName(name)
      operationError.value = ''
      dialog.value = null
    } catch (error) {
      reportError('Could not save this plan. Check that browser storage is available.', error)
    }
  }

  function savePlan() {
    operationError.value = ''
    const activePlan = savedPlans.value.find((plan) => plan.id === activePlanId.value)
    if (!activePlan) {
      requestSaveAs()
      return
    }

    const name = options.getPlanName().trim()
    if (!name) {
      operationError.value = options.t('Enter a name for this plan.')
      return
    }
    try {
      persistLibrary(savedPlans.value.map((plan) => plan.id === activePlan.id
        ? { ...plan, name, updatedAt: new Date().toISOString(), plan: { ...options.getPlan(), name } }
        : plan))
      window.localStorage.setItem(ACTIVE_PLAN_NAME_STORAGE_KEY, name)
      operationError.value = ''
    } catch (error) {
      reportError('Could not save this plan. Check that browser storage is available.', error)
    }
  }

  function requestOpen() {
    operationError.value = ''
    selectedPlanId.value = null
    dialog.value = 'open'
  }

  function openSelectedPlan() {
    const savedPlan = savedPlans.value.find((plan) => plan.id === selectedPlanId.value)
    if (!savedPlan) return
    try {
      const plan = parsePlanFile(savedPlan.plan, options.validateRoomLayout)
      window.localStorage.setItem(ACTIVE_PLAN_ID_STORAGE_KEY, savedPlan.id)
      options.loadPlan(plan)
      options.setPlanName(savedPlan.name)
      activePlanId.value = savedPlan.id
      operationError.value = ''
      dialog.value = null
    } catch (error) {
      reportError('Could not open this plan because its saved data is invalid.', error)
    }
  }

  function cancelDialog() {
    dialog.value = null
  }

  return {
    activePlanId,
    cancelDialog,
    dialog,
    openSelectedPlan,
    operationError,
    requestOpen,
    requestSaveAs,
    saveAsName,
    savePlan,
    savePlanAs,
    savedPlans,
    selectedPlanId,
  }
}
