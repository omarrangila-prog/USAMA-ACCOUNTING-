import { describe, it, expect } from 'vitest';
import {
  computeStock, computeBondMovement, computeProfitLoss, computeExpenseNet,
  computeCashBookSummary, computeDashboard, computePartyBalances, computeTrialBalance,
  type DataSet,
} from './accounting';
import type { Purchase, Sale, CashTransaction, Expense, Party } from '@/types';

/**
 * Month-wise working. At the start of a new month these start fresh:
 *   Profit, Expenses, Cash in Hand, and the Stock Report's Avg Cost.
 * These do NOT reset — they are positions, not results:
 *   stock quantity, stock value, party balances, receivable / payable.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const party: Party = { id: 'P1', name: 'Ali', openingBalance: 0, createdAt: now, updatedAt: now };
const bond = { id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now };

// August: bought 100 @ 1000, sold 40 @ 1200, received 30,000, spent 18,603.
const data: DataSet = {
  parties: [party], bondTypes: [bond],
  purchases: [{ id: 'pu1', partyId: 'P1', bondTypeId: 'b1', quantity: 100, rate: 1000, amount: 100000, payment: 'credit', date: '2026-08-05', ...meta(8) } as Purchase],
  sales: [{ id: 'sa1', partyId: 'P1', bondTypeId: 'b1', quantity: 40, rate: 1200, amount: 48000, receipt: 'credit', costOfGoods: 40000, profit: 8000, date: '2026-08-20', ...meta(8) } as Sale],
  cash: [{ id: 'c1', partyId: 'P1', direction: 'received', amount: 30000, date: '2026-08-25', ...meta(8) } as CashTransaction],
  partyAdjustments: [],
  expenses: [{ id: 'e1', kind: 'expense', category: 'Rent', amount: 18603, date: '2026-08-10', ...meta(8) } as Expense],
  closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };

describe('A new month starts fresh', () => {
  it('Profit resets to 0', () => {
    expect(computeProfitLoss(data, AUG)).not.toBe(0);
    expect(computeProfitLoss(data, SEP)).toBe(0);
  });

  it('Expenses reset to 0', () => {
    expect(computeExpenseNet(data, AUG).expense).toBe(18603);
    expect(computeExpenseNet(data, SEP).expense).toBe(0);
  });

  it('Cash in Hand resets to 0', () => {
    expect(computeCashBookSummary(data, AUG).cashInHand).not.toBe(0);
    expect(computeCashBookSummary(data, SEP).cashInHand).toBe(0);
    expect(computeDashboard(data, SEP).cashInHand).toBe(0);
  });

  it("the Stock Report's Avg Cost resets to 0 when nothing was bought", () => {
    expect(computeStock(data, AUG)[0].monthAvgCost).toBe(1000);   // bought at 1000
    expect(computeStock(data, SEP)[0].monthAvgCost).toBe(0);      // bought nothing
    expect(computeBondMovement(data, SEP)[0].avgBuyRate).toBe(0);
  });

  it('Avg Cost is each month on its own, not a blend of earlier months', () => {
    const twoMonths: DataSet = {
      ...data,
      purchases: [
        ...data.purchases,
        { id: 'pu2', partyId: 'P1', bondTypeId: 'b1', quantity: 50, rate: 1400, amount: 70000, payment: 'credit', date: '2026-09-05', ...meta(9) } as Purchase,
      ],
    };
    // September bought at 1400 — August's 1000 is NOT averaged in.
    expect(computeStock(twoMonths, SEP)[0].monthAvgCost).toBe(1400);
    expect(computeBondMovement(twoMonths, SEP)[0].avgBuyRate).toBe(1400);
  });
});

describe('Everything else carries, exactly as before', () => {
  it('stock quantity carries into the new month', () => {
    const sep = computeStock(data, SEP)[0];
    expect(sep.openingQty).toBe(60);    // 100 bought - 40 sold
    expect(sep.closingQty).toBe(60);
  });

  it('stock VALUE is preserved — it still uses the carried cost, not 0', () => {
    const sep = computeStock(data, SEP)[0];
    expect(sep.avgCost).toBe(1000);       // valuation basis carries
    expect(sep.closingValue).toBe(60000); // 60 x 1000, NOT zero
  });

  it('party balances and receivable / payable carry', () => {
    expect(computePartyBalances(data, SEP)[0].balance).toBe(computePartyBalances(data, AUG)[0].balance);
    const a = computeDashboard(data, AUG), s = computeDashboard(data, SEP);
    expect(s.cashReceivable).toBe(a.cashReceivable);
    expect(s.cashPayable).toBe(a.cashPayable);
  });

  it('the Trial Balance still shows the carried stock, not an empty book', () => {
    const stockRow = computeTrialBalance(data, SEP).rows.find((r) => r.name === 'Closing Stock')!;
    expect(stockRow.credit).toBe(60000);
  });

  it("August's own figures are untouched by any of this", () => {
    expect(computeStock(data, AUG)[0].closingValue).toBe(60000);
    expect(computeExpenseNet(data, AUG).expense).toBe(18603);
    expect(computeProfitLoss(data, AUG)).toBe(8000 - 18603);
  });
});
