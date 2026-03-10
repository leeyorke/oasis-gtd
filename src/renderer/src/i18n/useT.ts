import { useStore } from '../store/useStore'
import translations, { type Translations } from './translations'

export function useT(): Translations {
  const lang = useStore(s => s.settings.language as 'en' | 'zh') ?? 'en'
  return translations[lang] ?? translations.en
}