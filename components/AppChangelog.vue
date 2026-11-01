<script setup lang="ts">
import { computed, watch } from 'vue'

type ChangelogEntry = { date: string; subject: string }
type ChangelogDay = { date: string; formattedDate: string; subjects: string[] }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { language, t } = useAppLanguage()
const loading = ref(false)
const error = ref(false)
const entries = ref<ChangelogEntry[]>([])
let loaded = false

const groupedEntries = computed<ChangelogDay[]>(() => {
  const groups = new Map<string, string[]>()
  for (const entry of entries.value) {
    const subjects = groups.get(entry.date) ?? []
    subjects.push(entry.subject)
    groups.set(entry.date, subjects)
  }

  const locale = language.value === 'de' ? 'de-DE' : 'en-US'
  return Array.from(groups, ([date, subjects]) => {
    const [year, month, day] = date.split('-').map(Number)
    const parsedDate = new Date(year!, month! - 1, day!)
    return {
      date,
      formattedDate: new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(parsedDate),
      subjects,
    }
  })
})

function isChangelogEntry(entry: unknown): entry is ChangelogEntry {
  return typeof entry === 'object'
    && entry !== null
    && 'date' in entry
    && typeof entry.date === 'string'
    && 'subject' in entry
    && typeof entry.subject === 'string'
}

async function loadChangelog() {
  if (loaded || loading.value) return

  loading.value = true
  error.value = false
  try {
    const response = await fetch('/changelog.json')
    if (!response.ok) throw new Error(`Changelog request failed with status ${response.status}`)

    const result: unknown = await response.json()
    if (!Array.isArray(result) || !result.every(isChangelogEntry)) {
      throw new Error('Changelog data has an invalid format')
    }
    entries.value = result
    loaded = true
  } catch (loadError) {
    console.error('Could not load the Git changelog.', loadError)
    error.value = true
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) void loadChangelog()
}, { immediate: true })
</script>

<template>
  <AppConfirmationDialog
    :open="open"
    title-id="changelog-title"
    dialog-class="changelog-dialog"
    backdrop-class="changelog-backdrop"
    @cancel="emit('update:open', false)"
  >
    <template #heading>
      <div class="changelog-heading">
        <h2 id="changelog-title">{{ t("What's new") }}</h2>
        <button class="icon-button changelog-close" type="button" :aria-label="t('Close changelog')" @click="emit('update:open', false)">×</button>
      </div>
    </template>
    <p v-if="loading" class="changelog-message">{{ t('Loading changelog...') }}</p>
    <p v-else-if="error" class="changelog-message changelog-error">{{ t('Could not load the changelog.') }}</p>
    <p v-else-if="!groupedEntries.length" class="changelog-message">{{ t('No Git changes available yet.') }}</p>
    <ol v-else class="changelog-list">
      <li v-for="group in groupedEntries" :key="group.date" class="changelog-day">
        <time :datetime="group.date">{{ group.formattedDate }}</time>
        <ul>
          <li v-for="(subject, index) in group.subjects" :key="`${group.date}-${index}`">{{ subject }}</li>
        </ul>
      </li>
    </ol>
  </AppConfirmationDialog>
</template>

<style scoped>
.changelog-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.changelog-heading h2 { margin: 8px 0 0; color: #3e433c; font: 700 18px 'Manrope', sans-serif; }
.changelog-close { font-size: 22px; line-height: 20px; }
.changelog-list { min-height: 0; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.changelog-day { padding: 11px 0; border-top: 1px solid #f0efeb; color: #555950; font-size: 11px; line-height: 1.5; }
.changelog-day > time { color: #73766d; font-size: 10px; font-weight: 700; }
.changelog-day ul { display: grid; gap: 6px; margin: 8px 0 0; padding-left: 18px; }
.changelog-message { margin: 0; color: #777a71; font-size: 12px; line-height: 1.6; }
.changelog-error { color: #a45d51; }
:deep(.changelog-backdrop) { z-index: 21; }
:deep(.changelog-dialog) { width: min(100%, 560px); max-height: min(80vh, 680px); display: flex; flex-direction: column; }
</style>
