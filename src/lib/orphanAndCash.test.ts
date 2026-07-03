import { describe, it, expect } from 'vitest';
import {
  computeFinancials, computeCashInHand, computeDashboard, computeBusinessSummary,
  computeCashBook, computePartyBalances, type DataSet,
} from './accounting';
import type { Party, Purchase, PartyAdjustment } from '@/types';

const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const cashPurchase = (amount: number): Purchase => ({ id: 'cp', partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, payment: 'cash', date: '2026-07-03', ...meta });
const adj = (id: string, partyId: string, amount: number): PartyAdjustment => ({ id, partyId, amount, reason: 'x', date: '2026-07-02', ...meta });
const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
} as DataSet);

describe('BUG 1 — Cash in Hand is PHYSICAL CASH ONLY', () => {
  it('a payable does NOT reduce Cash in Hand; all cash surfaces agree', () => {
    // Physical cash: cash purchase 600k → -600,000. Plus a 300k PAYABLE that
    // must NOT touch cash. Old bug folded it in → -900,000.
    const data = dataset({
      parties: [party('A', 'Ali')],
      purchases: [cashPurchase(600000)],
      partyAdjustments: [adj('a1', 'A', -300000)],
    });
    const raw = computeCashInHand(data, P);
    const fin = computeFinancials(data, P);
    const cashBook = computeCashBook(data, P).reduce((a, l) => a + l.inflow - l.outflow, 0);

    expect(raw).toBe(-600000);
    expect(fin.cashInHand).toBe(-600000);                 // NOT -900,000
    expect(computeDashboard(data, P).cashInHand).toBe(-600000);
    expect(computeBusinessSummary(data, P).cashInHand).toBe(-600000);
    expect(cashBook).toBe(-600000);
    // The payable is a SEPARATE figure, still reported.
    expect(fin.netPayable).toBe(300000);
    expect(fin.cashInHand).toBe(fin.rawCash);             // cash === physical cash
  });

  it('cash-event rules: only cash sales/purchases/received/paid move cash', () => {
    const d = dataset({ purchases: [cashPurchase(600000)], partyAdjustments: [adj('a', 'A', 500000)], parties: [party('A', 'Ali')] });
    // Receivable 500k must not raise cash either.
    expect(computeFinancials(d, P).cashInHand).toBe(-600000);
    expect(computeFinancials(d, P).netReceivable).toBe(500000);
  });
});

describe('BUG 3 — orphan adjustments (deleted party) never create balance/rows', () => {
  it('an adjustment for a non-existent party is ignored by the engine', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      partyAdjustments: [adj('a1', 'A', 200000), adj('orphan', 'GHOST', 999999)],
    });
    const balances = computePartyBalances(data, P);
    // Only Ali appears; the orphan (GHOST) contributes nothing.
    expect(balances.map((b) => b.partyId)).toEqual(['A']);
    expect(computeFinancials(data, P).netReceivable).toBe(200000); // not 999,999 + 200k
    // No balance row references a non-existent party.
    balances.forEach((b) => expect(data.parties.some((p) => p.id === b.partyId)).toBe(true));
  });

  it('cleanOrphans predicate: removes deleted-party records, keeps blank-party (cash) rows', () => {
    // Mirrors store.cleanOrphans(): orphan = partyId set AND not in alive set.
    const alive = new Set(['A', 'B']);
    const isOrphan = (r: { partyId?: string }) => !!r.partyId && !alive.has(r.partyId);

    expect(isOrphan({ partyId: 'A' })).toBe(false);        // valid party
    expect(isOrphan({ partyId: 'GHOST' })).toBe(true);     // deleted party → remove
    expect(isOrphan({ partyId: '' })).toBe(false);         // cash / no-party → keep
    expect(isOrphan({ partyId: undefined })).toBe(false);  // no-party → keep

    const rows = [
      { id: '1', partyId: 'A' }, { id: '2', partyId: 'GHOST' },
      { id: '3', partyId: '' }, { id: '4', partyId: 'B' }, { id: '5', partyId: 'DELETED' },
    ];
    const removed = rows.filter(isOrphan).map((r) => r.id);
    expect(removed).toEqual(['2', '5']); // only the two deleted-party rows
  });
});
