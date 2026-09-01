import { describe, it, expect } from 'vitest';
import { yearDataset, computeProfitLoss, YEAR_PERIOD, type DataSet } from './accounting';
import type { Sale } from '@/types';

/**
 * yearDataset aggregates into one period so the per-month report builders sum
 * every month together (single merged annual report).
 *
 * Totals are continuous, so "the 2026 year view" means the position AS AT the
 * end of 2026 — earlier years are carried in, not dropped. Anything dated after
 * the year is still excluded.
 */
const now = Date.now();
const meta = (m: number, y = 2026) => ({ month: m, year: y, createdAt: now, updatedAt: now });
const cashSale = (id: string, m: number, amount: number, y = 2026): Sale =>
  ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: 0, profit: amount, date: `${y}-${String(m).padStart(2, '0')}-10`, ...meta(m, y) });

const data: DataSet = {
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [],
  sales: [cashSale('jul', 7, 500000), cashSale('aug', 8, 300000), cashSale('prev', 5, 999, 2025)],
  cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null,
};

describe('Full-year aggregated report', () => {
  it('carries earlier years in and stamps everything to one period', () => {
    const yData = yearDataset(data, 2026);
    // The 2025 sale carries in too; all three are stamped to the year period.
    expect(yData.sales.length).toBe(3);
    expect(yData.sales.every((s) => s.month === YEAR_PERIOD(2026).month && s.year === 2026)).toBe(true);
  });

  it('excludes anything dated after the year', () => {
    const withFuture = { ...data, sales: [...data.sales, cashSale('next', 3, 12345, 2027)] };
    expect(yearDataset(withFuture, 2026).sales.map((s) => s.id).sort())
      .toEqual(['aug', 'jul', 'prev']);
  });

  it('year profit is the running total as at the end of the year', () => {
    const yData = yearDataset(data, 2026);
    // 999 (2025) + 500k (Jul) + 300k (Aug) = 800,999, cost 0.
    expect(computeProfitLoss(yData, YEAR_PERIOD(2026))).toBe(800999);
  });
});
