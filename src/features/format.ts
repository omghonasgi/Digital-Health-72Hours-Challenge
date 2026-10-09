import { useTranslation } from 'react-i18next';
import type { Language } from '@/core/types';
import { fmtDateTime, fmtDay, fmtDayLong, fmtTime } from '@/core/time';
import { tTitle } from '@/i18n';

/** Formatters bound to a patient's time zone and the active UI language. */
export function useFmt(timezone: string) {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'es' ? 'es' : 'en') as Language;
  return {
    lang,
    time: (t: string | number) => fmtTime(t, timezone, lang),
    day: (t: string | number) => fmtDay(t, timezone, lang),
    dayLong: (t: string | number) => fmtDayLong(t, timezone, lang),
    dateTime: (t: string | number) => fmtDateTime(t, timezone, lang),
    range: (a: string | number, b: string | number) => `${fmtDay(a, timezone, lang)} ${fmtTime(a, timezone, lang)} – ${fmtTime(b, timezone, lang)}`,
    money: (n: number) => `$${Math.round(n).toLocaleString(lang === 'es' ? 'es-US' : 'en-US')}`,
    title: (key: string, params?: Record<string, string | number>) => tTitle(key, params, lang),
  };
}

export const hoursLabel = (h: number) => (Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`);
