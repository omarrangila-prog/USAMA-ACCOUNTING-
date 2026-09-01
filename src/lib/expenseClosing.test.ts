import { describe, it, expect } from 'vitest';
import {
  computeExpenseNet, expenseClosingOffset, computeDashboard, computeCashBookSummary,
  type DataSet, type ProfitClosing,
} from './accounting';
import type { Expense } from '@/types';

/**
 * One-time Expense Closing: a dated closing is subtracted from the month's
 * expense total, bringing reported Total Expense to 0 for that month. The
 * expense RECORDS are never touched, Cash in Hand is unaffected (expenses don't
 * move cash in this book), and the closing does not bleed into other months.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const expense = (id: string, m: number, amount: number, kind: 'expense' | 'income' = 'expense'): Expense =>
  ({ id, kind, category: 'Shop', amount, date: `2026-0${m}-10`, ...meta(m) } as Expense);
const closing = (m: number, amount: number): ProfitClosing =>
  ({ id: `ec${m}`, date: `2026-0${m}-31`, month: m, year: 2026, amount, createdAt: now, updatedAt: now });

const base: DataSet = {
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], partyAdjustments: [], closings: [], opening: null,
  expenses: [expense('e1', 8, 30000), expense('e2', 8, 12000), expense('e3', 7, 9000), expense('i1', 8, 5000, 'income')],
};
const AUG = { month: 8, year: 2026 };
const JUL = { month: 7, year: 2026 };

describe('Expense Closing adjustment', () => {
  it('without a closing, the month shows its full expense total', () => {
    expect(computeExpenseNet(base, AUG).expense).toBe(42000);
  });

  it('a closing equal to the total brings reported Total Expense to 0', () => {
    const data = { ...base, expenseClosings: [closing(8, 42000)] };
    expect(computeExpenseNet(data, AUG).expense).toBe(0);
    expect(computeDashboard(data, AUG).totalExpense).toBe(0);
  });

  it('income is NOT touched by an expense closing', () => {
    const data = { ...base, expenseClosings: [closing(8, 42000)] };
    expect(computeExpenseNet(data, AUG).income).toBe(5000);
    expect(computeExpenseNet(data, AUG).net).toBe(5000);
  });

  it('the expense records themselves survive — nothing is deleted', () => {
    const data = { ...base, expenseClosings: [closing(8, 42000)] };
    expect(data.expenses!.filter((e) => e.month === 8 && e.kind === 'expense')).toHaveLength(2);
  });

  it('is PER-MONTH: an August closing does not zero July', () => {
    const data = { ...base, expenseClosings: [closing(8, 42000)] };
    expect(computeExpenseNet(data, JUL).expense).toBe(9000);
    expect(expenseClosingOffset(data, JUL)).toBe(0);
  });

  it('expenses added AFTER the closing accumulate from 0 again', () => {
    const data = {
      ...base,
      expenses: [...base.expenses!, expense('e4', 8, 7500)],
      expenseClosings: [closing(8, 42000)],
    };
    expect(computeExpenseNet(data, AUG).expense).toBe(7500);
  });

  it('Cash in Hand is unaffected by an expense closing', () => {
    const noClosing = computeCashBookSummary(base, AUG).cashInHand;
    const withClosing = computeCashBookSummary({ ...base, expenseClosings: [closing(8, 42000)] }, AUG).cashInHand;
    expect(withClosing).toBe(noClosing);
  });

  it('no closings at all behaves exactly as before (offset is 0)', () => {
    expect(expenseClosingOffset(base, AUG)).toBe(0);
    expect(computeExpenseNet(base, AUG).expense).toBe(42000);
  });
});
