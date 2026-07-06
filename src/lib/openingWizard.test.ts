import { describe, it, expect } from 'vitest';
import {
  computeFinancials, computeCashInHand, computePartyBalances,
  computeProfitLoss, computeStock, computeFileBalance, type DataSet,
} from './accounting';
import type { Party, BondType, OpeningBalances } from '@/types';

/**
 * Opening Balance Import Wizard: a single opening snapshot must reflect today's
 * position WITHOUT creating historical transactions or historical profit.
 */
const now = Date.now();
const P = { month: 7, year: 2026 };
const party = (id: string, name: string): Party => ({ id, name, openingBalance: 0, createdAt: now, updatedAt: now });
const bond = (id: string, name: string): BondType => ({ id, name, faceValue: 100, createdAt: now, updatedAt: now });

const opening: OpeningBalances = {
  id: 'opening', asOf: { month: 7, year: 2026 },
  openingCash: 500000,
  stock: [{ bondTypeId: 'b1', bondTypeName: '100', qty: 100, value: 90000, avgCost: 900 }],
  parties: [
    { partyId: 'A', balance: 300000 },   // receivable
    { partyId: 'B', balance: -200000 },  // payable
  ],
  files: [{ fileAccountId: 'bank1', balance: 150000 }],
  importedProfit: 0, source: 'opening_wizard', createdAt: now,
};

const data: DataSet = {
  parties: [party('A', 'Ali'), party('B', 'Bilal')],
  bondTypes: [bond('b1', '100')],
  purchases: [], sales: [], cash: [], partyAdjustments: [], expenses: [],
  closings: [], opening,
} as DataSet;

describe('Opening Balance Wizard — snapshot, no history', () => {
  it('opening cash flows into Cash in Hand', () => {
    expect(computeCashInHand(data, P)).toBe(500000);
    expect(computeFinancials(data, P).cashInHand).toBe(500000);
  });

  it('opening receivable / payable become party balances', () => {
    const bals = computePartyBalances(data, P);
    expect(bals.find((b) => b.partyId === 'A')!.balance).toBe(300000);  // receivable
    expect(bals.find((b) => b.partyId === 'B')!.balance).toBe(-200000); // payable
    const fin = computeFinancials(data, P);
    expect(fin.netReceivable).toBe(300000);
    expect(fin.netPayable).toBe(200000);
  });

  it('opening stock value appears', () => {
    const stock = computeStock(data, P);
    const line = stock.find((s) => s.bondTypeId === 'b1')!;
    expect(line.closingQty).toBe(100);
    expect(line.closingValue).toBe(90000);
  });

  it('bank balance is carried', () => {
    expect(computeFileBalance(opening)).toBe(150000);
  });

  it('CRITICAL: NO historical profit from the opening snapshot', () => {
    // Opening balances are positions, not sales — profit must be 0 until real
    // sales are recorded from the migration date onward.
    expect(computeProfitLoss(data, P)).toBe(0);
  });

  it('a NEW sale after migration DOES create profit (starts from today)', () => {
    const withSale: DataSet = {
      ...data,
      sales: [{ id: 's', partyId: '', bondTypeId: 'b1', quantity: 10, rate: 1000, amount: 10000, receipt: 'cash', costOfGoods: 9000, profit: 1000, date: '2026-07-10', month: 7, year: 2026, createdAt: now, updatedAt: now }],
    } as DataSet;
    expect(computeProfitLoss(withSale, P)).toBe(1000); // only the new sale's profit
    // and the cash sale adds to opening cash
    expect(computeCashInHand(withSale, P)).toBe(510000);
  });
});
