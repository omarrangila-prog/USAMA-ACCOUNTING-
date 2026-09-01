import { describe, it, expect } from 'vitest';
import {
  profitClosingAmountFor, expenseClosingAmountFor, computeProfitLoss, computeExpenseNet,
  computeCashBookSummary, type DataSet, type ProfitClosing,
} from './accounting';
import type { Purchase, Sale, Expense } from '@/types';

/**
 * Zeroing a month that is at a LOSS. The closing amount is negative there, and
 * a sign slip would DOUBLE the loss instead of clearing it — so this pins the
 * exact arithmetic the "Set Profit & Expense to 0" button runs.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const bond = { id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now };
// Bought 100 @ 1000, sold 40 @ 600 → cost 40x1000, revenue 24,000 → loss 16,000.
const purchase: Purchase = { id: 'pu1', partyId: 'P1', bondTypeId: 'b1', quantity: 100, rate: 1000, amount: 100000, payment: 'credit', date: '2026-08-05', ...meta(8) };
const sale: Sale = { id: 'sa1', partyId: 'P1', bondTypeId: 'b1', quantity: 40, rate: 600, amount: 24000, receipt: 'credit', costOfGoods: 40000, profit: -16000, date: '2026-08-20', ...meta(8) };

const base: DataSet = {
  parties: [{ id: 'P1', name: 'Ali', openingBalance: 0, createdAt: now, updatedAt: now }],
  bondTypes: [bond], purchases: [purchase], sales: [sale], cash: [],
  partyAdjustments: [], expenses: [{ id: 'e1', kind: 'expense', category: 'Rent', amount: 18603, date: '2026-08-10', ...meta(8) } as Expense],
  closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };

const applied = (data: DataSet, amount: number): DataSet => ({
  ...data,
  profitClosings: [{ id: 'pc', date: '2026-08-31', month: 8, year: 2026, amount, createdAt: now, updatedAt: now } as ProfitClosing],
});

describe('Setting a LOSS to zero', () => {
  it('the month really is at a loss to begin with', () => {
    expect(computeProfitLoss(base, AUG)).toBeLessThan(0);
  });

  it('the closing amount equals the loss (negative), and lands profit on 0', () => {
    const amount = profitClosingAmountFor(base, AUG);
    expect(amount).toBe(computeProfitLoss(base, AUG));
    expect(amount).toBeLessThan(0);
    expect(computeProfitLoss(applied(base, amount), AUG)).toBe(0);
  });

  it('does NOT double the loss — the classic sign slip', () => {
    const amount = profitClosingAmountFor(base, AUG);
    const after = computeProfitLoss(applied(base, amount), AUG);
    expect(after).not.toBe(computeProfitLoss(base, AUG) * 2);
    expect(after).toBe(0);
  });

  it('re-zeroing an already-zeroed month is a no-op, not a double offset', () => {
    const once = applied(base, profitClosingAmountFor(base, AUG));
    // The button replaces the existing closing with this freshly computed one.
    const again = applied(once, profitClosingAmountFor(once, AUG));
    expect(computeProfitLoss(again, AUG)).toBe(0);
  });

  it('the loss stays cleared in later months instead of reappearing', () => {
    const zeroed = applied(base, profitClosingAmountFor(base, AUG));
    expect(computeProfitLoss(zeroed, SEP)).toBe(0);
  });

  it('expenses zero the same way, and Cash in Hand is untouched', () => {
    const amount = expenseClosingAmountFor(base, AUG);
    expect(amount).toBe(18603);
    const zeroed = { ...base, expenseClosings: [{ id: 'ec', date: '2026-08-31', month: 8, year: 2026, amount, createdAt: now, updatedAt: now } as ProfitClosing] };
    expect(computeExpenseNet(zeroed, AUG).expense).toBe(0);
    expect(computeCashBookSummary(zeroed, AUG).cashInHand).toBe(computeCashBookSummary(base, AUG).cashInHand);
  });

  it('sales, purchases and stock are all left alone', () => {
    const zeroed = applied(base, profitClosingAmountFor(base, AUG));
    expect(zeroed.sales).toEqual(base.sales);
    expect(zeroed.purchases).toEqual(base.purchases);
  });
});
