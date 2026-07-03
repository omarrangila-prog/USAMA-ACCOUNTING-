import { describe, it, expect } from 'vitest';
import { partyDropdownOptions, computeLedger, type DataSet } from './accounting';
import type { Party, Sale } from '@/types';

/**
 * Ledger party dropdown must ALWAYS load every party from the master Parties
 * collection — A→Z, case-insensitive — regardless of whether they have any
 * transactions. Parties with no transactions must NOT disappear.
 */
const P = { month: 7, year: 2026 };
const now = Date.now();

function party(id: string, name: string): Party {
  return { id, name, openingBalance: 0, createdAt: now, updatedAt: now };
}
function creditSale(id: string, partyId: string, amount: number): Sale {
  return { id, partyId, bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'credit', costOfGoods: 0, profit: amount, date: '2026-07-03', month: 7, year: 2026, createdAt: now, updatedAt: now };
}
function dataset(over: Partial<DataSet>): DataSet {
  return {
    parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
    purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
  } as DataSet;
}

describe('Ledger party dropdown', () => {
  // Parties created in jumbled order; transactions only for Ali & Mustafa.
  const data = dataset({
    parties: [
      party('P1', 'Yameen'), party('P2', 'Ali'), party('P3', 'Ahmed'),
      party('P4', 'Bilal'), party('P5', 'Mustafa'),
    ],
    sales: [creditSale('s1', 'P2', 250000), creditSale('s2', 'P5', 50000)],
  });

  it('lists ALL parties A→Z even when only some have transactions', () => {
    const names = partyDropdownOptions(data, P).map((o) => o.name);
    expect(names).toEqual(['Ahmed', 'Ali', 'Bilal', 'Mustafa', 'Yameen']);
    // Every master party present — none dropped for lacking transactions.
    expect(names).toContain('Bilal');   // no transactions
    expect(names).toContain('Ahmed');   // no transactions
    expect(names.length).toBe(5);
  });

  it('carries each party net balance + status', () => {
    const opts = partyDropdownOptions(data, P);
    const ali = opts.find((o) => o.name === 'Ali')!;
    const bilal = opts.find((o) => o.name === 'Bilal')!;
    expect(ali.balance).toBe(250000);
    expect(ali.status).toBe('Receivable');
    expect(bilal.balance).toBe(0);
    expect(bilal.status).toBe('Settled');
  });

  it('selecting a party with no transactions yields an empty ledger', () => {
    const bilalLedger = computeLedger(data, 'P4', P);
    // Only the opening row (0), no movement lines → UI shows the empty message.
    const movement = bilalLedger.filter((e) => e.refType !== 'opening');
    expect(movement.length).toBe(0);
  });

  it('selecting Ali / Mustafa loads their ledger immediately', () => {
    const aliLedger = computeLedger(data, 'P2', P).filter((e) => e.refType === 'sale');
    const mustafaLedger = computeLedger(data, 'P5', P).filter((e) => e.refType === 'sale');
    expect(aliLedger.length).toBe(1);
    expect(mustafaLedger.length).toBe(1);
  });

  it('sort is case-insensitive', () => {
    const mixed = dataset({ parties: [party('X', 'bravo'), party('Y', 'Alpha'), party('Z', 'ALI')] });
    expect(partyDropdownOptions(mixed, P).map((o) => o.name)).toEqual(['ALI', 'Alpha', 'bravo']);
  });
});
