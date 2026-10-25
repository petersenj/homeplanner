<script setup lang="ts">
const { language, t } = useAppLanguage()

useHead({
  title: computed(() => t('Floorwise — Home planner')),
  htmlAttrs: { lang: computed(() => language.value) },
  meta: [
    { name: 'description', content: computed(() => t('Plan your space, down to the last detail.')) },
  ],
})
</script>

<template>
  <NuxtPage />
</template>
