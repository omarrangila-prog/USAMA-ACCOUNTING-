import { describe, it, expect } from 'vitest';
import {
  computeTransactionBook,
  computeCashBookSummary,
  computeCashInHand,
  type DataSet,
} from './accounting';
import type { Sale, CashTransaction } from '@/types';

/**
 * Month continuity: the Cash Book uses cumulative mode (cumulative = true) so
 * balances and the transaction list CONTINUE across months — July's closing
 * flows into August. Reports keep single-month behaviour (cumulative = false).
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const cashSale = (id: string, m: number, amount: number): Sale =>
  ({ id, partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: 0, profit: amount, date: `2026-0${m}-15`, ...meta(m) });
const received = (id: string, m: number, amount: number): CashTransaction =>
  ({ id, partyId: '', direction: 'received', amount, date: `2026-0${m}-16`, ...meta(m) } as CashTransaction);

const data: DataSet = {
  parties: [], bondTypes: [{ id: 'b1', name: '100', faceValue: 100, createdAt: now, updatedAt: now }],
  purchases: [],
  sales: [cashSale('jul', 7, 5000), cashSale('aug', 8, 7000)],
  cash: [received('rjul', 7, 1000), received('raug', 8, 2000)],
  partyAdjustments: [], expenses: [], closings: [], opening: null,
};
const JUL = { month: 7, year: 2026 };
const AUG = { month: 8, year: 2026 };

describe('Month continuity (cumulative Cash Book)', () => {
  it('reports (single-month) show only their own month', () => {
    expect(computeTransactionBook(data, JUL).length).toBe(2);      // jul sale + jul cash
    expect(computeTransactionBook(data, AUG).length).toBe(2);      // aug sale + aug cash
    expect(computeCashInHand(data, JUL)).toBe(6000);               // 5000 + 1000
    expect(computeCashInHand(data, AUG)).toBe(9000);               // 7000 + 2000 (month only)
  });

  it('Cash Book (cumulative) continues across months — nothing resets', () => {
    // July view: only July.
    expect(computeTransactionBook(data, JUL, true).length).toBe(2);
    expect(computeCashInHand(data, JUL, true)).toBe(6000);
    // August view: July + August entries, and cash accumulates.
    expect(computeTransactionBook(data, AUG, true).length).toBe(4);
    expect(computeCashInHand(data, AUG, true)).toBe(15000);        // 6000 + 9000
    // Summary cumulative cash matches.
    expect(computeCashBookSummary(data, AUG, true).cashInHand).toBe(15000);
    expect(computeCashBookSummary(data, AUG, true).txnCount).toBe(4);
  });
});
