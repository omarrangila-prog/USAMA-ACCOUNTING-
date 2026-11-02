import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultDateForPeriod, todayISO } from './utils';

/**
 * The date a new entry is pre-filled with. Entries were silently landing on the
 * 1st of an old month when the top bar wasn't moved on — 46 November entries
 * got 1 October. Now a past month defaults to its LAST day.
 */
afterEach(() => vi.useRealTimers());

describe('default entry date', () => {
  it('current month → today', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 2, 14, 0));   // 2 Nov 2026
    expect(defaultDateForPeriod({ month: 11, year: 2026 })).toBe('2026-11-02');
  });

  it('past month (top bar left on October) → 31 October, not the 1st', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 2, 14, 0));
    expect(defaultDateForPeriod({ month: 10, year: 2026 })).toBe('2026-10-31');
    expect(defaultDateForPeriod({ month: 9, year: 2026 })).toBe('2026-09-30');
    expect(defaultDateForPeriod({ month: 2, year: 2026 })).toBe('2026-02-28');
  });

  it('a future month → its 1st', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 2, 14, 0));
    expect(defaultDateForPeriod({ month: 12, year: 2026 })).toBe('2026-12-01');
  });

  it('just after midnight on the 1st is still the 1st (local time, not UTC)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 1, 0, 30));   // 00:30 on 1 Nov
    expect(todayISO()).toBe('2026-11-01');
    expect(defaultDateForPeriod({ month: 11, year: 2026 })).toBe('2026-11-01');
  });
});
