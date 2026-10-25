export default defineNuxtConfig({
  compatibilityDate: '2025-03-01',
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  app: {
    head: {
      title: 'Floorwise — Home planner',
      meta: [
        { name: 'description', content: 'Plan your space, down to the last detail.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
})
