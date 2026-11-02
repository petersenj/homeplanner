<script setup lang="ts">
defineProps<{
  t: (key: string) => string
  language: string
  planName: string
  view: '2d' | '3d'
  activeTool: 'select' | 'room' | 'addRoom' | 'measure' | 'window' | 'door' | 'cube' | 'furniture'
  sidebarOpen: boolean
  showGrid: boolean
  showDimensions: boolean
  showCustomMeasurements: boolean
  zoom: number
  roomCount: number
}>()

const emit = defineEmits<{
  toggleSidebar: []
  languageChange: [event: Event]
  'update:view': [view: '2d' | '3d']
  selectTool: [tool: 'select' | 'measure']
  addRoom: []
  toggleGrid: []
  toggleDimensions: []
  toggleMeasurements: []
  zoom: [amount: number]
}>()
</script>

<template>
  <header class="topbar">
    <div class="breadcrumbs"><button class="mobile-menu icon-button" :aria-label="t('Toggle sidebar')" :aria-expanded="sidebarOpen" @click="emit('toggleSidebar')">☰</button><span>{{ planName }}</span><span class="saved-state"><span></span> {{ t('All changes saved') }}</span></div>
    <div class="top-actions">
      <select class="language-switch" :value="language" :aria-label="t('Change language')" :title="t('Change language')" @change="emit('languageChange', $event)">
        <option value="en">{{ t('English') }}</option>
        <option value="de">{{ t('German') }}</option>
      </select>
      <button class="top-icon disabled-icon" :title="t('Undo is not available yet')" :aria-label="t('Undo')" disabled>↶</button><button class="top-icon disabled-icon" :title="t('Redo is not available yet')" :aria-label="t('Redo')" disabled>↷</button>
    </div>
  </header>
  <div class="toolbar-row">
    <div class="view-switch"><button :class="{ selected: view === '2d' }" @click="emit('update:view', '2d')"><span class="view-2d-icon">▦</span>{{ t('2D plan') }}</button><button :class="{ selected: view === '3d' }" @click="emit('update:view', '3d')"><span class="view-3d-icon">◇</span>{{ t('3D view') }}</button></div>
    <div v-if="view === '2d'" class="tool-actions">
      <span class="tool-hint" v-if="activeTool === 'room'">{{ t('10° angle snap · Shift for free angle · Click near start to close') }}</span>
      <span class="tool-hint" v-else-if="activeTool === 'addRoom'">{{ t('Attach to existing walls · Shift for free angles') }}</span>
      <span class="tool-hint" v-else-if="activeTool === 'measure'">{{ t('Click two points to measure') }}</span>
      <button class="tool-button" :class="{ 'tool-active': activeTool === 'select' }" :title="t('Select and move')" @click="emit('selectTool', 'select')"><svg viewBox="0 0 20 20"><path d="m5 3 10 8-5 .7-2.5 5L5 3Z"/></svg></button>
      <button class="tool-button" :class="{ 'tool-active': activeTool === 'addRoom' || activeTool === 'room' }" :title="t(roomCount ? 'Add room' : 'Draw room')" :aria-label="t(roomCount ? 'Add room' : 'Draw room')" @click="emit('addRoom')"><svg viewBox="0 0 20 20"><path d="M3 4h8v8H3zM11 8h6v8h-6zM6 7h2m6 5h2"/></svg></button>
      <button class="tool-button" :class="{ 'tool-active': activeTool === 'measure' }" :title="t('Measure length')" @click="emit('selectTool', 'measure')"><svg viewBox="0 0 20 20"><path d="M4 14 14 4l3 3L7 17l-3-3Zm3-1 2 2m1-5 2 2m1-5 2 2"/></svg></button>
      <span class="toolbar-divider"></span>
      <button class="tool-button" :class="{ 'tool-active': showGrid }" :title="t('Toggle grid')" @click="emit('toggleGrid')"><svg viewBox="0 0 20 20"><path d="M4 4h12v12H4zM4 10h12M10 4v12"/></svg></button>
      <button class="tool-button" :class="{ 'tool-active': showDimensions }" :title="t('Toggle room dimensions and names')" :aria-label="t('Toggle room dimensions and names')" @click="emit('toggleDimensions')"><svg viewBox="0 0 20 20"><path d="M4 10h12m-3-3 3 3-3 3M7 7l-3 3 3 3"/></svg></button>
      <button class="tool-button" :class="{ 'tool-active': showCustomMeasurements }" :title="t('Toggle custom measurements')" :aria-label="t('Toggle custom measurements')" @click="emit('toggleMeasurements')"><svg viewBox="0 0 20 20"><path d="M3 15 15 3l2 2L5 17H3v-2Zm3-1 2 2m2-6 2 2m2-6 2 2"/></svg></button>
      <span class="toolbar-divider"></span><button class="zoom-button" :aria-label="t('Zoom out')" @click="emit('zoom', -0.1)">−</button><span class="zoom-level">{{ Math.round(zoom * 100) }}%</span><button class="zoom-button" :aria-label="t('Zoom in')" @click="emit('zoom', 0.1)">+</button>
    </div>
  </div>
</template>
