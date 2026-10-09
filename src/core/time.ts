import { formatInTimeZone } from 'date-fns-tz';
import { enUS } from 'date-fns/locale/en-US';
import { es } from 'date-fns/locale/es';
import type { Interval, ISODate, Language } from './types';

const locales = { en: enUS, es } as const;

export const HOUR_MS = 60 * 60 * 1000;
export const RECOVERY_WINDOW_HOURS = 72;

export const ms = (iso: ISODate) => new Date(iso).getTime();
export const iso = (t: number) => new Date(t).toISOString();

/** Instant `hours` after the discharge instant. Pure arithmetic on instants, so DST is a display concern only. */
export const offsetFromDischarge = (dischargeAt: ISODate, hours: number): ISODate =>
  iso(ms(dischargeAt) + hours * HOUR_MS);

export const hoursBetween = (a: ISODate | number, b: ISODate | number) => {
  const am = typeof a === 'number' ? a : ms(a);
  const bm = typeof b === 'number' ? b : ms(b);
  return (bm - am) / HOUR_MS;
};

export function recoveryWindow(dischargeAt: ISODate): Interval {
  const start = ms(dischargeAt);
  return { start, end: start + RECOVERY_WINDOW_HOURS * HOUR_MS };
}

/** Formats an instant in the patient's zone. Pattern tokens are date-fns. */
export function fmt(isoOrMs: ISODate | number, timezone: string, pattern: string, lang: Language = 'en') {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return formatInTimeZone(d, timezone, pattern, { locale: locales[lang] });
}

export const fmtTime = (t: ISODate | number, tz: string, lang: Language = 'en') => fmt(t, tz, 'HH:mm', lang);
export const fmtDay = (t: ISODate | number, tz: string, lang: Language = 'en') => fmt(t, tz, 'EEE d MMM', lang);
export const fmtDayLong = (t: ISODate | number, tz: string, lang: Language = 'en') => fmt(t, tz, 'EEEE, d MMMM', lang);
export const fmtDateTime = (t: ISODate | number, tz: string, lang: Language = 'en') => fmt(t, tz, 'EEE d MMM · HH:mm', lang);
export const fmtDateKey = (t: ISODate | number, tz: string) => fmt(t, tz, 'yyyy-MM-dd');

/** Hour-of-day (0-23) in the given zone, for "waking hours only" scheduling. */
export const localHour = (t: number, tz: string) => Number(formatInTimeZone(new Date(t), tz, 'H'));

// ---------------------------------------------------------------------------
// Interval algebra (closed-open, in ms)
// ---------------------------------------------------------------------------

export function normalize(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

/** Parts of `window` not covered by any of `covered`. */
export function subtract(window: Interval, covered: Interval[]): Interval[] {
  const gaps: Interval[] = [];
  let cursor = window.start;
  for (const c of normalize(covered)) {
    if (c.end <= cursor) continue;
    if (c.start >= window.end) break;
    if (c.start > cursor) gaps.push({ start: cursor, end: Math.min(c.start, window.end) });
    cursor = Math.max(cursor, c.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps;
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

export const contains = (outer: Interval, t: number) => t >= outer.start && t < outer.end;

export const durationHours = (i: Interval) => (i.end - i.start) / HOUR_MS;

export const totalHours = (is: Interval[]) => is.reduce((s, i) => s + durationHours(i), 0);
