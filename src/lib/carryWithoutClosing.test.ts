import { describe, it, expect } from 'vitest';
import { computeStock, computePartyBalances, computeDashboard, type DataSet } from './accounting';
import type { Purchase, Sale, CashTransaction, Party, MonthlyClosing, OpeningBalances } from '@/types';

/**
 * Continuous totals: figures never reset at a month or year boundary, so a
 * later month always includes everything recorded before it — with no
 * dependence on anyone having pressed "Close Month".
 *
 * `openingQty` / `opening` now mean strictly PRE-SYSTEM balances (an imported
 * migration), because the running window already covers every recorded
 * transaction. What matters is the CLOSING position, which must include prior
 * months.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const party: Party = { id: 'P1', name: 'Ali Traders', openingBalance: 0, createdAt: now, updatedAt: now };
const bond = { id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now };

const purchase = (id: string, m: number, qty: number, rate: number): Purchase =>
  ({ id, partyId: 'P1', bondTypeId: 'b1', quantity: qty, rate, amount: qty * rate, payment: 'credit', date: `2026-0${m}-05`, ...meta(m) });
const sale = (id: string, m: number, qty: number, rate: number): Sale =>
  ({ id, partyId: 'P1', bondTypeId: 'b1', quantity: qty, rate, amount: qty * rate, receipt: 'credit', costOfGoods: 0, profit: 0, date: `2026-0${m}-20`, ...meta(m) });
const cash = (id: string, m: number, dir: 'received' | 'paid', amount: number): CashTransaction =>
  ({ id, partyId: 'P1', direction: dir, amount, date: `2026-0${m}-25`, ...meta(m) });

// August: bought 100 @ 1000, sold 40. Received 30,000 from the party.
const base: DataSet = {
  parties: [party], bondTypes: [bond],
  purchases: [purchase('pu1', 8, 100, 1000)],
  sales: [sale('sa1', 8, 40, 1200)],
  cash: [cash('c1', 8, 'received', 30000)],
  partyAdjustments: [], expenses: [], closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };

describe('Continuous totals carry across months without any closing', () => {
  it("September still holds August's stock at the right average cost", () => {
    const sep = computeStock(base, SEP)[0];
    expect(sep.closingQty).toBe(60);     // 100 bought - 40 sold, carried
    expect(sep.avgCost).toBe(1000);
    expect(sep.closingValue).toBe(60000);
    // No migration, so there is no pre-system opening.
    expect(sep.openingQty).toBe(0);
    // August's own view agrees — the position doesn't change by looking later.
    expect(computeStock(base, AUG)[0].closingQty).toBe(60);
  });

  it("September carries the party's August balance", () => {
    const bal = computePartyBalances(base, SEP)[0];
    expect(bal.balance).toBe(30000);
    expect(bal.opening).toBe(0);   // pre-system only
  });

  it('a closing snapshot no longer overrides the records', () => {
    // A snapshot that disagrees with the transactions must NOT win: under
    // continuous totals the records are the single source of truth, and reading
    // a snapshot on top would double-count every month it summarised.
    const closing: MonthlyClosing = {
      id: '2026-8', month: 8, year: 2026, closedAt: now, closedBy: 'Owner',
      stockSnapshot: [{ bondTypeId: 'b1', bondTypeName: '1500', openingQty: 0, purchasedQty: 0, soldQty: 0, closingQty: 7, avgCost: 999, closingValue: 6993 } as any],
      partyBalances: [{ partyId: 'P1', balance: 12345 }],
      summary: {} as any,
    };
    const data = { ...base, closings: [closing] };
    expect(computeStock(data, SEP)[0].closingQty).toBe(60);
    expect(computePartyBalances(data, SEP)[0].balance).toBe(30000);
  });

  it('carries across a year boundary — totals never reset in January', () => {
    const data: DataSet = {
      ...base,
      purchases: [{ ...purchase('pu2', 8, 50, 800), month: 12, year: 2026, date: '2026-12-05' }],
      sales: [], cash: [],
    };
    expect(computeStock(data, { month: 1, year: 2027 })[0].closingQty).toBe(50);
  });

  it('a month BEFORE any activity shows nothing — the future is excluded', () => {
    const JUL = { month: 7, year: 2026 };
    expect(computeStock(base, JUL)[0].closingQty).toBe(0);
    expect(computePartyBalances(base, JUL)[0].balance).toBe(0);
  });

  it('weighted average spans months, not just the latest one', () => {
    const data: DataSet = {
      ...base,
      purchases: [purchase('pu1', 7, 100, 1000), purchase('pu2', 8, 100, 1400)],
      sales: [], cash: [],
    };
    // (100x1000 + 100x1400) / 200 = 1200 — July's cost is still in the average.
    expect(computeStock(data, SEP)[0].avgCost).toBe(1200);
    expect(computeStock(data, SEP)[0].closingQty).toBe(200);
  });

  it('an imported opening still governs its own migration month', () => {
    const opening = {
      id: 'opening', asOf: AUG, source: 'excel', importedProfit: 0, createdAt: now,
      stock: [{ bondTypeId: 'b1', bondTypeName: '1500', qty: 25, avgCost: 900, value: 22500 }],
      parties: [{ partyId: 'P1', balance: 5000 }], files: [],
    } as OpeningBalances;
    const data = { ...base, opening };
    expect(computeStock(data, AUG)[0].openingQty).toBe(25);
    expect(computePartyBalances(data, AUG)[0].opening).toBe(5000);
    // ...and it keeps applying in later months, not just its own.
    expect(computeStock(data, SEP)[0].openingQty).toBe(25);
    expect(computePartyBalances(data, SEP)[0].opening).toBe(5000);
  });

  it('September receivable reflects the carried balance on the dashboard', () => {
    expect(computeDashboard(base, SEP).cashReceivable).toBe(30000);
  });
});
