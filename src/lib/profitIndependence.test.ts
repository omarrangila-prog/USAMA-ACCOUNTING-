import { describe, it, expect } from 'vitest';
import { computeFinancials, computeCashInHand, computeProfitLoss, computeBusinessSummary, type DataSet } from './accounting';
import type { Party, PartyAdjustment, Sale, Purchase, Expense } from '@/types';

/**
 * Independence rules (accounting logic):
 *   Receivable / Payable  = party balances only  (NEVER include profit)
 *   Cash Flow             = Receivable − Payable
 *   Cash in Hand          = physical cash only    (NEVER affected by profit)
 *   Profit                = Sale − Cost of Sales (trading only; expenses excluded,
 *                           never folded into Receivable/Payable)
 */
const now = Date.now();
const P = { month: 7, year: 2026 };
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const adj = (id: string, pid: string, amount: number): PartyAdjustment => ({ id, partyId: pid, amount, reason: 'x', date: '2026-07-02', ...meta });
const cashSale = (id: string, amount: number, cost: number): Sale => ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: cost, profit: amount - cost, date: '2026-07-03', ...meta });
const cashPurchase = (id: string, amount: number): Purchase => ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, payment: 'cash', date: '2026-07-03', ...meta });
const expense = (id: string, amount: number): Expense => ({ id, kind: 'expense', category: 'X', amount, date: '2026-07-05', ...meta });
const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
} as DataSet);

describe('Profit independence from Receivable / Payable / Cash', () => {
  it('spec example: Rec 2,600,000, Pay 2,500,000, Profit 100,000', () => {
    const data = dataset({
      parties: [party('A', 'A'), party('B', 'B')],
      partyAdjustments: [adj('r', 'A', 2600000), adj('p', 'B', -2500000)],
    });
    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(2600000);
    expect(fin.netPayable).toBe(2500000);
    expect(fin.netReceivable - fin.netPayable).toBe(100000); // Cash Flow
    expect(computeCashInHand(data, P)).toBe(0);               // no actual cash
  });

  it('adding a profitable CASH sale does NOT change receivable/payable', () => {
    const base = dataset({ parties: [party('A', 'A')], partyAdjustments: [adj('r', 'A', 500000)] });
    const withProfit = dataset({
      parties: [party('A', 'A')],
      partyAdjustments: [adj('r', 'A', 500000)],
      // profit 300k, but it's a cash sale — must not touch receivable
      sales: [cashSale('s', 400000, 100000)],
      purchases: [cashPurchase('cp', 100000)], // provides cost basis
    });
    expect(computeFinancials(base, P).netReceivable).toBe(500000);
    expect(computeFinancials(withProfit, P).netReceivable).toBe(500000); // unchanged by profit
    // profit shows up only in the profit figure
    expect(computeBusinessSummary(withProfit, P).totalProfitLoss).toBe(300000);
  });

  it('expense affects neither cash nor profit (trading-only profit)', () => {
    // Cash sale 700k with 200k cost → trading 500k. Expense 50k changes nothing.
    const data = dataset({
      sales: [cashSale('s', 700000, 200000)],
      purchases: [cashPurchase('cp', 200000)],
      expenses: [expense('e', 50000)],
    });
    // Physical cash = +700k sale − 200k purchase = 500k.
    expect(computeCashInHand(data, P)).toBe(500000);
    // Profit = trading only = 700k − 200k = 500k (expense excluded).
    expect(computeProfitLoss(data, P)).toBe(500000);
  });
});
