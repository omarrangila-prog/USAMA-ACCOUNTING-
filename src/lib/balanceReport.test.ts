import { describe, it, expect } from 'vitest';
import { buildSections, buildReportDoc } from './reportBuilder';
import { money } from './exportPdf';
import { computeFinancials, type DataSet } from './accounting';
import type { Party, PartyAdjustment } from '@/types';

/**
 * Balance Check report must render party rows from the Financial Engine's
 * per-party net balances — never blank when parties have non-zero nets.
 */
const P = { month: 7, year: 2026 };
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };

function party(id: string, name: string): Party {
  return { id, name, openingBalance: 0, createdAt: now, updatedAt: now };
}
function adj(id: string, partyId: string, amount: number): PartyAdjustment {
  return { id, partyId, amount, reason: amount > 0 ? 'Receivable' : 'Payable', date: '2026-07-02', ...meta };
}
function dataset(over: Partial<DataSet>): DataSet {
  return {
    parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
    purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [], closings: [], opening: null, ...over,
  } as DataSet;
}

describe('Balance Check report — not blank, per-party net', () => {
  it('Ali (rec 500k, pay 300k → +200k) under RECEIVABLES; Ahmed (pay 1M) under PAYABLES', () => {
    const data = dataset({
      parties: [party('A', 'Ali Traders'), party('B', 'Ahmed')],
      partyAdjustments: [
        adj('a1', 'A', 500000), adj('a2', 'A', -300000), // Ali net +200000
        adj('b1', 'B', -1000000),                        // Ahmed net -1000000
      ],
    });

    const sections = buildSections(data, P, 'balance');
    const rec = sections.find((s) => s.title.startsWith('RECEIVABLES'))!;
    const pay = sections.find((s) => s.title.startsWith('PAYABLES'))!;

    // Sections must exist and must NOT be blank.
    expect(rec).toBeTruthy();
    expect(pay).toBeTruthy();

    // 3-column layout: Party | Amount | Status.
    expect(rec.head).toEqual(['Party', 'Amount', 'Status']);
    expect(pay.head).toEqual(['Party', 'Amount', 'Status']);

    // Ali appears under receivables with 200,000 (net, not raw 500,000) + Status.
    const aliRow = rec.rows.find((r) => r[0] === 'Ali Traders');
    expect(aliRow).toBeTruthy();
    expect(aliRow![1]).toContain('200,000');
    expect(aliRow![1]).not.toContain('500,000');
    expect(aliRow![2]).toBe('Receivable');

    // Ahmed appears under payables with 1,000,000 + Status.
    const ahmedRow = pay.rows.find((r) => r[0] === 'Ahmed');
    expect(ahmedRow).toBeTruthy();
    expect(ahmedRow![1]).toContain('1,000,000');
    expect(ahmedRow![2]).toBe('Payable');

    // Report must not be blank — real party rows present.
    expect(rec.rows.some((r) => r[0] === 'Ali Traders')).toBe(true);
    expect(pay.rows.some((r) => r[0] === 'Ahmed')).toBe(true);

    // Totals agree with the Financial Engine.
    const fin = computeFinancials(data, P);
    expect(rec.foot![1]).toContain('200,000');
    expect(pay.foot![1]).toContain('1,000,000');
    expect(fin.netReceivable).toBe(200000);
    expect(fin.netPayable).toBe(1000000);

    // SUMMARY section shows Total Receivable / Payable / Cash in Hand / Net Position.
    const sum = sections.find((s) => s.title === 'SUMMARY')!;
    expect(sum).toBeTruthy();
    const metric = (label: string) => sum.rows.find((r) => r[0] === label)?.[1];
    expect(metric('Total Receivable')).toContain('200,000');
    expect(metric('Total Payable')).toContain('1,000,000');
    expect(metric('Cash in Hand')).toBe(money(fin.cashInHand));
    expect(metric('Net Position')).toBe(money(fin.netReceivable - fin.netPayable));
  });

  it('builds a non-empty PDF doc for the balance report without throwing', () => {
    const data = dataset({
      parties: [party('A', 'Ali Traders'), party('B', 'Ahmed')],
      partyAdjustments: [adj('a1', 'A', 200000), adj('b1', 'B', -1000000)],
    });
    // buildReportDoc runs summaryCards + buildReportPdf (the exact preview/print
    // /download path). If any of it threw, the report would render blank.
    const doc = buildReportDoc(data, settingsFixture, P, 'balance');
    const out = doc.output('datauristring');
    expect(out.startsWith('data:application/pdf')).toBe(true);
    expect(out.length).toBeGreaterThan(2000); // real content, not an empty page
  });
});

const settingsFixture = {
  businessName: 'Test', ownerName: 'Owner', currency: 'Rs', smartEntryEnabled: false, updatedAt: now,
};
