import { describe, it, expect } from 'vitest';
import {
  computeSettlementSummary, computeReceivables, computePayables,
  computeLedger, ledgerRunningBalance, type DataSet,
} from './accounting';
import type { Party, PartyAdjustment } from '@/types';

/**
 * Auto Settled Mode (Easy-Khata): a manual receivable/payable gets a matching
 * received/paid settlement, so the party nets to zero but BOTH rows show in the
 * ledger. These tests model the exact records the store writes in auto mode.
 */
const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const created = (id: string, pid: string, amount: number): PartyAdjustment =>
  ({ id, partyId: pid, amount, reason: amount > 0 ? 'Receivable' : 'Payable', settlement: false, date: '2026-07-05', ...meta });
const settle = (id: string, pid: string, amount: number): PartyAdjustment =>
  ({ id, partyId: pid, amount, reason: amount < 0 ? 'Received (auto-settled)' : 'Paid (auto-settled)', settlement: true, date: '2026-07-05', ...meta });
const dataset = (adj: PartyAdjustment[], parties: Party[]): DataSet => ({
  parties, bondTypes: [], purchases: [], sales: [], cash: [], partyAdjustments: adj,
  expenses: [], closings: [], opening: null,
} as DataSet);

describe('Auto Settled Mode', () => {
  it('1. Receivable 500k + auto Received 500k → pending 0, ledger shows both', () => {
    // What addPartyAdjustment writes in auto mode: the +500k entry AND a −500k settlement.
    const data = dataset([created('r', 'A', 500000), settle('rs', 'A', -500000)], [party('A', 'Ali')]);

    // Party nets to zero → not pending on either side.
    expect(computeReceivables(data, P).find((b) => b.partyId === 'A')).toBeUndefined();
    expect(computePayables(data, P).find((b) => b.partyId === 'A')).toBeUndefined();

    // Ledger shows BOTH rows and running balance ends at 0.
    const entries = computeLedger(data, 'A', P).filter((e) => e.refType === 'adjustment');
    expect(entries.length).toBe(2);
    const run = ledgerRunningBalance(computeLedger(data, 'A', P));
    expect(run[run.length - 1]).toBe(0);

    // Report figures.
    const s = computeSettlementSummary(data, P);
    expect(s.receivableCreated).toBe(500000);
    expect(s.received).toBe(500000);
    expect(s.pendingReceivable).toBe(0);
  });

  it('2. Payable 300k + auto Paid 300k → pending 0, ledger shows both', () => {
    const data = dataset([created('p', 'B', -300000), settle('ps', 'B', 300000)], [party('B', 'Bilal')]);
    expect(computePayables(data, P).find((b) => b.partyId === 'B')).toBeUndefined();
    const s = computeSettlementSummary(data, P);
    expect(s.payableCreated).toBe(300000);
    expect(s.paid).toBe(300000);
    expect(s.pendingPayable).toBe(0);
    const run = ledgerRunningBalance(computeLedger(data, 'B', P));
    expect(run[run.length - 1]).toBe(0);
  });

  it('3. report totals: created vs received/paid vs pending', () => {
    // A: receivable 500k auto-settled. C: receivable 200k NOT settled (pending mode leftover).
    const data = dataset([
      created('r1', 'A', 500000), settle('rs1', 'A', -500000),
      created('r2', 'C', 200000), // no settlement → pending
      created('p1', 'B', -300000), settle('ps1', 'B', 300000),
    ], [party('A', 'Ali'), party('B', 'Bilal'), party('C', 'Chan')]);
    const s = computeSettlementSummary(data, P);
    expect(s.receivableCreated).toBe(700000); // 500k + 200k
    expect(s.received).toBe(500000);
    expect(s.pendingReceivable).toBe(200000); // C still owes
    expect(s.payableCreated).toBe(300000);
    expect(s.paid).toBe(300000);
    expect(s.pendingPayable).toBe(0);
  });

  it('Pending Mode (no auto settlement) leaves the balance outstanding', () => {
    const data = dataset([created('r', 'A', 500000)], [party('A', 'Ali')]);
    expect(computeReceivables(data, P).find((b) => b.partyId === 'A')?.balance).toBe(500000);
    expect(computeSettlementSummary(data, P).pendingReceivable).toBe(500000);
  });
});
