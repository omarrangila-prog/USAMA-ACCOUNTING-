import { describe, it, expect } from 'vitest';
import { computeReceivables, computePayables, type DataSet } from './accounting';
import type { Party, PartyAdjustment } from '@/types';

/**
 * MAIN balance table path (Balances.tsx `rows` → computeReceivables /
 * computePayables). Distinct from the Manual Entries log. Verifies per-party
 * netting decides which table a party appears in, and that settlements net out.
 *
 * App sign convention: receivable = +amount, payable = −amount,
 * receive-settlement = −amount (settlement:true), pay-settlement = +amount.
 */
const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const adj = (id: string, amount: number, settlement = false): PartyAdjustment =>
  ({ id, partyId: 'A', amount, reason: 'x', settlement, date: '2026-07-02', ...meta });
const data = (adjs: PartyAdjustment[]): DataSet => ({
  parties: [party('A', 'Ali')], bondTypes: [], purchases: [], sales: [], cash: [],
  partyAdjustments: adjs, expenses: [], closings: [], opening: null,
} as DataSet);

const onReceivable = (d: DataSet) => computeReceivables(d, P).find((b) => b.partyId === 'A')?.balance ?? null;
const onPayable = (d: DataSet) => computePayables(d, P).find((b) => b.partyId === 'A')?.balance ?? null;

describe('MAIN balance table — per-party netting', () => {
  it('manual receivable only → Receivable table only, NOT Payable', () => {
    const d = data([adj('r', 300000)]);
    expect(onReceivable(d)).toBe(300000);
    expect(onPayable(d)).toBeNull(); // never on the payable table
  });

  it('receivable 300k + payable 100k → net +200k on Receivable only', () => {
    const d = data([adj('r', 300000), adj('p', -100000)]);
    expect(onReceivable(d)).toBe(200000);
    expect(onPayable(d)).toBeNull();
  });

  it('receivable 100k + payable 300k → net -200k on Payable only', () => {
    const d = data([adj('r', 100000), adj('p', -300000)]);
    expect(onReceivable(d)).toBeNull();
    expect(onPayable(d)).toBe(200000);
  });

  it('receive-settlement clears a receivable → party on neither table', () => {
    const d = data([adj('r', 300000), adj('rs', -300000, true)]);
    expect(onReceivable(d)).toBeNull();
    expect(onPayable(d)).toBeNull();
  });

  it('pay-settlement clears a payable → party on neither table', () => {
    const d = data([adj('p', -300000), adj('ps', 300000, true)]);
    expect(onReceivable(d)).toBeNull();
    expect(onPayable(d)).toBeNull();
  });

  it('a party is NEVER on both tables at once', () => {
    for (const d of [
      data([adj('r', 300000)]),
      data([adj('p', -300000)]),
      data([adj('r', 300000), adj('p', -100000)]),
      data([adj('r', 100000), adj('p', -300000)]),
    ]) {
      const both = onReceivable(d) !== null && onPayable(d) !== null;
      expect(both).toBe(false);
    }
  });
});
