import { describe, it, expect } from 'vitest';
import {
  computeFinancials,
  computeDashboard,
  computeBusinessSummary,
  computePartyBalances,
  computeCashInHand,
  computeLedger,
  ledgerRunningBalance,
  type DataSet,
} from './accounting';
import { buildSections } from './reportBuilder';
import { money } from './exportPdf';
import type { Party, Purchase, Sale, CashTransaction } from '@/types';

/**
 * Reconciliation validation (client feedback rules 2–4).
 *
 * Contract now enforced by the store:
 *   - Purchase/Sale WITH a named party => credit → updates that party's
 *     outstanding balance, NO immediate Cash-in-Hand effect.
 *   - Purchase/Sale WITHOUT a party => cash → hits Cash in Hand only.
 *
 * These records are shaped exactly as dataStore.addPurchase/addSale now build
 * them (payment/receipt = partyId ? 'credit' : 'cash').
 */
const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };

function party(id: string, name: string): Party {
  return { id, name, openingBalance: 0, createdAt: now, updatedAt: now };
}
// Mirror the store's rule: named party ⇒ credit, else cash.
function purchase(id: string, partyId: string, amount: number): Purchase {
  return { id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount, payment: partyId ? 'credit' : 'cash', date: '2026-07-03', ...meta };
}
function sale(id: string, partyId: string, amount: number): Sale {
  return { id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: partyId ? 'credit' : 'cash', costOfGoods: 0, profit: amount, date: '2026-07-03', ...meta };
}
function cash(id: string, partyId: string, dir: 'received' | 'paid', amount: number): CashTransaction {
  return { id, partyId, direction: dir, amount, date: '2026-07-05', ...meta };
}
// Manual receivable (+) / payable (−) — the ONLY thing that builds a party balance now.
function adj(id: string, partyId: string, amount: number) {
  return { id, partyId, amount, reason: amount > 0 ? 'Receivable' : 'Payable', date: '2026-07-02', ...meta };
}
function dataset(over: Partial<DataSet>): DataSet {
  return {
    parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
    purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
  } as DataSet;
}

/**
 * Full reconciliation assertion: after any change, EVERY module reads the same
 * numbers from the one engine. Fails loudly if any screen is out of sync.
 */
function assertReconciled(data: DataSet, partyId: string) {
  const fin = computeFinancials(data, P);
  const bal = computePartyBalances(data, P).find((b) => b.partyId === partyId)!;

  // Party ledger running balance ends exactly at the party's net balance.
  const run = ledgerRunningBalance(computeLedger(data, partyId, P));
  expect(run[run.length - 1]).toBe(bal.balance);

  // Dashboard == Business Summary == engine.
  const d = computeDashboard(data, P);
  const bs = computeBusinessSummary(data, P);
  expect(d.cashInHand).toBe(fin.cashInHand);
  expect(bs.cashInHand).toBe(fin.cashInHand);
  expect(d.cashReceivable).toBe(fin.netReceivable);
  expect(d.cashPayable).toBe(fin.netPayable);
  expect(bs.netReceivable).toBe(fin.netReceivable);
  expect(bs.netPayable).toBe(fin.netPayable);

  // Balance Sheet report totals == engine.
  const bsec = buildSections(data, P, 'balance');
  const sum = bsec.find((s) => s.title === 'SUMMARY')!;
  const metric = (label: string) => sum.rows.find((r) => r[0] === label)?.[1];
  expect(metric('Pending Receivable')).toBe(money(fin.netReceivable));
  expect(metric('Pending Payable')).toBe(money(fin.netPayable));
  expect(metric('Cash in Hand')).toBe(money(fin.cashInHand));
}

describe('Reconciliation — receivable/payable come from manual entries only', () => {
  it('a credit SALE does NOT change the party balance (only manual receivable does)', () => {
    const data = dataset({ parties: [party('A', 'Ali')], sales: [sale('s1', 'A', 500000)] });
    expect(computePartyBalances(data, P).find((b) => b.partyId === 'A')!.balance).toBe(0);
    expect(computeFinancials(data, P).netReceivable).toBe(0);
    assertReconciled(data, 'A');
  });

  it('manual RECEIVABLE builds the balance; cash unchanged, all screens sync', () => {
    const data = dataset({ parties: [party('A', 'Ali')], partyAdjustments: [adj('r', 'A', 500000)] });
    expect(computePartyBalances(data, P).find((b) => b.partyId === 'A')!.balance).toBe(500000);
    expect(computeFinancials(data, P).netReceivable).toBe(500000);
    expect(computeCashInHand(data, P)).toBe(0);
    assertReconciled(data, 'A');
  });

  it('manual PAYABLE builds the balance; cash unchanged, all screens sync', () => {
    const data = dataset({ parties: [party('A', 'Ali')], partyAdjustments: [adj('p', 'A', -300000)] });
    expect(computePartyBalances(data, P).find((b) => b.partyId === 'A')!.balance).toBe(-300000);
    expect(computeFinancials(data, P).netPayable).toBe(300000);
    expect(computeCashInHand(data, P)).toBe(0);
    assertReconciled(data, 'A');
  });

  it('Cash Receivable (received) increases receivable; Cash Payable (paid) increases payable', () => {
    // Name-matches-card: received => +receivable, paid => -payable.
    const rec = dataset({ parties: [party('A', 'Ali')], cash: [cash('c1', 'A', 'received', 500000)] });
    expect(computePartyBalances(rec, P).find((b) => b.partyId === 'A')!.balance).toBe(500000); // receivable
    expect(computeFinancials(rec, P).netReceivable).toBe(500000);
    expect(computeCashInHand(rec, P)).toBe(500000);

    const pay = dataset({ parties: [party('A', 'Ali')], cash: [cash('c2', 'A', 'paid', 500000)] });
    expect(computePartyBalances(pay, P).find((b) => b.partyId === 'A')!.balance).toBe(-500000); // payable
    expect(computeFinancials(pay, P).netPayable).toBe(500000);
    expect(computeCashInHand(pay, P)).toBe(-500000);
  });

  it('Cash Receivable 5k then Cash Payable 3k on one party nets to Receivable 2k', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      cash: [cash('c1', 'A', 'received', 5000), cash('c2', 'A', 'paid', 3000)],
    });
    expect(computePartyBalances(data, P).find((b) => b.partyId === 'A')!.balance).toBe(2000); // +5000 −3000
    expect(computeFinancials(data, P).netReceivable).toBe(2000);
    expect(computeFinancials(data, P).netPayable).toBe(0);
    expect(computeCashInHand(data, P)).toBe(2000);
  });

  it('NO-party sale stays cash: hits Cash in Hand, no party balance', () => {
    const data = dataset({ sales: [sale('s1', '', 400000)] });
    expect(computeCashInHand(data, P)).toBe(400000);
    expect(computeFinancials(data, P).netReceivable).toBe(0);
    expect(computeFinancials(data, P).netPayable).toBe(0);
  });
});

describe('Reconciliation — create / edit / delete keep everything in sync', () => {
  it('EDIT a manual receivable amount → party balance & all reports follow', () => {
    const before = dataset({ parties: [party('A', 'Ali')], partyAdjustments: [adj('r', 'A', 500000)] });
    expect(computeFinancials(before, P).netReceivable).toBe(500000);
    const after = dataset({ parties: [party('A', 'Ali')], partyAdjustments: [adj('r', 'A', 200000)] });
    expect(computePartyBalances(after, P).find((b) => b.partyId === 'A')!.balance).toBe(200000);
    expect(computeFinancials(after, P).netReceivable).toBe(200000);
    assertReconciled(after, 'A');
  });

  it('DELETE a manual payable → payable clears, everything recomputes', () => {
    const withP = dataset({ parties: [party('A', 'Ali')], partyAdjustments: [adj('p', 'A', -300000)] });
    expect(computeFinancials(withP, P).netPayable).toBe(300000);
    const afterDelete = dataset({ parties: [party('A', 'Ali')] });
    expect(computePartyBalances(afterDelete, P).find((b) => b.partyId === 'A')!.balance).toBe(0);
    expect(computeFinancials(afterDelete, P).netPayable).toBe(0);
    assertReconciled(afterDelete, 'A');
  });

  it('mixed manual: receivable 400k + payable 1000k → net payable 600k, synced', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      partyAdjustments: [adj('r', 'A', 400000), adj('p', 'A', -1000000)],
    });
    expect(computePartyBalances(data, P).find((b) => b.partyId === 'A')!.balance).toBe(-600000);
    expect(computeFinancials(data, P).netPayable).toBe(600000);
    expect(computeFinancials(data, P).netReceivable).toBe(0);
    assertReconciled(data, 'A');
  });

  it('a SALE does NOT move the party balance (only manual entries do)', () => {
    const withSale = dataset({ parties: [party('A', 'Ali')], sales: [sale('s1', 'A', 123456)] });
    expect(computePartyBalances(withSale, P).find((b) => b.partyId === 'A')!.balance).toBe(0);
    const withAdj = dataset({ parties: [party('A', 'Ali')], partyAdjustments: [adj('r', 'A', 123456)] });
    expect(computePartyBalances(withAdj, P).find((b) => b.partyId === 'A')!.balance).toBe(123456);
  });
});
