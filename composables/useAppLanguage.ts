import germanTranslations from '~/locales/de.json'

type Language = 'en' | 'de'

const translations = germanTranslations as Record<string, Record<string, string>>

export function useAppLanguage() {
  const language = useState<Language>('app-language', () => 'en')

  onMounted(() => {
    const savedLanguage = window.localStorage.getItem('floorwise-language')
    if (savedLanguage === 'en' || savedLanguage === 'de') {
      language.value = savedLanguage
      return
    }

    const browserLanguages = navigator.languages.length ? navigator.languages : [navigator.language]
    language.value = browserLanguages.some((browserLanguage) => browserLanguage.toLowerCase().startsWith('de'))
      ? 'de'
      : 'en'
  })

  function setLanguage(value: Language) {
    language.value = value
    window.localStorage.setItem('floorwise-language', value)
  }

  function t(sourceText: string) {
    if (language.value === 'en') return sourceText
    for (const group of Object.values(translations)) {
      const translated = group[sourceText]
      if (translated) return translated
    }
    return sourceText
  }

  return { language, setLanguage, t }
}
