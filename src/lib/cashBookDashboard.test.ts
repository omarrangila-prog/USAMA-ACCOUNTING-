import { describe, it, expect } from 'vitest';
import { computeBusinessSummary, computeCashBook, computeCashInHand, type DataSet } from './accounting';
import type { Sale, Purchase, CashTransaction, OpeningBalances } from '@/types';

const now = Date.now();
const P = { month: 7, year: 2026 };
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const sale = (id: string, amount: number): Sale =>
  ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: 0, profit: 0, date: '2026-07-03', ...meta });
const purchase = (id: string, amount: number): Purchase =>
  ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, payment: 'cash', date: '2026-07-03', ...meta });
const cash = (id: string, dir: 'received' | 'paid', amount: number): CashTransaction =>
  ({ id, partyId: 'A', direction: dir, amount, date: '2026-07-04', ...meta });
const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [{ id: 'A', name: 'Ali', openingBalance: 0, createdAt: now, updatedAt: now }],
  bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
} as DataSet);

describe('Dashboard: Total Sales / Total Purchases (amounts)', () => {
  it('sums sale and purchase amounts', () => {
    const data = dataset({ sales: [sale('s1', 300000), sale('s2', 200000)], purchases: [purchase('p1', 150000)] });
    const s = computeBusinessSummary(data, P);
    expect(s.totalSaleAmount).toBe(500000);
    expect(s.totalPurchaseAmount).toBe(150000);
  });
});

describe('Cash Book: opening cash + live balance', () => {
  const opening: OpeningBalances = {
    id: 'opening', asOf: { month: 7, year: 2026 },
    openingCash: 5000000, stock: [], parties: [], files: [], importedProfit: 0,
    source: 'cashbook_opening', createdAt: now,
  };

  it('current cash = opening + cash sales − cash purchases + received − paid', () => {
    // Opening 5,000,000; cash purchase −200,000; received +500,000; paid −100,000
    const data = dataset({
      opening,
      purchases: [purchase('p', 200000)],
      cash: [cash('r', 'received', 500000), cash('p2', 'paid', 100000)],
    });
    // 5,000,000 − 200,000 + 500,000 − 100,000 = 5,200,000  (the client's example)
    expect(computeCashInHand(data, P)).toBe(5200000);
  });

  it('cash book running balance ties to computeCashInHand', () => {
    const data = dataset({
      opening,
      sales: [sale('s', 300000)],
      cash: [cash('p2', 'paid', 100000)],
    });
    const lines = computeCashBook(data, P);
    let run = opening.openingCash!;
    lines.forEach((l) => (run += l.inflow - l.outflow));
    expect(run).toBe(computeCashInHand(data, P));  // 5,000,000 + 300,000 − 100,000 = 5,200,000
    expect(run).toBe(5200000);
  });
});
