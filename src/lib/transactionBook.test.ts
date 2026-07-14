import { describe, it, expect } from 'vitest';
import { computeTransactionBook, computeCashInHand, type DataSet } from './accounting';
import type { Party, Purchase, Sale, CashTransaction, Expense, PartyAdjustment } from '@/types';

/**
 * The Cash Book is a pure projection over the existing collections: every
 * Purchase, Sale, Receipt, Payment, Expense and Adjustment must appear, and the
 * running cashDelta must reconcile with computeCashInHand.
 */
const now = Date.now();
const P = { month: 7, year: 2026 };
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const purchase = (id: string, amount: number, pay: 'cash' | 'credit'): Purchase =>
  ({ id, partyId: 'A', bondTypeId: 'b1', quantity: 10, rate: amount / 10, amount, payment: pay, date: '2026-07-02', ...meta });
const sale = (id: string, amount: number, rc: 'cash' | 'credit'): Sale =>
  ({ id, partyId: 'A', bondTypeId: 'b1', quantity: 10, rate: amount / 10, amount, receipt: rc, costOfGoods: 0, profit: amount, date: '2026-07-03', ...meta });
const cash = (id: string, dir: 'received' | 'paid', amount: number): CashTransaction =>
  ({ id, partyId: 'A', direction: dir, amount, date: '2026-07-04', ...meta });
const expense = (id: string, amount: number): Expense =>
  ({ id, kind: 'expense', category: 'Rent', amount, date: '2026-07-05', ...meta });
const adj = (id: string, amount: number): PartyAdjustment =>
  ({ id, partyId: 'A', amount, reason: 'x', date: '2026-07-06', ...meta });

const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [party('A', 'Ali')],
  bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], expenses: [], partyAdjustments: [], closings: [], opening: null, ...over,
} as DataSet);

describe('Cash Book — unified transaction view', () => {
  it('shows one row per transaction of every kind', () => {
    const data = dataset({
      purchases: [purchase('p', 1000, 'credit')],
      sales: [sale('s', 2000, 'cash')],
      cash: [cash('c', 'received', 500)],
      expenses: [expense('e', 300)],
      partyAdjustments: [adj('a', 400)],
    });
    const rows = computeTransactionBook(data, P);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.type).sort()).toEqual(
      ['Adjustment', 'Expense', 'Purchase', 'Receivable', 'Sale'].sort()
    );
  });

  it('running cashDelta reconciles with computeCashInHand', () => {
    const data = dataset({
      purchases: [purchase('p1', 1000, 'cash'), purchase('p2', 700, 'credit')],
      sales: [sale('s1', 3000, 'cash'), sale('s2', 900, 'credit')],
      cash: [cash('c1', 'received', 500), cash('c2', 'paid', 200)],
      expenses: [expense('e', 300)],           // non-cash → cashDelta 0
      partyAdjustments: [adj('a', 400)],        // non-cash → cashDelta 0
    });
    const rows = computeTransactionBook(data, P);
    const runningCash = rows.reduce((a, r) => a + r.cashDelta, 0);
    // cash = -1000 (buy) + 3000 (sale) + 500 (recv) - 200 (paid) = 2300
    expect(runningCash).toBe(2300);
    expect(runningCash).toBe(computeCashInHand(data, P));
  });

  it('credit trades and adjustments carry amount but zero cash effect', () => {
    const data = dataset({
      purchases: [purchase('p', 1000, 'credit')],
      partyAdjustments: [adj('a', 400)],
    });
    const rows = computeTransactionBook(data, P);
    expect(rows.find((r) => r.type === 'Purchase')!.amount).toBe(1000);
    expect(rows.find((r) => r.type === 'Purchase')!.cashDelta).toBe(0);
    expect(rows.find((r) => r.type === 'Adjustment')!.cashDelta).toBe(0);
  });

  it('only includes the selected period', () => {
    const other = { ...purchase('old', 500, 'cash'), month: 6 };
    const data = dataset({ purchases: [other, purchase('p', 100, 'cash')] });
    const rows = computeTransactionBook(data, P);
    expect(rows).toHaveLength(1);
    expect(rows[0].refId).toBe('p');
  });
});
