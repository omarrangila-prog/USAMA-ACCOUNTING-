import { describe, it, expect } from 'vitest';
import { computeCashInHand, computeProfitLoss, computeTrialBalance, computeFinancials, type DataSet } from './accounting';
import type { Expense, Sale, CashTransaction } from '@/types';

/**
 * Expenses (and income) must NOT affect Cash in Hand — they only affect
 * Profit/Loss and post to their own Expense / Income account.
 */
const now = Date.now();
const P = { month: 7, year: 2026 };
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const expense = (id: string, amount: number): Expense => ({ id, kind: 'expense', category: 'Rent', amount, date: '2026-07-05', ...meta });
const income = (id: string, amount: number): Expense => ({ id, kind: 'income', category: 'Other', amount, date: '2026-07-05', ...meta });
const cashSale = (id: string, amount: number): Sale => ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: 0, profit: amount, date: '2026-07-03', ...meta });
const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
} as DataSet);

describe('Expense treatment', () => {
  it('example: expense 2,000, no cash → Cash in Hand 0, Profit 0 (expense not in profit)', () => {
    const data = dataset({ expenses: [expense('e', 2000)] });
    expect(computeCashInHand(data, P)).toBe(0);
    expect(computeFinancials(data, P).cashInHand).toBe(0);
    expect(computeProfitLoss(data, P)).toBe(0); // profit = trading only; expense excluded
  });

  it('expense does NOT reduce profit and does NOT touch cash', () => {
    // Cash sale 700k (no matching purchase → cost 0 → trading profit 700k).
    // Expense 100k must NOT change either profit or cash.
    const data = dataset({ sales: [cashSale('s', 700000)], expenses: [expense('e', 100000)] });
    expect(computeCashInHand(data, P)).toBe(700000);   // expense not deducted from cash
    expect(computeProfitLoss(data, P)).toBe(700000);   // expense not deducted from profit
  });

  it('income does NOT add to cash NOR to profit (trading only)', () => {
    const data = dataset({ expenses: [income('i', 50000)] });
    expect(computeCashInHand(data, P)).toBe(0);
    expect(computeProfitLoss(data, P)).toBe(0);
  });

  it('Trial Balance shows an Expenses account (not inside Cash in Hand)', () => {
    const data = dataset({ expenses: [expense('e', 2000)] });
    const tb = computeTrialBalance(data, P);
    const expRow = tb.rows.find((r) => r.name === 'Expenses');
    expect(expRow).toBeTruthy();
    expect(expRow!.debit).toBe(2000);
    const cashRow = tb.rows.find((r) => r.name === 'Cash in Hand')!;
    expect(cashRow.debit).toBe(0); // expense not folded into cash
    expect(cashRow.credit).toBe(0);
  });
});
