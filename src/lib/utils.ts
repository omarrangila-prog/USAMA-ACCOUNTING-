import type { ISODate, Period } from '@/types';

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  ).toUpperCase();
}

export function now(): number {
  return Date.now();
}

export function todayISO(): ISODate {
  return new Date().toISOString().slice(0, 10);
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
  const today = new Date();
  if (p.year === today.getFullYear() && p.month === today.getMonth() + 1) {
    return today.toISOString().slice(0, 10);
  }
  return `${p.year}-${String(p.month).padStart(2, '0')}-01`;
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
