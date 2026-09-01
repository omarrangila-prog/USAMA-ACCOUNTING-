import { describe, it, expect } from 'vitest';
import {
  computeTrialBalance, computeExpenseNet, expenseClosingAmountFor,
  netPositionClosingAmountFor, computeCashBookSummary, computeStock,
  computePartyBalances, yearDataset, YEAR_PERIOD, type DataSet, type ProfitClosing,
} from './accounting';
import { buildSections } from './reportBuilder';
import type { Purchase, Sale, CashTransaction, Expense, Party } from '@/types';

/**
 * Trial Balance: clearing the Expenses line, and holding Net Position at 0.
 * Both move only the reported figure — every underlying record stays put.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const party: Party = { id: 'P1', name: 'Ali', openingBalance: 0, createdAt: now, updatedAt: now };
const data: DataSet = {
  parties: [party], bondTypes: [{ id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now }],
  purchases: [{ id: 'pu1', partyId: 'P1', bondTypeId: 'b1', quantity: 100, rate: 1000, amount: 100000, payment: 'credit', date: '2026-08-05', ...meta(8) } as Purchase],
  sales: [{ id: 'sa1', partyId: 'P1', bondTypeId: 'b1', quantity: 40, rate: 1200, amount: 48000, receipt: 'credit', costOfGoods: 40000, profit: 8000, date: '2026-08-20', ...meta(8) } as Sale],
  cash: [{ id: 'c1', partyId: 'P1', direction: 'received', amount: 30000, date: '2026-08-25', ...meta(8) } as CashTransaction],
  partyAdjustments: [],
  expenses: [{ id: 'e1', kind: 'expense', category: 'Rent', amount: 18603, date: '2026-08-10', ...meta(8) } as Expense],
  closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };
const closing = (amount: number): ProfitClosing =>
  ({ id: 'x', date: '2026-08-31', month: 8, year: 2026, amount, createdAt: now, updatedAt: now });

describe('Expenses line in the Trial Balance', () => {
  it('is there with a value to begin with', () => {
    const row = computeTrialBalance(data, AUG).rows.find((r) => r.name === 'Expenses');
    expect(row?.debit).toBe(18603);
  });

  it('disappears entirely once expenses are zeroed — no value standing', () => {
    const zeroed = { ...data, expenseClosings: [closing(expenseClosingAmountFor(data, AUG))] };
    expect(computeExpenseNet(zeroed, AUG).expense).toBe(0);
    expect(computeTrialBalance(zeroed, AUG).rows.find((r) => r.name === 'Expenses')).toBeUndefined();
  });

  it('the Business Summary report drops the line too', () => {
    const zeroed = { ...data, expenseClosings: [closing(expenseClosingAmountFor(data, AUG))] };
    const section = buildSections(zeroed, AUG, 'trial').find((s) => s.title === 'Business Summary')!;
    expect(section.rows.some((r) => r[0] === 'Expenses')).toBe(false);
  });
});

describe('Net Position', () => {
  it('is non-zero to begin with', () => {
    expect(computeTrialBalance(data, AUG).netPosition).not.toBe(0);
  });

  it('a closing brings it to exactly 0, negative figure included', () => {
    const amount = netPositionClosingAmountFor(data, AUG);
    expect(amount).toBe(computeTrialBalance(data, AUG).netPosition);
    const zeroed = { ...data, netBalanceClosings: [closing(amount)] };
    expect(computeTrialBalance(zeroed, AUG).netPosition).toBe(0);
  });

  it('the report foot shows 0 as well — one figure everywhere', () => {
    const zeroed = { ...data, netBalanceClosings: [closing(netPositionClosingAmountFor(data, AUG))] };
    const section = buildSections(zeroed, AUG, 'trial').find((s) => s.title === 'Business Summary')!;
    expect(section.foot![0]).toContain('Net Position');
    expect(section.foot![1]).toBe('Rs 0');
  });

  it('every row above it keeps its own value', () => {
    const zeroed = { ...data, netBalanceClosings: [closing(netPositionClosingAmountFor(data, AUG))] };
    expect(computeTrialBalance(zeroed, AUG).rows).toEqual(computeTrialBalance(data, AUG).rows);
  });

  it('no cash, stock, receivable or payable record is disturbed', () => {
    const zeroed = { ...data, netBalanceClosings: [closing(netPositionClosingAmountFor(data, AUG))] };
    expect(computeCashBookSummary(zeroed, AUG).cashInHand).toBe(computeCashBookSummary(data, AUG).cashInHand);
    expect(computeStock(zeroed, AUG)).toEqual(computeStock(data, AUG));
    expect(computePartyBalances(zeroed, AUG)).toEqual(computePartyBalances(data, AUG));
    expect(zeroed.sales).toEqual(data.sales);
    expect(zeroed.purchases).toEqual(data.purchases);
  });

  it('survives the All Year view — the offset is not dropped', () => {
    const zeroed = { ...data, netBalanceClosings: [closing(netPositionClosingAmountFor(data, AUG))] };
    const yData = yearDataset(zeroed, 2026);
    // Every closing must be stamped into the year period, or the year report
    // silently shows the un-offset figure again.
    expect(yData.netBalanceClosings).toHaveLength(1);
    expect(yData.netBalanceClosings![0].month).toBe(YEAR_PERIOD(2026).month);
  });

  it('does not reach into another month', () => {
    const zeroed = { ...data, netBalanceClosings: [closing(netPositionClosingAmountFor(data, AUG))] };
    const SEP = { month: 9, year: 2026 };
    expect(computeTrialBalance(zeroed, SEP).netPosition)
      .toBe(computeTrialBalance(data, SEP).netPosition);
  });
});
