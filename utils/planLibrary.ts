export type SavedPlan = {
  id: string
  name: string
  updatedAt: string
  plan: unknown
}

export const PLAN_LIBRARY_STORAGE_KEY = 'floorwise-plan-library-v1'
export const ACTIVE_PLAN_ID_STORAGE_KEY = 'floorwise-active-plan-id-v1'
export const ACTIVE_PLAN_NAME_STORAGE_KEY = 'floorwise-active-plan-name-v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePlanLibrary(value: unknown): SavedPlan[] {
  if (!Array.isArray(value)) throw new Error('The saved plan library has an invalid structure.')

  const ids = new Set<string>()
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('The saved plan library has an invalid structure.')
    }
    if (typeof entry.id !== 'string' || !entry.id
      || typeof entry.name !== 'string' || !entry.name.trim()
      || typeof entry.updatedAt !== 'string'
      || !isRecord(entry.plan)
      || ids.has(entry.id)) {
      throw new Error('The saved plan library has an invalid structure.')
    }
    ids.add(entry.id)
    return {
      id: entry.id,
      name: entry.name,
      updatedAt: entry.updatedAt,
      plan: entry.plan,
    }
  })
}
