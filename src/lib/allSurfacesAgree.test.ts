import { describe, it, expect } from 'vitest';
import {
  computeStock, computeDashboard, computeCashBookSummary, computeTrialBalance,
  computeFinancials, computeProfitLoss, computeExpenseNet, computePartyBalances,
  cashClosingAmountFor, profitClosingAmountFor, expenseClosingAmountFor,
  type DataSet, type ProfitClosing,
} from './accounting';
import { buildSections } from './reportBuilder';
import type { Purchase, Sale, CashTransaction, Expense, Party } from '@/types';

/**
 * Cross-surface consistency. Every screen and report has to agree on the same
 * figure — the Cash Book, the dashboard, the Trial Balance and the PDF sections
 * are all supposed to read from one engine, so a disagreement here is a real
 * reporting bug.
 *
 * SEPTEMBER is the interesting month: it has no activity of its own. Its month
 * figures (sales, purchases, cash, profit, expenses) reset to 0, while the
 * stock position and party balances carry — and its average cost must still be
 * the weighted average of everything bought earlier rather than 0, which was
 * the original defect.
 */
const now = Date.now();
const meta = (m: number) => ({ month: m, year: 2026, createdAt: now, updatedAt: now });
const parties: Party[] = [
  { id: 'P1', name: 'Ali Traders', openingBalance: 0, createdAt: now, updatedAt: now },
  { id: 'P2', name: 'Bilal', openingBalance: 0, createdAt: now, updatedAt: now },
];
const bonds = [
  { id: 'b1', name: '1500', faceValue: 1500, createdAt: now, updatedAt: now },
  { id: 'b2', name: '750', faceValue: 750, createdAt: now, updatedAt: now },
];
const pu = (id: string, m: number, b: string, q: number, r: number): Purchase =>
  ({ id, partyId: 'P1', bondTypeId: b, quantity: q, rate: r, amount: q * r, payment: 'credit', date: `2026-0${m}-05`, ...meta(m) });
const sa = (id: string, m: number, b: string, q: number, r: number, cost: number): Sale =>
  ({ id, partyId: 'P2', bondTypeId: b, quantity: q, rate: r, amount: q * r, receipt: 'credit', costOfGoods: cost, profit: q * r - cost, date: `2026-0${m}-20`, ...meta(m) });

const data: DataSet = {
  parties, bondTypes: bonds,
  // July + August buying; NOTHING bought or sold in September.
  purchases: [pu('p1', 7, 'b1', 100, 1000), pu('p2', 8, 'b1', 100, 1400), pu('p3', 8, 'b2', 50, 700)],
  sales: [sa('s1', 8, 'b1', 40, 1600, 48000)],
  cash: [
    { id: 'c1', partyId: 'P2', direction: 'received', amount: 30000, date: '2026-08-25', ...meta(8) } as CashTransaction,
    { id: 'c2', partyId: 'P1', direction: 'paid', amount: 20000, date: '2026-08-26', ...meta(8) } as CashTransaction,
  ],
  partyAdjustments: [],
  expenses: [{ id: 'e1', kind: 'expense', category: 'Rent', amount: 18603, date: '2026-08-10', ...meta(8) } as Expense],
  closings: [], opening: null,
};
const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };

describe('September — a month with no activity of its own', () => {
  it('average cost is NOT zero; it carries the weighted average', () => {
    const b1 = computeStock(data, SEP).find((s) => s.bondTypeId === 'b1')!;
    // (100x1000 + 100x1400) / 200 = 1200
    expect(b1.avgCost).toBe(1200);
    expect(b1.avgCost).not.toBe(0);
  });

  it('quantities and value carry too', () => {
    const b1 = computeStock(data, SEP).find((s) => s.bondTypeId === 'b1')!;
    expect(b1.closingQty).toBe(160);            // 200 bought - 40 sold
    expect(b1.closingValue).toBe(192000);       // 160 x 1200
  });

  it('the month figures reset while the stock POSITION carries', () => {
    // Month-wise: September starts fresh on sales, purchases, cash and profit.
    expect(computeDashboard(data, SEP).totalSale).toBe(0);
    expect(computeDashboard(data, SEP).totalPurchase).toBe(0);
    expect(computeCashBookSummary(data, SEP).cashInHand).toBe(0);
    expect(computeProfitLoss(data, SEP)).toBe(0);
    expect(computeExpenseNet(data, SEP).expense).toBe(0);

    // ...but the bonds on the shelf and what parties owe do NOT reset.
    const aug = computeStock(data, AUG).find((s) => s.bondTypeId === 'b1')!;
    const sep = computeStock(data, SEP).find((s) => s.bondTypeId === 'b1')!;
    expect(sep.openingQty).toBe(aug.closingQty);
    expect(sep.closingQty).toBe(aug.closingQty);
    // Compare the BALANCES: `opening` legitimately differs (August's movements
    // are August's opening-plus-activity; September carries them as its opening).
    const bal = (p: typeof AUG) =>
      computePartyBalances(data, p).map((b) => ({ partyId: b.partyId, balance: b.balance }));
    expect(bal(SEP)).toEqual(bal(AUG));
  });

  it('every bond has a real average cost, none zero', () => {
    computeStock(data, SEP).filter((s) => s.closingQty > 0).forEach((s) => {
      expect(s.avgCost).toBeGreaterThan(0);
    });
  });
});

describe('Every surface reports the same figure', () => {
  for (const [label, P] of [['August', AUG], ['September', SEP]] as const) {
    it(`${label}: Cash in Hand agrees across Cash Book, dashboard and Trial Balance`, () => {
      const cash = computeCashBookSummary(data, P).cashInHand;
      expect(computeDashboard(data, P).cashInHand).toBe(cash);
      const row = computeTrialBalance(data, P).rows.find((r) => r.name === 'Cash in Hand')!;
      expect(row.debit - row.credit).toBe(cash);
    });

    it(`${label}: Profit agrees across engine, Cash Book and dashboard`, () => {
      const profit = computeProfitLoss(data, P);
      expect(computeCashBookSummary(data, P).profit).toBe(profit);
      expect(computeDashboard(data, P).profitLoss).toBe(profit);
    });

    it(`${label}: receivable / payable agree across engine, dashboard and report`, () => {
      const fin = computeFinancials(data, P);
      const d = computeDashboard(data, P);
      expect(d.cashReceivable).toBe(fin.netReceivable);
      expect(d.cashPayable).toBe(fin.netPayable);
      const sections = buildSections(data, P, 'balance');
      const rec = sections.find((s) => s.title.startsWith('RECEIVABLES'));
      const sumRec = computePartyBalances(data, P).filter((b) => b.balance > 0).reduce((a, b) => a + b.balance, 0);
      expect(fin.netReceivable).toBe(sumRec);
      if (sumRec > 0) expect(rec).toBeTruthy();
    });

    it(`${label}: the Stock report section matches the engine`, () => {
      const stock = computeStock(data, P).filter((s) => s.closingQty !== 0 || s.purchasedQty !== 0);
      const section = buildSections(data, P, 'stock')[0];
      expect(section).toBeTruthy();
      stock.forEach((line) => {
        const row = section.rows.find((r) => r[0] === line.bondTypeName);
        expect(row, `missing ${line.bondTypeName}`).toBeTruthy();
      });
    });

    it(`${label}: the Monthly Summary matches the dashboard`, () => {
      const d = computeDashboard(data, P);
      const section = buildSections(data, P, 'monthly')[0];
      const metric = (name: string) => section.rows.find((r) => r[0] === name)?.[1] as string;
      expect(metric('Cash in Hand')).toContain(Math.abs(d.cashInHand).toLocaleString());
      expect(metric('Total Sale')).toContain(d.totalSale.toLocaleString());
    });
  }
});

describe('Zeroing one figure never disturbs another', () => {
  const zeroCash: DataSet = { ...data, cashClosings: [{ id: 'cc', date: '2026-08-31', month: 8, year: 2026, amount: cashClosingAmountFor(data, AUG), createdAt: now, updatedAt: now } as ProfitClosing] };
  const zeroProfit: DataSet = { ...data, profitClosings: [{ id: 'pc', date: '2026-08-31', month: 8, year: 2026, amount: profitClosingAmountFor(data, AUG), createdAt: now, updatedAt: now } as ProfitClosing] };
  const zeroExp: DataSet = { ...data, expenseClosings: [{ id: 'ec', date: '2026-08-31', month: 8, year: 2026, amount: expenseClosingAmountFor(data, AUG), createdAt: now, updatedAt: now } as ProfitClosing] };

  it('zeroing Cash leaves profit, expenses, stock and balances alone', () => {
    expect(computeCashBookSummary(zeroCash, AUG).cashInHand).toBe(0);
    expect(computeProfitLoss(zeroCash, AUG)).toBe(computeProfitLoss(data, AUG));
    expect(computeExpenseNet(zeroCash, AUG)).toEqual(computeExpenseNet(data, AUG));
    expect(computeStock(zeroCash, AUG)).toEqual(computeStock(data, AUG));
    expect(computePartyBalances(zeroCash, AUG)).toEqual(computePartyBalances(data, AUG));
  });

  it('zeroing Profit leaves cash, stock and balances alone', () => {
    expect(computeProfitLoss(zeroProfit, AUG)).toBe(0);
    expect(computeCashBookSummary(zeroProfit, AUG).cashInHand).toBe(computeCashBookSummary(data, AUG).cashInHand);
    expect(computeStock(zeroProfit, AUG)).toEqual(computeStock(data, AUG));
    expect(computePartyBalances(zeroProfit, AUG)).toEqual(computePartyBalances(data, AUG));
  });

  it('zeroing Expense leaves cash, profit-from-trading, stock and balances alone', () => {
    expect(computeExpenseNet(zeroExp, AUG).expense).toBe(0);
    expect(computeCashBookSummary(zeroExp, AUG).cashInHand).toBe(computeCashBookSummary(data, AUG).cashInHand);
    expect(computeStock(zeroExp, AUG)).toEqual(computeStock(data, AUG));
    expect(computePartyBalances(zeroExp, AUG)).toEqual(computePartyBalances(data, AUG));
  });

  it('all three at once still leaves the records intact', () => {
    // Expense first, then profit sized against the already-zeroed expenses —
    // the order zeroMonthFigures uses, because expenses come off Profit.
    const step1: DataSet = { ...data, expenseClosings: zeroExp.expenseClosings };
    const all: DataSet = {
      ...step1,
      cashClosings: zeroCash.cashClosings,
      profitClosings: [{ id: 'pc', date: '2026-08-31', month: 8, year: 2026, amount: profitClosingAmountFor(step1, AUG), createdAt: now, updatedAt: now } as ProfitClosing],
    };
    expect(computeCashBookSummary(all, AUG).cashInHand).toBe(0);
    expect(computeProfitLoss(all, AUG)).toBe(0);
    expect(computeExpenseNet(all, AUG).expense).toBe(0);
    expect(all.sales).toEqual(data.sales);
    expect(all.purchases).toEqual(data.purchases);
    expect(all.cash).toEqual(data.cash);
    expect(all.expenses).toEqual(data.expenses);
    expect(computeStock(all, AUG)).toEqual(computeStock(data, AUG));
  });
});
