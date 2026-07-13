import { describe, it, expect } from 'vitest';
import {
  computeFinancials,
  computeBusinessSummary,
  computeDashboard,
  computePartyBalances,
  type DataSet,
} from './accounting';
import type { Party, Purchase, Sale, PartyAdjustment } from '@/types';

/**
 * Dashboard Financial Engine tests.
 *
 * These verify the ONE source of truth: per-party net balances drive every
 * dashboard total. They are written to FAIL if the app ever reverts to summing
 * raw receivable/payable collections (Tests 1, 2, 7, 8 all involve a single
 * party whose two sides must collapse to a net — raw sums would break them).
 *
 * Note on "opening cash": the engine has no separate opening-cash field; cash
 * is the sum of cash movements. So an opening cash of 400,000 is modelled as an
 * initial cash receipt, exactly as it flows through computeCashInHand.
 */

const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };

function party(id: string, name: string): Party {
  return { id, name, openingBalance: 0, createdAt: now, updatedAt: now };
}

/** A cash receipt with no party — used to seed "opening cash". */
function openingCash(amount: number): Sale {
  return {
    id: 'open-' + amount, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount,
    amount, receipt: 'cash', costOfGoods: 0, profit: 0, date: '2026-07-01', ...meta,
  };
}
function cashSale(id: string, amount: number): Sale {
  return {
    id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount,
    receipt: 'cash', costOfGoods: 0, profit: 0, date: '2026-07-03', ...meta,
  };
}
function cashPurchase(id: string, amount: number): Purchase {
  return {
    id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount,
    payment: 'cash', date: '2026-07-03', ...meta,
  };
}
function creditSale(id: string, partyId: string, amount: number): Sale {
  return {
    id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount,
    receipt: 'credit', costOfGoods: 0, profit: 0, date: '2026-07-03', ...meta,
  };
}
function creditPurchase(id: string, partyId: string, amount: number): Purchase {
  return {
    id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount,
    payment: 'credit', date: '2026-07-03', ...meta,
  };
}
/** Manual party adjustment: +amount = receivable, -amount = payable. */
function adjustment(id: string, partyId: string, amount: number): PartyAdjustment {
  return { id, partyId, amount, reason: amount > 0 ? 'Receivable' : 'Payable', date: '2026-07-02', ...meta };
}

function dataset(over: Partial<DataSet>): DataSet {
  return {
    parties: [],
    bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
    purchases: [],
    sales: [],
    cash: [],
    partyAdjustments: [],
    expenses: [],
    closings: [],
    opening: null,
    ...over,
  } as DataSet;
}

/** Net balance for one party (the per-party value the dashboard is built from). */
function partyNet(data: DataSet, partyId: string): number {
  return computePartyBalances(data, P).find((b) => b.partyId === partyId)?.balance ?? 0;
}

describe('Financial Engine — per-party netting', () => {
  it('1. same party full offset → net 0, party hidden', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      partyAdjustments: [adjustment('r', 'A', 300000), adjustment('p', 'A', -300000)],
    });
    expect(partyNet(data, 'A')).toBe(0);

    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(0);
    expect(fin.netPayable).toBe(0);

    const shown = computePartyBalances(data, P).filter((b) => Math.abs(b.balance) > 0.005);
    expect(shown.map((b) => b.partyId)).not.toContain('A');
  });

  it('2. same party partial offset → shown only as payable 500000', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      partyAdjustments: [adjustment('r', 'A', 500000), adjustment('p', 'A', -1000000)],
    });
    expect(partyNet(data, 'A')).toBe(-500000);

    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(0);
    expect(fin.netPayable).toBe(500000);
  });

  it('3. receivable/payable are SEPARATE from cash (physical cash only)', () => {
    const data = dataset({
      parties: [party('A', 'Ali'), party('B', 'Ahmed')],
      sales: [openingCash(400000)],
      partyAdjustments: [adjustment('r', 'A', 500000), adjustment('p', 'B', -1000000)],
    });
    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(500000); // different parties → both show
    expect(fin.netPayable).toBe(1000000);
    // Cash in Hand = PHYSICAL CASH ONLY (the 400k cash sale). Receivable/payable
    // are NOT folded in.
    expect(fin.cashInHand).toBe(400000);

    // dashboard + business summary must agree with the engine
    const d = computeDashboard(data, P);
    expect(d.cashReceivable).toBe(500000);
    expect(d.cashPayable).toBe(1000000);
    expect(d.cashInHand).toBe(400000);
    const bs = computeBusinessSummary(data, P);
    expect(bs.netReceivable).toBe(500000);
    expect(bs.netPayable).toBe(1000000);
    expect(bs.cashInHand).toBe(400000);
  });

  it('4. delete reverses effect → payable 0, totals recalculated', () => {
    const parties = [party('A', 'Ali')];
    const withPayable = dataset({
      parties,
      sales: [openingCash(400000)],
      partyAdjustments: [adjustment('p', 'A', -1000000)],
    });
    expect(computeFinancials(withPayable, P).netPayable).toBe(1000000);
    expect(partyNet(withPayable, 'A')).toBe(-1000000);

    // Delete the payable transaction (records are the source of truth).
    const afterDelete = dataset({ parties, sales: [openingCash(400000)], partyAdjustments: [] });
    const fin = computeFinancials(afterDelete, P);
    expect(fin.netPayable).toBe(0);
    expect(partyNet(afterDelete, 'A')).toBe(0);
    expect(fin.cashInHand).toBe(400000); // back to just the cash
  });

  it('5. edit reverses old and applies new → receivable 200000 (not 700000/500000)', () => {
    const parties = [party('A', 'Ali')];
    const before = dataset({ parties, partyAdjustments: [adjustment('r', 'A', 500000)] });
    expect(computeFinancials(before, P).netReceivable).toBe(500000);

    // Edit the SAME record's amount to 200000 (no stacking).
    const after = dataset({ parties, partyAdjustments: [adjustment('r', 'A', 200000)] });
    const fin = computeFinancials(after, P);
    expect(fin.netReceivable).toBe(200000);
    expect(fin.netReceivable).not.toBe(700000);
    expect(fin.netReceivable).not.toBe(500000);
  });

  it('6. purchase/sale cash logic → CIH 600000', () => {
    const data = dataset({
      sales: [openingCash(400000), cashSale('s1', 700000)],
      purchases: [cashPurchase('p1', 500000)],
    });
    // 400000 - 500000 + 700000 = 600000
    expect(computeFinancials(data, P).cashInHand).toBe(600000);
  });

  it('7. sales/purchases do NOT affect party balance (only manual + cash do)', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      purchases: [creditPurchase('p1', 'A', 1000000)],
      sales: [creditSale('s1', 'A', 400000)],
    });
    // New rule: a credit sale/purchase never touches receivable/payable.
    expect(partyNet(data, 'A')).toBe(0);
    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(0);
    expect(fin.netPayable).toBe(0);
  });

  it('8. only a manual adjustment builds receivable/payable', () => {
    const data = dataset({
      parties: [party('A', 'Ali')],
      purchases: [creditPurchase('p1', 'A', 400000)], // ignored for balance
      sales: [creditSale('s1', 'A', 1000000)],        // ignored for balance
      partyAdjustments: [adjustment('m', 'A', 600000)], // THIS builds the receivable
    });
    expect(partyNet(data, 'A')).toBe(600000);
    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(600000);
    expect(fin.netPayable).toBe(0);
  });
});
