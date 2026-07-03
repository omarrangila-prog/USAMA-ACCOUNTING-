import { describe, it, expect } from 'vitest';
import { computeFinancials, type DataSet } from './accounting';
import type { Party, Sale, Purchase, CashTransaction } from '@/types';

/**
 * Monthly-closing cash consistency (QA items G & M). The store's closeMonth /
 * resyncClosing now snapshot fin.cashInHand / fin.netReceivable / fin.netPayable
 * straight from computeFinancials — so the carried-forward cash always equals
 * the dashboard/report cash. This test locks the engine values those snapshots
 * copy, and the cash-event rules (QA A–F).
 */
const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };

function party(id: string, name: string): Party {
  return { id, name, openingBalance: 0, createdAt: now, updatedAt: now };
}
function sale(id: string, partyId: string, amount: number): Sale {
  return { id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: partyId ? 'credit' : 'cash', costOfGoods: 0, profit: amount, date: '2026-07-03', ...meta };
}
function purchase(id: string, partyId: string, amount: number): Purchase {
  return { id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount, payment: partyId ? 'credit' : 'cash', date: '2026-07-03', ...meta };
}
function cash(id: string, dir: 'received' | 'paid', amount: number): CashTransaction {
  return { id, partyId: 'A', direction: dir, amount, date: '2026-07-05', ...meta };
}
function dataset(over: Partial<DataSet>): DataSet {
  return {
    parties: [party('A', 'Ali')], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
    purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
  } as DataSet;
}

describe('Cash-event rules (QA A–F) + closing snapshot (G, M)', () => {
  it('A. credit purchase does NOT affect cash', () => {
    expect(computeFinancials(dataset({ purchases: [purchase('p', 'A', 500000)] }), P).rawCash).toBe(0);
  });
  it('B. credit sale does NOT affect cash', () => {
    expect(computeFinancials(dataset({ sales: [sale('s', 'A', 500000)] }), P).rawCash).toBe(0);
  });
  it('C. cash sale (no party) INCREASES cash', () => {
    expect(computeFinancials(dataset({ sales: [sale('s', '', 700000)] }), P).rawCash).toBe(700000);
  });
  it('D. cash purchase (no party) DECREASES cash', () => {
    expect(computeFinancials(dataset({ purchases: [purchase('p', '', 500000)] }), P).rawCash).toBe(-500000);
  });
  it('E. cash received INCREASES cash', () => {
    expect(computeFinancials(dataset({ cash: [cash('c', 'received', 300000)] }), P).rawCash).toBe(300000);
  });
  it('F. cash paid DECREASES cash', () => {
    expect(computeFinancials(dataset({ cash: [cash('c', 'paid', 200000)] }), P).rawCash).toBe(-200000);
  });

  it('G/M. combined: closing cash = engine cash (single source of truth)', () => {
    // Cash events (no party): cash sale 700k − cash purchase 500k = +200k.
    // Party cash events (Ali): received 300k − paid 200k = +100k → rawCash 300k.
    // Ali also has a credit sale 400k. Ali net = 400k (sale) − 300k (received)
    //   + 200k (paid) = 300k receivable.
    const data = dataset({
      sales: [sale('cs', '', 700000), sale('cr', 'A', 400000)],
      purchases: [purchase('cp', '', 500000)],
      cash: [cash('r', 'received', 300000), cash('p', 'paid', 200000)],
    });
    const fin = computeFinancials(data, P);
    expect(fin.rawCash).toBe(300000);            // 700k -500k +300k -200k
    expect(fin.netReceivable).toBe(300000);      // Ali: 400k -300k +200k
    expect(fin.netPayable).toBe(0);
    // cashInHand = rawCash + netReceivable - netPayable (the value the monthly
    // closing snapshots — so carried-forward cash == dashboard cash).
    expect(fin.cashInHand).toBe(300000 + 300000 - 0);
    expect(fin.cashInHand).toBe(fin.rawCash + fin.netReceivable - fin.netPayable);
  });
});
