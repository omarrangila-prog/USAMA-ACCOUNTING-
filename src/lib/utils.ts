import type { ISODate, Period } from '@/types';

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  ).toUpperCase();
}

export function now(): number {
  return Date.now();
}

/**
 * Today's date in the business's own time zone (local clock), not UTC.
 * toISOString() is UTC, which in Pakistan is still "yesterday" until 5 am — an
 * entry made just after midnight on the 1st landed in the previous month.
 */
export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function periodOf(dateISO: ISODate): Period {
  const [y, m] = dateISO.split('-').map(Number);
  return { year: y, month: m };
}

/**
 * Default entry date for a selected period. If the period is the current month,
 * use today; otherwise use the 1st of that month so new entries land inside the
 * month the user is viewing without touching the date field.
 */
export function defaultDateForPeriod(p: Period): ISODate {
  const today = todayISO();
  const cur = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
  const sel = p.year * 12 + p.month;
  // Selected month is the current one → today.
  if (sel === cur) return today;
  // A PAST month (e.g. still finishing October in early November) → its LAST
  // day, so late entries sit at the end of that month rather than all piling
  // onto the 1st. A future month → its 1st.
  return sel < cur ? lastDateOfPeriod(p) : `${p.year}-${String(p.month).padStart(2, '0')}-01`;
}

/**
 * Last calendar day of a period — "2026-08-31" for August 2026. Used to date a
 * month-closing record so it always falls inside the month it closes, whenever
 * the button is actually pressed.
 */
export function lastDateOfPeriod(p: Period): ISODate {
  const day = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Returns the previous month/year. */
export function prevPeriod(p: Period): Period {
  return p.month === 1
    ? { month: 12, year: p.year - 1 }
    : { month: p.month - 1, year: p.year };
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(m: number): string {
  return MONTHS[m - 1] ?? '';
}

export function formatMoney(n: number, currency = 'PKR'): string {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(Math.round(n));
  return `${sign}${currency} ${v.toLocaleString('en-PK')}`;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-PK');
}

export function formatDate(iso: ISODate): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function clampPositive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Case-insensitive fuzzy contains for search + smart-entry party matching. */
export function fuzzyIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase().trim());
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Normalize a bond denomination for duplicate detection: strip commas/spaces
 * and lowercase, so "1,500", "1500" and " 1500 " all match. Numeric names are
 * compared by number when possible (so "01500" == "1500").
 */
export function normalizeDenomination(name: string): string {
  const cleaned = name.trim().replace(/[,\s]/g, '').toLowerCase();
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== '' ? String(n) : cleaned;
}

/** Normalize a party name for duplicate detection (case + spacing). */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Re-date an ISO date into a target month/year, keeping the day-of-month.
 * If the target month has fewer days (e.g. day 31 → February), clamp to the
 * last valid day of that month.
 */
export function shiftDateToPeriod(dateISO: ISODate, target: Period): ISODate {
  const day = Number(dateISO.split('-')[2]) || 1;
  const lastDay = new Date(target.year, target.month, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${target.year}-${String(target.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
