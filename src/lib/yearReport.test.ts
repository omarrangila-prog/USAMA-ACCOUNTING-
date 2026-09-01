import { describe, it, expect } from 'vitest';
import { yearDataset, computeProfitLoss, YEAR_PERIOD, type DataSet } from './accounting';
import type { Sale } from '@/types';

/**
 * yearDataset aggregates a whole financial year into one period so the per-month
 * report builders sum every month together (single merged annual report).
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
  it('yearDataset keeps only the target year and stamps all months to one period', () => {
    const yData = yearDataset(data, 2026);
    // 2025 sale excluded; both 2026 sales kept and stamped to the year period.
    expect(yData.sales.length).toBe(2);
    expect(yData.sales.every((s) => s.month === YEAR_PERIOD(2026).month && s.year === 2026)).toBe(true);
  });

  it('year profit sums every month of the year', () => {
    const yData = yearDataset(data, 2026);
    // 500k (Jul) + 300k (Aug) = 800k, cost 0 -> profit 800k for the whole year.
    expect(computeProfitLoss(yData, YEAR_PERIOD(2026))).toBe(800000);
  });
});
