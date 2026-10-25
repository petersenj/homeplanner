<script setup lang="ts">
const props = defineProps<{ hasSelection: boolean; hasItems: boolean }>()
const emit = defineEmits<{ selectDemoItem: []; setProjectMenuOpen: [open: boolean]; clearSelection: []; createOwnFloorplan: [] }>()
const { t } = useAppLanguage()
const visible = ref(false)
const currentStep = ref(0)
const interacted = ref(false)
const createOwnChosen = ref(false)
const skippedToChoices = ref(false)
const targetRect = ref<DOMRect | null>(null)
const popover = ref<HTMLElement | null>(null)
let targetObserver: ResizeObserver | undefined
let autoAdvanceTimer: ReturnType<typeof setTimeout> | undefined

const steps = computed(() => [
  {
    title: t('Welcome to Floorwise'),
    body: t('Take a quick tour of the main tools. This sample floor plan is ready to explore.'),
    selector: null,
  },
  {
    title: t('Your floor plan'),
    body: t('This is your 2D canvas. The sample room and furniture show how a finished plan can look. Use the toolbar to draw or edit your room outline.'),
    selector: '.plan-svg',
  },
  {
    title: t('Rooms and layout'),
    body: t('Manage your rooms here. Start a new floor plan or add another room connected to an existing wall.'),
    selector: '.room-section',
  },
  {
    title: t('Add furniture and details'),
    body: t('Browse furniture, objects, windows, and doors. Choose an item to place it in your plan.'),
    selector: '.furniture-section',
  },
  {
    title: t('Drawing tools'),
    body: t('Use these tools to draw rooms, measure distances, show dimensions, adjust the canvas, and switch between 2D and 3D views.'),
    selector: '.toolbar-row',
  },
  {
    title: t('Select an object'),
    body: props.hasItems
      ? t('Click a furniture item in the sample plan. You can move it with the arrow keys and inspect its properties.')
      : t('Choose a furniture item from the catalog to add it to your plan.'),
    selector: props.hasItems ? '.plan-item, .room-scene-canvas' : '.furniture-section',
    requiresSelection: props.hasItems,
  },
  {
    title: t('Edit object properties'),
    body: props.hasSelection
      ? t('The inspector shows the selected object’s dimensions and rotation. Rename it, adjust its size, rotate it, or remove it.')
      : props.hasItems
        ? t('Click a furniture item in the plan to open its inspector and see its dimensions and rotation.')
        : t('Add an item to your plan to see its dimensions, rotation, and editing options.'),
    selector: props.hasSelection ? '.inspector' : props.hasItems ? '.plan-item, .room-scene-canvas' : '.furniture-section',
    requiresSelection: props.hasItems,
  },
  {
    title: createOwnChosen.value ? t('Start your own floorplan') : t('Ready to make it yours?'),
    body: createOwnChosen.value
      ? t('Click the highlighted Start a new floorplan menu item to begin drawing your own room.')
      : t('Keep exploring the demo floor plan, or start with a blank canvas and draw your own room.'),
    selector: createOwnChosen.value ? '.project-menu [role="menuitem"]' : null,
    choices: !createOwnChosen.value,
  },
])

const current = computed(() => steps.value[currentStep.value]!)
const isLastStep = computed(() => currentStep.value === steps.value.length - 1)
const interactionRequired = computed(() => current.value.selector !== null)
const spotlight = computed(() => {
  if (!targetRect.value) return null
  const padding = 7
  const left = Math.max(0, targetRect.value.left - padding)
  const top = Math.max(0, targetRect.value.top - padding)
  const right = Math.min(window.innerWidth, targetRect.value.right + padding)
  const bottom = Math.min(window.innerHeight, targetRect.value.bottom + padding)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
})

function updateTarget() {
  targetObserver?.disconnect()
  targetObserver = undefined
  const selector = current.value.selector
  const element = selector ? document.querySelector<HTMLElement | SVGElement>(selector) : null
  if (!element) {
    targetRect.value = null
    return
  }
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  targetRect.value = element.getBoundingClientRect()
  targetObserver = new ResizeObserver(() => {
    targetRect.value = element.getBoundingClientRect()
  })
  targetObserver.observe(element)
}

function next() {
  if (interactionRequired.value && !interacted.value) return
  if (current.value.requiresSelection && !props.hasSelection) {
    emit('selectDemoItem')
    return
  }
  if (isLastStep.value) {
    finish()
    return
  }
  advanceStep()
}

async function advanceStep() {
  const previousRect = currentStep.value === 0 ? popover.value?.getBoundingClientRect() : undefined
  currentStep.value++
  if (!previousRect) return
  await nextTick()
  const nextRect = popover.value?.getBoundingClientRect()
  if (!nextRect) return
  const offsetX = previousRect.left - nextRect.left
  const offsetY = previousRect.top - nextRect.top
  popover.value?.animate(
    [
      { transform: `translate(${offsetX}px, ${offsetY}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  )
}

function previous() {
  if (currentStep.value > 0) {
    if (createOwnChosen.value) {
      createOwnChosen.value = false
      emit('setProjectMenuOpen', false)
    }
    currentStep.value--
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  const selector = current.value.selector
  if (!selector || !(event.target instanceof Element)) return
  const highlightedElement = event.target.closest(selector)
  if (!highlightedElement || interacted.value) return
  if (current.value.requiresSelection) {
    if (props.hasSelection) completeInteraction()
    return
  }
  completeInteraction()
}

function completeInteraction() {
  if (interacted.value) return
  interacted.value = true
  const stepAtInteraction = currentStep.value
  autoAdvanceTimer = window.setTimeout(() => {
    if (!visible.value || currentStep.value !== stepAtInteraction) return
    if (current.value.requiresSelection && !props.hasSelection) return
    if (isLastStep.value) finish()
    else advanceStep()
  }, 700)
}

function finish() {
  window.localStorage.setItem('floorwise-tutorial-version', '2')
  emit('setProjectMenuOpen', false)
  visible.value = false
}

function skipToChoices() {
  if (autoAdvanceTimer) window.clearTimeout(autoAdvanceTimer)
  autoAdvanceTimer = undefined
  skippedToChoices.value = true
  createOwnChosen.value = false
  currentStep.value = steps.value.length - 1
}

function restart() {
  if (autoAdvanceTimer) window.clearTimeout(autoAdvanceTimer)
  autoAdvanceTimer = undefined
  currentStep.value = 0
  interacted.value = false
  createOwnChosen.value = false
  skippedToChoices.value = false
  emit('setProjectMenuOpen', false)
  visible.value = true
  nextTick(updateTarget)
}

function exploreDemo() {
  finish()
}

async function chooseCreateOwn() {
  if (skippedToChoices.value) {
    finish()
    emit('createOwnFloorplan')
    return
  }
  createOwnChosen.value = true
  emit('setProjectMenuOpen', true)
  await nextTick()
  updateTarget()
}

watch([visible, currentStep], async () => {
  if (!visible.value) return
  if (autoAdvanceTimer) window.clearTimeout(autoAdvanceTimer)
  autoAdvanceTimer = undefined
  interacted.value = false
  if (current.value.title === t('Select an object')) emit('clearSelection')
  await nextTick()
  updateTarget()
})

watch(() => props.hasSelection, (hasSelection) => {
  if (visible.value && hasSelection && current.value.requiresSelection && !interacted.value) completeInteraction()
})

onMounted(async () => {
  if (window.localStorage.getItem('floorwise-tutorial-version') === '2') return
  visible.value = true
  await nextTick()
  updateTarget()
  window.addEventListener('resize', updateTarget)
  window.addEventListener('scroll', updateTarget, true)
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})

onBeforeUnmount(() => {
  if (autoAdvanceTimer) window.clearTimeout(autoAdvanceTimer)
  targetObserver?.disconnect()
  window.removeEventListener('resize', updateTarget)
  window.removeEventListener('scroll', updateTarget, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

defineExpose({ restart })
</script>

<template>
  <div v-if="visible" class="tutorial" role="dialog" aria-modal="true" :aria-label="t('App tutorial')">
    <template v-if="spotlight">
      <div class="tutorial-shade" :style="{ left: 0, top: 0, width: '100%', height: `${spotlight.top}px` }"></div>
      <div class="tutorial-shade" :style="{ left: 0, top: `${spotlight.bottom}px`, width: '100%', bottom: 0 }"></div>
      <div class="tutorial-shade" :style="{ left: 0, top: `${spotlight.top}px`, width: `${spotlight.left}px`, height: `${spotlight.height}px` }"></div>
      <div class="tutorial-shade" :style="{ left: `${spotlight.right}px`, top: `${spotlight.top}px`, right: 0, height: `${spotlight.height}px` }"></div>
      <div class="tutorial-spotlight" :style="{ left: `${spotlight.left}px`, top: `${spotlight.top}px`, width: `${spotlight.width}px`, height: `${spotlight.height}px` }"></div>
    </template>
    <div v-else class="tutorial-shade tutorial-shade-full"></div>

    <section ref="popover" class="tutorial-card" :class="{ 'tutorial-card-centered': currentStep === 0 }">
      <div class="tutorial-card-top">
        <span class="tutorial-eyebrow">{{ t('A QUICK TOUR') }}</span>
        <button class="tutorial-skip" type="button" @click="skipToChoices">{{ t('Skip tutorial') }}</button>
      </div>
      <div class="tutorial-progress" :aria-label="`${t('Step')} ${currentStep + 1} ${t('of')} ${steps.length}`">
        <span v-for="(_, index) in steps" :key="index" :class="{ active: index === currentStep, complete: index < currentStep }"></span>
      </div>
      <div class="tutorial-copy-viewport">
        <Transition name="tutorial-copy" mode="out-in">
          <div :key="currentStep" class="tutorial-copy">
            <h2>{{ current.title }}</h2>
            <p>{{ current.body }}</p>
            <p v-if="interactionRequired" class="tutorial-interaction-hint" :class="{ solved: interacted }">
              <span class="tutorial-interaction-icon" :class="{ solved: interacted }" aria-hidden="true">{{ interacted ? '✓' : '○' }}</span>
              {{ t('Interact with the highlighted area to continue.') }}
            </p>
          </div>
        </Transition>
      </div>
      <div v-if="current.choices" class="tutorial-choices">
        <button class="tutorial-explore" type="button" @click="exploreDemo">{{ t('Explore demo floorplan') }}</button>
        <button class="tutorial-next" type="button" @click="chooseCreateOwn">{{ t('Create your own floorplan') }} <span aria-hidden="true">→</span></button>
      </div>
      <div v-else class="tutorial-actions">
        <span class="tutorial-step-count">{{ currentStep + 1 }} {{ t('of') }} {{ steps.length }}</span>
        <button v-if="currentStep > 0" class="tutorial-previous" type="button" @click="previous">{{ t('Back') }}</button>
        <button class="tutorial-next" type="button" :disabled="interactionRequired && !interacted" @click="next">
          {{ current.requiresSelection && !props.hasSelection ? t('Show an example') : isLastStep ? t('Finish') : t('Next') }}
          <span aria-hidden="true">{{ isLastStep ? '✓' : '→' }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tutorial { position: fixed; z-index: 10000; inset: 0; pointer-events: none; }
.tutorial-shade { position: fixed; z-index: 0; background: rgb(25 29 25 / 62%); pointer-events: auto; }
.tutorial-shade-full { inset: 0; }
.tutorial-spotlight { position: fixed; z-index: 1; border: 2px solid #fff; border-radius: 9px; box-shadow: 0 0 0 1px #668371, 0 0 24px rgb(255 255 255 / 50%); pointer-events: none; }
.tutorial-card { position: fixed; z-index: 2; right: 20px; bottom: 20px; width: min(410px, calc(100vw - 32px)); box-sizing: border-box; padding: 20px 22px 18px; border: 1px solid #e6e8e1; border-radius: 12px; background: #fff; box-shadow: 0 12px 48px rgb(20 28 21 / 24%); color: #45483f; pointer-events: auto; }
.tutorial-card-centered { top: 50%; right: auto; bottom: auto; left: 50%; transform: translate(-50%, -50%); }
.tutorial-card-top, .tutorial-actions { display: flex; align-items: center; }
.tutorial-card-top { justify-content: space-between; }
.tutorial-eyebrow { color: #668371; font-size: 9px; font-weight: 700; letter-spacing: 1.1px; }
.tutorial-skip, .tutorial-previous { border: 0; background: transparent; color: #777b72; font: inherit; font-size: 11px; cursor: pointer; }
.tutorial-progress { display: flex; gap: 5px; margin-top: 15px; }
.tutorial-progress span { width: 18px; height: 3px; border-radius: 2px; background: #e6e8e1; }
.tutorial-progress span.active, .tutorial-progress span.complete { background: #668371; }
.tutorial-card h2 { margin: 15px 0 7px; color: #3e493f; font-size: 18px; line-height: 1.25; }
.tutorial-card p { margin: 0; color: #71766d; font-size: 12px; line-height: 1.55; }
.tutorial-copy-viewport { overflow: hidden; }
.tutorial-copy-enter-active, .tutorial-copy-leave-active { transition: opacity 220ms ease, transform 220ms cubic-bezier(.22, 1, .36, 1); }
.tutorial-copy-enter-from { opacity: 0; transform: translateX(36px); }
.tutorial-copy-leave-to { opacity: 0; transform: translateX(-36px); }
.tutorial-card p.tutorial-interaction-hint { border: 1px solid transparent; display: flex; align-items: center; gap: 7px; margin-top: 9px; padding: 7px 9px; color: #668371; font-size: 10px; font-weight: 600; transition: color 220ms ease, background-color 220ms ease, border-color 220ms ease, padding 220ms ease; }
.tutorial-interaction-icon { display: inline-grid; flex: 0 0 18px; width: 18px; height: 18px; place-items: center; border: 1px solid currentColor; border-radius: 50%; font-size: 11px; transition: color 220ms ease, background-color 220ms ease, border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease; }
.tutorial-interaction-icon:not(.solved) { animation: tutorial-prompt-pulse 1.8s ease-in-out infinite; }
.tutorial-interaction-icon.solved { border-color: #4f8063; background: #4f8063; color: #fff; box-shadow: 0 0 0 4px #4f806326; animation: tutorial-solved-pop 420ms cubic-bezier(.2, .8, .25, 1.35) both; }
.tutorial-card p.tutorial-interaction-hint.solved { border-color: #d1e3d4; border-radius: 7px; background: #eff7f0; color: #3e704e; }
@keyframes tutorial-prompt-pulse {
  50% { box-shadow: 0 0 0 4px #66837120; transform: scale(1.08); }
}
@keyframes tutorial-solved-pop {
  0% { box-shadow: 0 0 0 0 #4f806300; transform: scale(.65) rotate(-18deg); }
  65% { box-shadow: 0 0 0 6px #4f806326; transform: scale(1.2) rotate(5deg); }
  100% { box-shadow: 0 0 0 4px #4f806326; transform: scale(1) rotate(0); }
}
.tutorial-actions { gap: 12px; margin-top: 19px; }
.tutorial-step-count { margin-right: auto; color: #999d94; font-size: 10px; }
.tutorial-next { display: flex; align-items: center; gap: 12px; min-height: 34px; padding: 0 13px; border: 0; border-radius: 6px; background: #668371; color: #fff; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.tutorial-next:hover { background: #536e5a; }
.tutorial-next:disabled { background: #9aa99d; cursor: not-allowed; }
.tutorial-choices { display: grid; gap: 8px; margin-top: 19px; }
.tutorial-explore { min-height: 35px; padding: 0 13px; border: 1px solid #dfe4dc; border-radius: 6px; background: #fff; color: #526b58; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.tutorial-explore:hover { background: #f5f7f3; }
.tutorial-choices .tutorial-next { justify-content: center; }
@media (prefers-reduced-motion: reduce) {
  .tutorial-interaction-icon:not(.solved), .tutorial-interaction-icon.solved { animation: none; }
  .tutorial-interaction-icon, .tutorial-card p.tutorial-interaction-hint { transition: none; }
  .tutorial-copy-enter-active, .tutorial-copy-leave-active { transition: none; }
}
@media (max-width: 600px) {
  .tutorial-card { right: 12px; bottom: 12px; width: calc(100vw - 24px); padding: 16px; }
  .tutorial-card-centered { top: 50%; right: auto; bottom: auto; left: 50%; }
  .tutorial-card h2 { font-size: 16px; }
  .tutorial-card p { font-size: 11px; }
  .tutorial-progress span { flex: 1; }
}
</style>
