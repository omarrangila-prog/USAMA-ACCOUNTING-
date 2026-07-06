import { describe, it, expect } from 'vitest';
import { computeLedger, ledgerRunningBalance, computePartyBalances, type DataSet } from './accounting';
import { buildSections } from './reportBuilder';
import type { Party, PartyAdjustment } from '@/types';

/**
 * Manual receivable/payable adjustments must appear in the party ledger with the
 * correct debit/credit side and net into the running balance — AND the party
 * must show up in the ledger REPORT (previously adjustments were tagged
 * refType:'opening', so a party with only adjustments was skipped as "no
 * movement").
 */
const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const adj = (id: string, partyId: string, amount: number, date: string): PartyAdjustment =>
  ({ id, partyId, amount, reason: amount > 0 ? 'Manual Receivable' : 'Manual Payable', date, ...meta });
const dataset = (over: Partial<DataSet>): DataSet => ({
  parties: [], bondTypes: [], purchases: [], sales: [], cash: [],
  partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
} as DataSet);

describe('Manual adjustments in the party ledger', () => {
  const data = dataset({
    parties: [party('Y', 'Yameen')],
    partyAdjustments: [adj('r', 'Y', 300000, '2026-07-05'), adj('p', 'Y', -100000, '2026-07-06')],
  });

  it('receivable = debit, payable = credit, running balance nets to 200k', () => {
    const entries = computeLedger(data, 'Y', P);
    const rec = entries.find((e) => e.refId === 'r')!;
    const pay = entries.find((e) => e.refId === 'p')!;
    expect(rec.debit).toBe(300000);   // receivable on debit side
    expect(rec.credit).toBe(0);
    expect(pay.credit).toBe(100000);  // payable on credit side
    expect(pay.debit).toBe(0);
    // adjustments now count as real movement (not 'opening')
    expect(rec.refType).toBe('adjustment');
    expect(pay.refType).toBe('adjustment');

    const run = ledgerRunningBalance(entries);
    expect(run[run.length - 1]).toBe(200000); // 300k - 100k = 200k receivable
    expect(computePartyBalances(data, P).find((b) => b.partyId === 'Y')!.balance).toBe(200000);
  });

  it('party with ONLY manual adjustments still appears in the ledger report', () => {
    const sections = buildSections(data, P, 'ledger');
    const yameen = sections.find((s) => s.title === 'Yameen Statement');
    expect(yameen).toBeTruthy(); // was previously skipped as "no movement"
    // Report shows both adjustment rows and a 200k net foot.
    const descs = yameen!.rows.map((r) => r[1]);
    expect(descs).toContain('Manual Receivable');
    expect(descs).toContain('Manual Payable');
  });

  it('Balance Check report + engine agree: Receivable 200k, Payable 0', () => {
    const bal = buildSections(data, P, 'balance');
    const summary = bal.find((s) => s.title === 'SUMMARY')!;
    const metric = (label: string) => summary.rows.find((r) => r[0] === label)?.[1];
    expect(metric('Total Receivable')).toContain('200,000');
    expect(metric('Total Payable')).toContain('0');
  });
});
