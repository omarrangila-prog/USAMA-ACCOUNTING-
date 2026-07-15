import { describe, it, expect } from 'vitest';
import { computeCashBookSummary, type DataSet } from './accounting';
import type { Party, Purchase, Sale, CashTransaction, PartyAdjustment } from '@/types';

/**
 * Cash Book screen formula (client-specified):
 *   Cash in Hand = (Total Sales − Total Purchases) + (Received − Paid)
 * Profit, Receivable and Payable are separate figures, never folded into cash.
 */
const now = Date.now();
const P = { month: 7, year: 2026 };
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const sale = (id: string, amount: number, party = 'A'): Sale =>
  ({ id, partyId: party, bondTypeId: 'b1', quantity: 10, rate: amount / 10, amount, receipt: 'credit', costOfGoods: 0, profit: amount, date: '2026-07-03', ...meta });
const purchase = (id: string, amount: number, party = 'A'): Purchase =>
  ({ id, partyId: party, bondTypeId: 'b1', quantity: 10, rate: amount / 10, amount, payment: 'credit', date: '2026-07-02', ...meta });
const cash = (id: string, dir: 'received' | 'paid', amount: number): CashTransaction =>
  ({ id, partyId: 'A', direction: dir, amount, date: '2026-07-04', ...meta });
const adj = (id: string, amount: number): PartyAdjustment =>
  ({ id, partyId: 'A', amount, reason: 'x', date: '2026-07-05', ...meta });

const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [party('A', 'Ali')],
  bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], expenses: [], partyAdjustments: [], closings: [], opening: null, ...over,
} as DataSet);

describe('Cash Book summary formula', () => {
  it('Cash in Hand = Received − Paid (credit sales/purchases not in cash)', () => {
    const data = dataset({
      sales: [sale('s1', 3000), sale('s2', 1500)],       // credit → receivable, NOT cash
      purchases: [purchase('p1', 2000)],                 // credit → payable, NOT cash
      cash: [cash('c1', 'received', 800), cash('c2', 'paid', 300)],
    });
    const s = computeCashBookSummary(data, P);
    expect(s.totalSales).toBe(4500);
    expect(s.totalPurchases).toBe(2000);
    expect(s.totalReceived).toBe(800);
    expect(s.totalPaid).toBe(300);
    // Cash in Hand = Received − Paid = 800 − 300 = 500 (sales/purchases excluded).
    expect(s.cashInHand).toBe(500);
  });

  it('sale auto-builds receivable; profit separate; no cash without a receipt', () => {
    const data = dataset({
      sales: [sale('s', 2000)],                 // +2000 receivable (party A), profit 2000
      partyAdjustments: [adj('r', 1000), adj('p', -400)],
    });
    const s = computeCashBookSummary(data, P);
    expect(s.profit).toBe(2000);
    // Receivable = sale 2000 + adj 1000 − adj 400 = 2600 (all on party A).
    expect(s.receivable).toBe(2600);
    expect(s.payable).toBe(0);
    // No cash received/paid → Cash in Hand = 0 (the sale is a receivable, not cash).
    expect(s.cashInHand).toBe(0);
  });

  it('empty period is all zeros', () => {
    const s = computeCashBookSummary(dataset({}), P);
    expect(s.cashInHand).toBe(0);
    expect(s.profit).toBe(0);
    expect(s.txnCount).toBe(0);
  });
});
