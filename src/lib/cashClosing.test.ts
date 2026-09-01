import { describe, it, expect } from 'vitest';
import {
  cashClosingAmountFor, cashClosingOffset, computeCashBookSummary, computeDashboard,
  computeTrialBalance, computeProfitLoss, computePartyBalances,
  type DataSet, type ProfitClosing,
} from './accounting';
import type { Purchase, Sale, CashTransaction } from '@/types';

/**
 * Cash in Hand closing: brings the REPORTED figure to 0 while every sale,
 * purchase and cash entry stays exactly as recorded. Same shape as the profit
 * and expense closings.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const bond = { id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now };
const purchase: Purchase = { id: 'pu1', partyId: 'P1', bondTypeId: 'b1', quantity: 100, rate: 1000, amount: 100000, payment: 'credit', date: '2026-08-05', ...meta(8) };
const sale: Sale = { id: 'sa1', partyId: 'P1', bondTypeId: 'b1', quantity: 40, rate: 1200, amount: 48000, receipt: 'credit', costOfGoods: 40000, profit: 8000, date: '2026-08-20', ...meta(8) };
const received: CashTransaction = { id: 'c1', partyId: 'P1', direction: 'received', amount: 30000, date: '2026-08-25', ...meta(8) };

const base: DataSet = {
  parties: [{ id: 'P1', name: 'Ali', openingBalance: 0, createdAt: now, updatedAt: now }],
  bondTypes: [bond], purchases: [purchase], sales: [sale], cash: [received],
  partyAdjustments: [], expenses: [], closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };
const zero = (data: DataSet, p = AUG): DataSet => ({
  ...data,
  cashClosings: [{ id: 'cc', date: '2026-08-31', month: p.month, year: p.year, amount: cashClosingAmountFor(data, p), createdAt: now, updatedAt: now } as ProfitClosing],
});

describe('Cash in Hand closing', () => {
  it('the figure is non-zero to begin with', () => {
    // (48,000 − 100,000) + 30,000 = −22,000
    expect(computeCashBookSummary(base, AUG).cashInHand).toBe(-22000);
  });

  it('brings Cash in Hand to 0, negative figure included', () => {
    const data = zero(base);
    expect(computeCashBookSummary(data, AUG).cashInHand).toBe(0);
    expect(computeDashboard(data, AUG).cashInHand).toBe(0);
  });

  it('the Trial Balance agrees — one figure everywhere', () => {
    const data = zero(base);
    const cashRow = computeTrialBalance(data, AUG).rows.find((r) => r.name === 'Cash in Hand')!;
    expect(cashRow.debit).toBe(0);
    expect(cashRow.credit).toBe(0);
  });

  it('no sale, purchase or cash record is touched', () => {
    const data = zero(base);
    expect(data.sales).toEqual(base.sales);
    expect(data.purchases).toEqual(base.purchases);
    expect(data.cash).toEqual(base.cash);
    const s = computeCashBookSummary(data, AUG);
    expect(s.totalSales).toBe(48000);
    expect(s.totalPurchases).toBe(100000);
    expect(s.totalReceived).toBe(30000);
  });

  it('profit and party balances are unaffected', () => {
    const data = zero(base);
    expect(computeProfitLoss(data, AUG)).toBe(computeProfitLoss(base, AUG));
    expect(computePartyBalances(data, AUG)).toEqual(computePartyBalances(base, AUG));
  });

  it('stays cleared in later months instead of reappearing', () => {
    expect(computeCashBookSummary(zero(base), SEP).cashInHand).toBe(0);
  });

  it('later cash movements accumulate from 0 again', () => {
    const data = zero(base);
    const withMore: DataSet = {
      ...data,
      cash: [...data.cash, { id: 'c2', partyId: 'P1', direction: 'received', amount: 5000, date: '2026-09-03', ...meta(9) } as CashTransaction],
    };
    expect(computeCashBookSummary(withMore, SEP).cashInHand).toBe(5000);
  });

  it('does not reach backwards into an earlier month', () => {
    expect(cashClosingOffset(zero(base), { month: 7, year: 2026 })).toBe(0);
  });

  it('a dataset with no closings is completely unaffected', () => {
    expect(cashClosingOffset(base, AUG)).toBe(0);
    expect(computeCashBookSummary(base, AUG).cashInHand).toBe(-22000);
  });
});
