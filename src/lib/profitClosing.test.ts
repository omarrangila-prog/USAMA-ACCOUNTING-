import { describe, it, expect } from 'vitest';
import { computeProfitLoss, computeProfitByBond, type DataSet, type ProfitClosing } from './accounting';
import type { Sale } from '@/types';

/**
 * One-time Profit Closing: a dated closing baseline is subtracted from trading
 * profit, bringing reported Profit to 0 at that point. Underlying sales are NOT
 * modified (per-bond breakdown still shows the original figures). New sales
 * after the closing accumulate profit from 0 again.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
// Cash sale, cost 0 -> profit == amount.
const sale = (id: string, m: number, amount: number): Sale =>
  ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: 0, profit: amount, date: `2026-0${m}-10`, ...meta(m) });
const closing = (amount: number): ProfitClosing =>
  ({ id: 'pc1', date: '2026-08-02', month: 8, year: 2026, amount, note: 'one-time', createdAt: now, updatedAt: now });

const base: DataSet = {
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [sale('s1', 7, 500000)], cash: [],
  partyAdjustments: [], expenses: [], closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };

describe('Profit Closing adjustment', () => {
  it('without a closing, profit is the full trading profit', () => {
    expect(computeProfitLoss(base, AUG, true)).toBe(500000);
  });

  it('a closing equal to profit brings reported Profit to exactly 0', () => {
    const data = { ...base, profitClosings: [closing(500000)] };
    expect(computeProfitLoss(data, AUG, true)).toBe(0);
  });

  it('per-bond breakdown is UNCHANGED by the closing (history intact)', () => {
    const withClosing = { ...base, profitClosings: [closing(500000)] };
    const noClosing = { ...base };
    // The closing never touches the per-bond figures — they are identical with
    // or without it (the closing only offsets the overall profit total).
    expect(computeProfitByBond(withClosing, AUG)).toEqual(computeProfitByBond(noClosing, AUG));
  });

  it('new sales after the closing accumulate from 0', () => {
    const data: DataSet = {
      ...base,
      sales: [sale('s1', 7, 500000), sale('s2', 9, 120000)], // Sep sale after Aug closing
      profitClosings: [closing(500000)],
    };
    // Sep view: trading = 500k + 120k = 620k, minus closing 500k = 120k (the new profit only).
    expect(computeProfitLoss(data, { month: 9, year: 2026 }, true)).toBe(120000);
  });

  it('per-month: a July closing zeros JULY only and does NOT bleed into August', () => {
    // July sale 500k, closing dated July. Per-month (cumulative=false, how reports run).
    const julClosing: ProfitClosing = { id: 'pcJul', date: '2026-07-31', month: 7, year: 2026, amount: 500000, createdAt: now, updatedAt: now };
    const data: DataSet = { ...base, profitClosings: [julClosing] };
    const JUL = { month: 7, year: 2026 };
    expect(computeProfitLoss(data, JUL)).toBe(0);        // July: 500k − 500k closing = 0
    expect(computeProfitLoss(data, AUG)).toBe(0);        // Aug: no Aug sales, no Aug closing → 0 (NOT −500k)
  });
});
