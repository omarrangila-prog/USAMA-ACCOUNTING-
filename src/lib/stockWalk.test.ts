import { describe, it, expect } from 'vitest';
import { computeStock, computeBondMovement, avgCostFor, type DataSet } from './accounting';
import type { Purchase, Sale, MonthlyClosing } from '@/types';

/**
 * A month with no closing snapshot must open exactly where the previous month
 * closed — same quantity, same average cost, same value.
 *
 * The failure this pins down: when the previous month wasn't closed, its
 * closing used to be rebuilt as ONE weighted average over the whole history.
 * Stock costing is month-by-month, which weights an older purchase only by the
 * quantity still on hand when the next month opens. Sell between two purchases
 * at different prices and the two methods disagree — the live data opened
 * October 277,310 above September's close with no October entries at all.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const pu = (id: string, m: number, q: number, rate: number): Purchase =>
  ({ id, partyId: 'P', bondTypeId: 'b1', quantity: q, rate, amount: q * rate, payment: 'credit', date: `2026-${String(m).padStart(2, '0')}-05`, ...meta(m) });
const sa = (id: string, m: number, q: number, rate: number): Sale =>
  ({ id, partyId: 'P', bondTypeId: 'b1', quantity: q, rate, amount: q * rate, receipt: 'credit', costOfGoods: 0, profit: 0, date: `2026-${String(m).padStart(2, '0')}-20`, ...meta(m) });

// Jul: buy 100 @ 1,000, sell 90  → 10 left @ 1,000
// Aug: buy 100 @ 2,000           → (10×1,000 + 200,000) / 110 = 1,909.09
// A whole-history average would say (100,000 + 200,000) / 200 = 1,500 — wrong.
const base: DataSet = {
  parties: [{ id: 'P', name: 'P', openingBalance: 0, createdAt: now, updatedAt: now }],
  bondTypes: [{ id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now }],
  purchases: [pu('p1', 7, 100, 1000), pu('p2', 8, 100, 2000)],
  sales: [sa('s1', 7, 90, 1100)],
  cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null,
};
const JUL = { month: 7, year: 2026 }, AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 }, OCT = { month: 10, year: 2026 };

describe('Stock carries month by month when a month was never closed', () => {
  it('uses the month-by-month average, not a whole-history one', () => {
    const aug = computeStock(base, AUG)[0];
    expect(aug.openingQty).toBe(10);
    expect(aug.avgCost).toBe(1909.09);
    expect(aug.avgCost).not.toBe(1500);
  });

  it('a month with no activity opens exactly where the last one closed', () => {
    const aug = computeStock(base, AUG)[0];
    const sep = computeStock(base, SEP)[0];
    expect(sep.openingQty).toBe(aug.closingQty);
    expect(sep.avgCost).toBe(aug.avgCost);
    // Within paisa: average cost is carried at 2 decimals — exactly what a
    // closing snapshot stores — so value is qty × 1,909.09, not × 1,909.0909….
    expect(Math.abs(sep.closingValue - aug.closingValue)).toBeLessThan(1);
  });

  it('carries through several unclosed months with no drift', () => {
    const aug = computeStock(base, AUG)[0];
    const oct = computeStock(base, OCT)[0];
    expect(oct.closingQty).toBe(aug.closingQty);
    expect(oct.avgCost).toBe(aug.avgCost);
    expect(Math.abs(oct.closingValue - aug.closingValue)).toBeLessThan(1);
    // ...and once carried, it stops moving: October equals September exactly.
    expect(oct).toEqual({ ...computeStock(base, SEP)[0] });
  });

  it('gives the same answer as a closing snapshot would', () => {
    // Close August the way resyncClosing does, then compare September.
    const snap: MonthlyClosing = {
      id: '2026-08', month: 8, year: 2026, closedAt: now, closedBy: 't',
      stockSnapshot: computeStock(base, AUG), partyBalances: [], summary: {} as any,
    };
    const withSnapshot = computeStock({ ...base, closings: [snap] }, SEP)[0];
    const walked = computeStock(base, SEP)[0];
    expect(walked).toEqual(withSnapshot);
  });

  it('the Stock page movement and sale costing agree with it', () => {
    expect(computeBondMovement(base, SEP)[0].netQty).toBe(computeStock(base, AUG)[0].closingQty);
    expect(avgCostFor(base, 'b1', SEP)).toBe(computeStock(base, AUG)[0].avgCost);
  });

  it('July (nothing before it) still opens at zero', () => {
    expect(computeStock(base, JUL)[0].openingQty).toBe(0);
  });
});
