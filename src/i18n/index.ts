import i18n, { changeLanguage, t as translate, use as registerPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import es from './es';
import type { Language } from '@/core/types';

export const resources = { en: { translation: en }, es: { translation: es } } as const;

if (!i18n.isInitialized) {
  void registerPlugin(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export const setLanguage = (lang: Language) => changeLanguage(lang);

/**
 * Translates a templated title. Numbers and clinical strings live in params
 * and pass through untouched, so changing language can never alter a dose
 * or a time. Falls back to the English template when a key is missing.
 */
export function tTitle(key: string, params: Record<string, string | number> = {}, lang?: Language) {
  const opts = lang ? { ...params, lng: lang } : params;
  const out = translate(key, opts as never) as unknown as string;
  return out.replace(/\s+·\s*$/, '').replace(/\s{2,}/g, ' ').trim();
}

export default i18n;
