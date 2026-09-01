import { describe, it, expect } from 'vitest';
import {
  computeStock, computePartyBalances, computeDashboard, computeCashBookSummary,
  computeProfitLoss, computeExpenseNet,
  type DataSet, type ProfitClosing,
} from './accounting';
import type { Purchase, Sale, Expense, Party, MonthlyClosing } from '@/types';

/**
 * Zeroing a month's Profit & Expense must change NOTHING that carries into the
 * next month. Stock qty/value, party balances, receivable/payable and cash all
 * continue from August into September exactly as they would have — only the
 * two reported figures for August itself read 0.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const party: Party = { id: 'P1', name: 'Ali Traders', openingBalance: 0, createdAt: now, updatedAt: now };
const bond = { id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now };

const purchase: Purchase = {
  id: 'pu1', partyId: 'P1', bondTypeId: 'b1', quantity: 100, rate: 1000, amount: 100000,
  payment: 'credit', date: '2026-08-05', ...meta(8),
};
const sale: Sale = {
  id: 'sa1', partyId: 'P1', bondTypeId: 'b1', quantity: 40, rate: 1200, amount: 48000,
  receipt: 'credit', costOfGoods: 40000, profit: 8000, date: '2026-08-20', ...meta(8),
};
const expenses: Expense[] = [
  { id: 'e1', kind: 'expense', category: 'Shop Rent', amount: 30000, date: '2026-08-10', ...meta(8) } as Expense,
  { id: 'e2', kind: 'expense', category: 'Tea', amount: 12000, date: '2026-08-11', ...meta(8) } as Expense,
];

const plain: DataSet = {
  parties: [party], bondTypes: [bond], purchases: [purchase], sales: [sale],
  cash: [], partyAdjustments: [], expenses, closings: [], opening: null,
};

const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };

/** August held at 0: closings sized to the real figures, exactly as the button writes them. */
const closingFor = (id: string, amount: number): ProfitClosing =>
  ({ id, date: '2026-08-31', month: 8, year: 2026, amount, createdAt: now, updatedAt: now });

// Order matters: expenses are deducted from Profit, so the expense closing is
// applied FIRST and the profit closing is then sized against what Profit reads
// once expenses are already zeroed. Sizing both against `plain` would leave
// Profit sitting at +expenses instead of 0. This mirrors zeroMonthFigures.
const withExpenseZeroed: DataSet = {
  ...plain,
  expenseClosings: [closingFor('ec', computeExpenseNet(plain, AUG).expense)],
};
const zeroed: DataSet = {
  ...withExpenseZeroed,
  profitClosings: [closingFor('pc', computeProfitLoss(withExpenseZeroed, AUG))],
};

/** The August snapshot resyncClosing writes — the thing September reads from. */
function augustClosing(data: DataSet): MonthlyClosing {
  const d = computeDashboard(data, AUG);
  return {
    id: '2026-8', month: 8, year: 2026, closedAt: now, closedBy: 'Owner',
    stockSnapshot: computeStock(data, AUG),
    partyBalances: computePartyBalances(data, AUG).map((b) => ({ partyId: b.partyId, balance: b.balance })),
    summary: {
      totalPurchase: d.totalPurchase, totalSale: d.totalSale,
      closingStockQty: d.closingStockQty, closingStockValue: d.closingStockValue,
      cashReceivable: d.cashReceivable, cashPayable: d.cashPayable,
      cashInHand: d.cashInHand, netBalance: d.netBalance,
      profitLoss: d.profitLoss, trialBalanced: d.trialBalanced,
    },
  };
}

describe('Zeroing August Profit & Expense — everything else carries on unchanged', () => {
  it('August itself reports 0 for both figures', () => {
    expect(computeProfitLoss(zeroed, AUG)).toBe(0);
    expect(computeExpenseNet(zeroed, AUG).expense).toBe(0);
    // ...while the un-zeroed dataset still shows the real numbers. Profit is
    // trading 8,000 LESS the 42,000 of expenses — a 34,000 loss.
    expect(computeProfitLoss(plain, AUG)).toBe(-34000);
    expect(computeExpenseNet(plain, AUG).expense).toBe(42000);
  });

  it('the carried snapshot is byte-for-byte identical', () => {
    expect(augustClosing(zeroed).stockSnapshot).toEqual(augustClosing(plain).stockSnapshot);
    expect(augustClosing(zeroed).partyBalances).toEqual(augustClosing(plain).partyBalances);
  });

  it('September opening stock carries the same qty and value', () => {
    const sepPlain = computeStock({ ...plain, closings: [augustClosing(plain)] }, SEP);
    const sepZeroed = computeStock({ ...zeroed, closings: [augustClosing(zeroed)] }, SEP);
    expect(sepZeroed).toEqual(sepPlain);
    // and it really did carry something — 100 bought, 40 sold.
    expect(sepPlain[0].openingQty).toBe(60);
  });

  it('September party balances / receivable / payable carry the same', () => {
    const sepPlain = computeDashboard({ ...plain, closings: [augustClosing(plain)] }, SEP);
    const sepZeroed = computeDashboard({ ...zeroed, closings: [augustClosing(zeroed)] }, SEP);
    expect(sepZeroed.cashReceivable).toBe(sepPlain.cashReceivable);
    expect(sepZeroed.cashPayable).toBe(sepPlain.cashPayable);
    expect(sepZeroed.closingStockQty).toBe(sepPlain.closingStockQty);
    expect(sepZeroed.closingStockValue).toBe(sepPlain.closingStockValue);
  });

  it('August Cash in Hand, purchases, sales and stock are untouched', () => {
    expect(computeCashBookSummary(zeroed, AUG).cashInHand).toBe(computeCashBookSummary(plain, AUG).cashInHand);
    const a = computeDashboard(plain, AUG), b = computeDashboard(zeroed, AUG);
    expect(b.totalPurchase).toBe(a.totalPurchase);
    expect(b.totalSale).toBe(a.totalSale);
    expect(b.closingStockQty).toBe(a.closingStockQty);
    expect(b.closingStockValue).toBe(a.closingStockValue);
    expect(b.cashReceivable).toBe(a.cashReceivable);
    expect(b.cashPayable).toBe(a.cashPayable);
  });

  it('September profit & expenses are NOT zeroed by August closings', () => {
    const sepData: DataSet = {
      ...zeroed,
      sales: [...zeroed.sales, { ...sale, id: 'sa2', date: '2026-09-04', ...meta(9) }],
      expenses: [...expenses, { id: 'e3', kind: 'expense', category: 'Fuel', amount: 5000, date: '2026-09-06', ...meta(9) } as Expense],
      closings: [augustClosing(zeroed)],
    };
    expect(computeExpenseNet(sepData, SEP).expense).toBe(5000);
    expect(computeProfitLoss(sepData, SEP)).not.toBe(0);
  });
});
