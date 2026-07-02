/**
 * Pure accounting engine. Takes raw records + opening balances and derives
 * stock, party balances, receivables/payables, trial balance and P/L.
 *
 * Convention for party balance:
 *   positive => party owes us money (receivable / debtor)
 *   negative => we owe the party money (payable / creditor)
 *
 * Purchase on credit  => we owe party         => balance -= amount
 * Sale on credit       => party owes us        => balance += amount
 * Cash received        => reduces receivable   => balance -= amount
 * Cash paid            => reduces payable       => balance += amount
 */
import type {
  Party,
  BondType,
  Purchase,
  Sale,
  CashTransaction,
  LedgerEntry,
  StockLine,
  Period,
  MonthlyClosing,
  OpeningBalances,
  Expense,
  StockAdjustment,
  PartyAdjustment,
} from '@/types';
import { formatDate, round2 } from './utils';

export interface DataSet {
  parties: Party[];
  bondTypes: BondType[];
  purchases: Purchase[];
  sales: Sale[];
  cash: CashTransaction[];
  closings: MonthlyClosing[];
  /** One-time imported opening balances (null if never migrated). */
  opening?: OpeningBalances | null;
  expenses?: Expense[];
  stockAdjustments?: StockAdjustment[];
  partyAdjustments?: PartyAdjustment[];
}

/** Net effect of expenses/income in a period: income - expense. */
export function computeExpenseNet(data: DataSet, period: Period): { expense: number; income: number; net: number } {
  const rows = (data.expenses ?? []).filter((e) => e.month === period.month && e.year === period.year);
  const expense = round2(rows.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.amount, 0));
  const income = round2(rows.filter((e) => e.kind === 'income').reduce((a, e) => a + e.amount, 0));
  return { expense, income, net: round2(income - expense) };
}

/** True when `period` is the opening's effective period (or before it). */
function isOpeningPeriod(opening: OpeningBalances | null | undefined, p: Period): boolean {
  if (!opening) return false;
  const a = opening.asOf.year * 12 + opening.asOf.month;
  const b = p.year * 12 + p.month;
  return b === a;
}

const inPeriod = (r: { month: number; year: number }, p: Period) =>
  r.month === p.month && r.year === p.year;

/**
 * Opening stock qty + avg cost for a bond. Prefers the prior month's closing
 * snapshot; if none exists and this is the migration period, uses the imported
 * opening stock from the old Excel data.
 */
function openingStockFor(
  bondTypeId: string,
  period: Period,
  closings: MonthlyClosing[],
  opening?: OpeningBalances | null
): { qty: number; avgCost: number } {
  // Find the closing for the immediately preceding period, if any.
  const prev =
    period.month === 1
      ? { month: 12, year: period.year - 1 }
      : { month: period.month - 1, year: period.year };
  const closing = closings.find(
    (c) => c.month === prev.month && c.year === prev.year
  );
  if (closing) {
    const line = closing.stockSnapshot.find((s) => s.bondTypeId === bondTypeId);
    return { qty: line?.closingQty ?? 0, avgCost: line?.avgCost ?? 0 };
  }
  const migrated = migratedOpeningStock(bondTypeId, period, opening);
  return migrated ?? { qty: 0, avgCost: 0 };
}

/** Imported opening stock for a bond, applied only in the migration period. */
function migratedOpeningStock(
  bondTypeId: string,
  period: Period,
  opening: OpeningBalances | null | undefined
): { qty: number; avgCost: number } | null {
  if (!isOpeningPeriod(opening, period)) return null;
  const line = opening!.stock.find((s) => s.bondTypeId === bondTypeId);
  return line ? { qty: line.qty, avgCost: line.avgCost } : { qty: 0, avgCost: 0 };
}

/**
 * Build the stock report for a period using weighted-average costing.
 * Opening carried from previous month's closing snapshot.
 */
export function computeStock(data: DataSet, period: Period): StockLine[] {
  return data.bondTypes.map((bt) => {
    const opening = openingStockFor(bt.id, period, data.closings, data.opening);
    const purchases = data.purchases.filter(
      (p) => p.bondTypeId === bt.id && inPeriod(p, period)
    );
    const sales = data.sales.filter(
      (s) => s.bondTypeId === bt.id && inPeriod(s, period)
    );
    const adjustments = (data.stockAdjustments ?? []).filter(
      (a) => a.bondTypeId === bt.id && inPeriod(a, period)
    );

    // Positive adjustments add stock at their cost (like a purchase); negative
    // adjustments remove stock (like a sale).
    const adjAddQty = adjustments.filter((a) => a.quantity > 0).reduce((s, a) => s + a.quantity, 0);
    const adjAddValue = adjustments.filter((a) => a.quantity > 0).reduce((s, a) => s + a.quantity * a.unitCost, 0);
    const adjRemoveQty = adjustments.filter((a) => a.quantity < 0).reduce((s, a) => s + Math.abs(a.quantity), 0);

    const purchasedQty = purchases.reduce((a, p) => a + p.quantity, 0) + adjAddQty;
    const purchasedValue = purchases.reduce((a, p) => a + p.amount, 0) + adjAddValue;
    const soldQty = sales.reduce((a, s) => a + s.quantity, 0) + adjRemoveQty;

    // Weighted average = (opening value + purchased+added value) / (opening + purchased+added qty)
    const openingValue = opening.qty * opening.avgCost;
    const totalQty = opening.qty + purchasedQty;
    const avgCost = totalQty > 0 ? (openingValue + purchasedValue) / totalQty : 0;

    const closingQty = totalQty - soldQty;

    return {
      bondTypeId: bt.id,
      bondTypeName: bt.name,
      openingQty: opening.qty,
      purchasedQty,
      soldQty,
      closingQty,
      avgCost: round2(avgCost),
      closingValue: round2(closingQty * avgCost),
    };
  });
}

/** Live stock available for a bond in a period (for oversell prevention). */
export function availableStock(
  data: DataSet,
  bondTypeId: string,
  period: Period
): number {
  const line = computeStock(data, period).find((s) => s.bondTypeId === bondTypeId);
  return line?.closingQty ?? 0;
}

/** Weighted-average PURCHASE rate for a bond (profit basis only — no valuation).
 *  Prize-bond model: stock is unlimited, so we only need the average buy rate to
 *  compute sale profit. Uses all purchases in the period (+ carried avg). */
export function avgCostFor(
  data: DataSet,
  bondTypeId: string,
  period: Period
): number {
  const opening = openingStockFor(bondTypeId, period, data.closings, data.opening);
  const purchases = data.purchases.filter((p) => p.bondTypeId === bondTypeId && inPeriod(p, period));
  const pQty = purchases.reduce((a, p) => a + p.quantity, 0);
  const pVal = purchases.reduce((a, p) => a + p.amount, 0);
  const totalQty = opening.qty + pQty;
  const totalVal = opening.qty * opening.avgCost + pVal;
  return totalQty > 0 ? round2(totalVal / totalQty) : (purchases[0]?.rate ?? 0);
}

/**
 * Prize-bond running movement per denomination: purchased qty, sold qty, and
 * net qty (may be NEGATIVE — that's fine, stock is unlimited). NO valuation.
 */
export interface BondMovement {
  bondTypeId: string;
  bondTypeName: string;
  purchasedQty: number;
  soldQty: number;
  netQty: number;      // purchased - sold; can be negative
  avgBuyRate: number;  // for reference
}

/** Realised profit per bond denomination (Σ sale.profit grouped by bond). */
export function computeProfitByBond(data: DataSet, period: Period): { bondTypeId: string; bondTypeName: string; profit: number }[] {
  return data.bondTypes.map((bt) => ({
    bondTypeId: bt.id,
    bondTypeName: bt.name,
    profit: round2(
      data.sales
        .filter((s) => s.bondTypeId === bt.id && inPeriod(s, period))
        .reduce((a, s) => a + s.profit, 0)
    ),
  }));
}

export function computeBondMovement(data: DataSet, period: Period): BondMovement[] {
  return data.bondTypes.map((bt) => {
    const purchases = data.purchases.filter((p) => p.bondTypeId === bt.id && inPeriod(p, period));
    const sales = data.sales.filter((s) => s.bondTypeId === bt.id && inPeriod(s, period));
    const opening = openingStockFor(bt.id, period, data.closings, data.opening);
    const purchasedQty = purchases.reduce((a, p) => a + p.quantity, 0);
    const soldQty = sales.reduce((a, s) => a + s.quantity, 0);
    const pVal = purchases.reduce((a, p) => a + p.amount, 0);
    const totQty = opening.qty + purchasedQty;
    const avgBuyRate = totQty > 0 ? round2((opening.qty * opening.avgCost + pVal) / totQty) : 0;
    return {
      bondTypeId: bt.id,
      bondTypeName: bt.name,
      purchasedQty,
      soldQty,
      netQty: (opening.qty + purchasedQty) - soldQty,
      avgBuyRate,
    };
  });
}

/**
 * Business summary — the only figures a prize-bond owner watches. No debit/
 * credit, no stock valuation.
 */
export interface BusinessSummary {
  cashInHand: number;
  totalProfitLoss: number;  // sale profit + income - expense
  purchaseProfit: number;   // profit attributable to buying below sell avg (see note)
  saleProfit: number;       // trading profit from sales (sell - avg buy)
  netReceivable: number;    // sum of positive party net balances
  netPayable: number;       // sum of negative party net balances (abs)
  totalPurchased: number;   // total bonds bought (qty)
  totalSold: number;        // total bonds sold (qty)
  netBonds: number;         // purchased - sold
}

export function computeBusinessSummary(data: DataSet, period: Period): BusinessSummary {
  const saleProfit = computeTradingProfit(data, period);
  const { expense, income } = computeExpenseNet(data, period);
  const balances = computePartyBalances(data, period);
  const netReceivable = round2(balances.filter((b) => b.balance > 0).reduce((a, b) => a + b.balance, 0));
  const netPayable = round2(balances.filter((b) => b.balance < 0).reduce((a, b) => a + Math.abs(b.balance), 0));
  const mv = computeBondMovement(data, period);
  const totalPurchased = mv.reduce((a, m) => a + m.purchasedQty, 0);
  const totalSold = mv.reduce((a, m) => a + m.soldQty, 0);

  // Realised trading profit = Σ (sell rate − avg buy rate) × qty sold. The owner
  // wants it visible per denomination (see computeProfitByBond). Both KPI cards
  // reflect this realised margin; Total P/L folds in income/expenses.
  const purchaseProfit = saleProfit;
  const totalProfitLoss = round2(saleProfit + income - expense);

  return {
    cashInHand: computeCashInHand(data, period),
    totalProfitLoss,
    purchaseProfit: round2(purchaseProfit),
    saleProfit: round2(saleProfit),
    netReceivable,
    netPayable,
    totalPurchased,
    totalSold,
    netBonds: totalPurchased - totalSold,
  };
}

/**
 * Opening party balance carried from previous closing. If no prior closing:
 * apply the party's opening balance ONLY in the migration period (or, when
 * there is no migration, in the party's first-ever period via openingBalance).
 * This prevents the imported opening from being re-counted every month.
 */
function openingPartyBalance(
  party: Party,
  period: Period,
  closings: MonthlyClosing[],
  opening?: OpeningBalances | null
): number {
  const prev =
    period.month === 1
      ? { month: 12, year: period.year - 1 }
      : { month: period.month - 1, year: period.year };
  const closing = closings.find(
    (c) => c.month === prev.month && c.year === prev.year
  );
  if (closing) {
    const found = closing.partyBalances.find((b) => b.partyId === party.id);
    return found?.balance ?? 0;
  }
  // No prior closing. If a migration exists, only the migration period gets the
  // imported opening; later un-closed months start from zero (they should have
  // been closed to carry forward). Without a migration, use the raw opening.
  if (opening) {
    return isOpeningPeriod(opening, period) ? party.openingBalance ?? 0 : 0;
  }
  return party.openingBalance ?? 0;
}

export interface PartyBalance {
  partyId: string;
  name: string;
  opening: number;
  balance: number; // opening + movements within period
}

/** Party running balances for a period, including carried opening. */
export function computePartyBalances(data: DataSet, period: Period): PartyBalance[] {
  return data.parties.map((party) => {
    const opening = openingPartyBalance(party, period, data.closings, data.opening);
    let balance = opening;

    data.purchases
      .filter((p) => p.partyId === party.id && inPeriod(p, period) && p.payment === 'credit')
      .forEach((p) => (balance -= p.amount));
    data.sales
      .filter((s) => s.partyId === party.id && inPeriod(s, period) && s.receipt === 'credit')
      .forEach((s) => (balance += s.amount));
    data.cash
      .filter((c) => c.partyId === party.id && inPeriod(c, period))
      .forEach((c) => {
        if (c.direction === 'received') balance -= c.amount;
        else balance += c.amount;
      });
    // Manual party adjustments: +receivable / -payable (no cash effect).
    (data.partyAdjustments ?? [])
      .filter((a) => a.partyId === party.id && inPeriod(a, period))
      .forEach((a) => (balance += a.amount));

    return { partyId: party.id, name: party.name, opening, balance: round2(balance) };
  });
}

export function computeReceivables(data: DataSet, period: Period): PartyBalance[] {
  return computePartyBalances(data, period).filter((b) => b.balance > 0.005);
}

export function computePayables(data: DataSet, period: Period): PartyBalance[] {
  return computePartyBalances(data, period)
    .filter((b) => b.balance < -0.005)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }));
}

/** Net cash position from cash transactions in the period. */
export function computeCashInHand(data: DataSet, period: Period): number {
  let cash = 0;
  data.purchases
    .filter((p) => inPeriod(p, period) && p.payment === 'cash')
    .forEach((p) => (cash -= p.amount));
  data.sales
    .filter((s) => inPeriod(s, period) && s.receipt === 'cash')
    .forEach((s) => (cash += s.amount));
  data.cash.filter((c) => inPeriod(c, period)).forEach((c) => {
    if (c.direction === 'received') cash += c.amount;
    else cash -= c.amount;
  });
  // Client rule: a manual RECEIVABLE (+amount) is money IN, a manual PAYABLE
  // (-amount) is money OUT — they hit Cash in Hand immediately when entered.
  // Settlements (Receive/Pay) only clear the balance, so they don't touch cash.
  (data.partyAdjustments ?? [])
    .filter((a) => inPeriod(a, period) && !a.settlement)
    .forEach((a) => (cash += a.amount));
  // Expenses reduce cash; income increases it.
  const { net } = computeExpenseNet(data, period);
  cash += net;
  return round2(cash);
}

export interface CashBookLine {
  date: string;
  description: string;
  /** money in (+) */
  inflow: number;
  /** money out (-) */
  outflow: number;
}

/**
 * Cash Book: every cash movement in the period — cash sales/purchases,
 * cash received/paid, plus expenses (out) and income (in). Running balance
 * matches computeCashInHand. Used for the "Cash Book" statement view.
 */
export function computeCashBook(data: DataSet, period: Period): CashBookLine[] {
  const lines: CashBookLine[] = [];
  data.sales.filter((s) => inPeriod(s, period) && s.receipt === 'cash')
    .forEach((s) => lines.push({ date: s.date, description: `Cash Sale (${s.quantity} bond)`, inflow: s.amount, outflow: 0 }));
  data.purchases.filter((p) => inPeriod(p, period) && p.payment === 'cash')
    .forEach((p) => lines.push({ date: p.date, description: `Cash Purchase (${p.quantity} bond)`, inflow: 0, outflow: p.amount }));
  data.cash.filter((c) => inPeriod(c, period)).forEach((c) => {
    if (c.direction === 'received') lines.push({ date: c.date, description: 'Cash Received', inflow: c.amount, outflow: 0 });
    else lines.push({ date: c.date, description: 'Cash Paid', inflow: 0, outflow: c.amount });
  });
  (data.expenses ?? []).filter((e) => inPeriod(e, period)).forEach((e) => {
    if (e.kind === 'income') lines.push({ date: e.date, description: `Income · ${e.category}`, inflow: e.amount, outflow: 0 });
    else lines.push({ date: e.date, description: `Expense · ${e.category}`, inflow: 0, outflow: e.amount });
  });
  return lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Total imported bank/"file" account balances (assets), shown from opening on. */
export function computeFileBalance(opening: OpeningBalances | null | undefined): number {
  if (!opening) return 0;
  return round2(opening.files.reduce((a, f) => a + f.balance, 0));
}

/** Build a full ledger for a specific party in a period. */
export function computeLedger(
  data: DataSet,
  partyId: string,
  period: Period
): LedgerEntry[] {
  const party = data.parties.find((p) => p.id === partyId);
  const entries: LedgerEntry[] = [];
  if (!party) return entries;

  const opening = openingPartyBalance(party, period, data.closings, data.opening);
  entries.push({
    id: 'opening',
    partyId,
    refType: 'opening',
    refId: 'opening',
    description: 'Opening Balance',
    debit: opening > 0 ? opening : 0,
    credit: opening < 0 ? Math.abs(opening) : 0,
    date: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
    month: period.month,
    year: period.year,
    createdAt: 0,
    updatedAt: 0,
  });

  data.purchases
    .filter((p) => p.partyId === partyId && inPeriod(p, period))
    .forEach((p) =>
      entries.push({
        id: 'p-' + p.id,
        partyId,
        refType: 'purchase',
        refId: p.id,
        description: `Purchase ${p.quantity} × bond @ ${p.rate}${p.payment === 'cash' ? ' (cash)' : ''}`,
        debit: 0,
        credit: p.payment === 'credit' ? p.amount : 0,
        date: p.date,
        month: p.month,
        year: p.year,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })
    );

  data.sales
    .filter((s) => s.partyId === partyId && inPeriod(s, period))
    .forEach((s) =>
      entries.push({
        id: 's-' + s.id,
        partyId,
        refType: 'sale',
        refId: s.id,
        description: `Sale ${s.quantity} × bond @ ${s.rate}${s.receipt === 'cash' ? ' (cash)' : ''}`,
        debit: s.receipt === 'credit' ? s.amount : 0,
        credit: 0,
        date: s.date,
        month: s.month,
        year: s.year,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
    );

  data.cash
    .filter((c) => c.partyId === partyId && inPeriod(c, period))
    .forEach((c) =>
      entries.push({
        id: 'c-' + c.id,
        partyId,
        refType: 'cash',
        refId: c.id,
        description: c.direction === 'received' ? 'Cash Received' : 'Cash Paid',
        debit: c.direction === 'paid' ? c.amount : 0,
        credit: c.direction === 'received' ? c.amount : 0,
        date: c.date,
        month: c.month,
        year: c.year,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
    );

  (data.partyAdjustments ?? [])
    .filter((a) => a.partyId === partyId && inPeriod(a, period))
    .forEach((a) =>
      entries.push({
        id: 'pa-' + a.id,
        partyId,
        refType: 'opening',
        refId: a.id,
        description: a.reason || (a.amount > 0 ? 'Receivable added' : 'Payable added'),
        debit: a.amount > 0 ? a.amount : 0,
        credit: a.amount < 0 ? Math.abs(a.amount) : 0,
        date: a.date,
        month: a.month,
        year: a.year,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })
    );

  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface TrialBalanceRow {
  name: string;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/**
 * Trial balance built from party balances, cash-in-hand and closing stock.
 * Assets (debits): receivables, cash, stock.  Liabilities (credits): payables.
 * P/L balances the difference (retained within period).
 */
export function computeTrialBalance(data: DataSet, period: Period): TrialBalance {
  const balances = computePartyBalances(data, period);
  const rows: TrialBalanceRow[] = [];

  const receivable = balances
    .filter((b) => b.balance > 0)
    .reduce((a, b) => a + b.balance, 0);
  const payable = balances
    .filter((b) => b.balance < 0)
    .reduce((a, b) => a + Math.abs(b.balance), 0);
  const cash = computeCashInHand(data, period);
  const bank = computeFileBalance(data.opening);
  const stock = computeStock(data, period).reduce((a, s) => a + s.closingValue, 0);
  const profit = computeProfitLoss(data, period);

  rows.push({ name: 'Cash in Hand', debit: Math.max(cash, 0), credit: Math.max(-cash, 0) });
  if (bank !== 0) rows.push({ name: 'Bank / File Accounts', debit: Math.max(bank, 0), credit: Math.max(-bank, 0) });
  rows.push({ name: 'Accounts Receivable', debit: receivable, credit: 0 });
  rows.push({ name: 'Closing Stock', debit: stock, credit: 0 });
  rows.push({ name: 'Accounts Payable', debit: 0, credit: payable });
  rows.push({
    name: 'Profit / (Loss)',
    debit: profit < 0 ? Math.abs(profit) : 0,
    credit: profit > 0 ? profit : 0,
  });

  // NOTE: We intentionally DO NOT add an auto-calculated "Opening Capital /
  // Equity" plug. The client does not want transaction amounts (receivables,
  // payables, sales, purchases, cash, profit) flowing into a synthetic capital
  // figure. These rows are a plain business summary, not a double-entry trial
  // balance, so they are not forced to tie out.
  const totalDebit = round2(rows.reduce((a, r) => a + r.debit, 0));
  const totalCredit = round2(rows.reduce((a, r) => a + r.credit, 0));

  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 1,
  };
}

/**
 * Period profit = trading profit (sale revenue - weighted-avg COGS)
 * plus other income minus expenses.
 */
export function computeProfitLoss(data: DataSet, period: Period): number {
  const trading = data.sales
    .filter((s) => inPeriod(s, period))
    .reduce((a, s) => a + s.profit, 0);
  const { net } = computeExpenseNet(data, period);
  return round2(trading + net);
}

/** Trading-only profit (before expenses/income), for reporting clarity. */
export function computeTradingProfit(data: DataSet, period: Period): number {
  return round2(
    data.sales.filter((s) => inPeriod(s, period)).reduce((a, s) => a + s.profit, 0)
  );
}

export interface DashboardStats {
  totalPurchase: number;
  totalSale: number;
  closingStockQty: number;
  closingStockValue: number;
  cashReceivable: number;
  cashPayable: number;
  cashInHand: number;
  netBalance: number;
  profitLoss: number;
  totalExpense: number;
  totalIncome: number;
  trialBalanced: boolean;
}

export function computeDashboard(data: DataSet, period: Period): DashboardStats {
  const totalPurchase = round2(
    data.purchases.filter((p) => inPeriod(p, period)).reduce((a, p) => a + p.amount, 0)
  );
  const totalSale = round2(
    data.sales.filter((s) => inPeriod(s, period)).reduce((a, s) => a + s.amount, 0)
  );
  const stock = computeStock(data, period);
  const closingStockQty = stock.reduce((a, s) => a + s.closingQty, 0);
  const closingStockValue = round2(stock.reduce((a, s) => a + s.closingValue, 0));
  const receivables = computeReceivables(data, period).reduce((a, b) => a + b.balance, 0);
  const payables = computePayables(data, period).reduce((a, b) => a + b.balance, 0);
  const cashInHand = computeCashInHand(data, period);
  const bank = computeFileBalance(data.opening);
  const exp = computeExpenseNet(data, period);
  const tb = computeTrialBalance(data, period);

  return {
    totalPurchase,
    totalSale,
    closingStockQty,
    closingStockValue,
    cashReceivable: round2(receivables),
    cashPayable: round2(payables),
    cashInHand,
    // Net worth-ish position: assets - liabilities.
    netBalance: round2(cashInHand + bank + receivables + closingStockValue - payables),
    profitLoss: computeProfitLoss(data, period),
    totalExpense: exp.expense,
    totalIncome: exp.income,
    trialBalanced: tb.balanced,
  };
}

/** Human-readable ledger label for a party. */
export function ledgerRunningBalance(entries: LedgerEntry[]): number[] {
  let bal = 0;
  return entries.map((e) => {
    bal += e.debit - e.credit;
    return round2(bal);
  });
}

export function describeEntryDate(iso: string): string {
  return formatDate(iso);
}
