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
import { formatDate, formatNumber, round2 } from './utils';

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

/**
 * LIVE profit for one sale = amount − (current average purchase cost × qty).
 * Computed from the CURRENT data, not the cost frozen on the sale record — so
 * profit is correct regardless of the order purchases/sales were entered
 * (e.g. a sale saved before its purchase no longer over-reports profit).
 */
export function saleProfitLive(data: DataSet, sale: Sale, period: Period): number {
  const avg = avgCostFor(data, sale.bondTypeId, period);
  return round2(sale.amount - avg * sale.quantity);
}

/** Realised profit per bond denomination (live). */
export function computeProfitByBond(data: DataSet, period: Period): { bondTypeId: string; bondTypeName: string; profit: number }[] {
  return data.bondTypes.map((bt) => ({
    bondTypeId: bt.id,
    bondTypeName: bt.name,
    profit: round2(
      data.sales
        .filter((s) => s.bondTypeId === bt.id && inPeriod(s, period))
        .reduce((a, s) => a + saleProfitLive(data, s, period), 0)
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
  totalSaleAmount: number;  // total sales value (Rs)
  totalPurchaseAmount: number; // total purchases value (Rs)
  netBonds: number;         // purchased - sold
}

export function computeBusinessSummary(data: DataSet, period: Period): BusinessSummary {
  const saleProfit = computeTradingProfit(data, period);
  // All party/cash totals come from the one Financial Engine.
  const fin = computeFinancials(data, period);
  const mv = computeBondMovement(data, period);
  const totalPurchased = mv.reduce((a, m) => a + m.purchasedQty, 0);
  const totalSold = mv.reduce((a, m) => a + m.soldQty, 0);

  // Trading margin (for the per-bond profit table). Net Profit below uses the
  // single source of truth (computeProfitLoss = trading + income − expenses).
  const purchaseProfit = saleProfit;
  const totalProfitLoss = computeProfitLoss(data, period);
  const totalSaleAmount = round2(data.sales.filter((s) => inPeriod(s, period)).reduce((a, s) => a + s.amount, 0));
  const totalPurchaseAmount = round2(data.purchases.filter((p) => inPeriod(p, period)).reduce((a, p) => a + p.amount, 0));

  return {
    // Cash in Hand matches the Cash Book screen formula (single display source).
    cashInHand: computeCashBookSummary(data, period).cashInHand,
    totalProfitLoss,
    purchaseProfit: round2(purchaseProfit),
    saleProfit: round2(saleProfit),
    netReceivable: fin.netReceivable,
    netPayable: fin.netPayable,
    totalPurchased,
    totalSold,
    totalSaleAmount,
    totalPurchaseAmount,
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
    if (!isOpeningPeriod(opening, period)) return 0;
    // The opening snapshot's per-party balances are the source of truth (the
    // Opening Wizard writes them here); fall back to the party record's field.
    const snap = opening.parties?.find((p) => p.partyId === party.id);
    return snap ? snap.balance : party.openingBalance ?? 0;
  }
  return party.openingBalance ?? 0;
}

export interface PartyBalance {
  partyId: string;
  name: string;
  opening: number;
  balance: number; // opening + movements within period
}

/** How much a party has purchased (from us) and sold (to us) this period, in Rs. */
export function partyTradeTotals(data: DataSet, partyId: string, period: Period): { purchased: number; sold: number } {
  const purchased = round2(
    data.purchases.filter((p) => p.partyId === partyId && inPeriod(p, period)).reduce((a, p) => a + p.amount, 0)
  );
  const sold = round2(
    data.sales.filter((s) => s.partyId === partyId && inPeriod(s, period)).reduce((a, s) => a + s.amount, 0)
  );
  return { purchased, sold };
}

/** Total cash Received from / Paid to a party this period, in Rs. */
export function partyCashTotals(data: DataSet, partyId: string, period: Period): { received: number; paid: number } {
  const rows = data.cash.filter((c) => c.partyId === partyId && inPeriod(c, period));
  const received = round2(rows.filter((c) => c.direction === 'received').reduce((a, c) => a + c.amount, 0));
  const paid = round2(rows.filter((c) => c.direction === 'paid').reduce((a, c) => a + c.amount, 0));
  return { received, paid };
}

/**
 * Party running balances for a period.
 *
 * Receivable / Payable come ONLY from:
 *   - the carried opening balance
 *   - manual Receivable / Payable entries (partyAdjustments)
 *   - cash Cash Receivable / Cash Payable against a party
 *
 * Sign (name-matches-card): a "Cash Receivable" entry (direction 'received')
 * increases the party's RECEIVABLE (balance +); a "Cash Payable" entry
 * (direction 'paid') increases the PAYABLE (balance −). So the amount always
 * shows under the card whose name matches the button pressed.
 *
 * Sales & Purchases do NOT affect Receivable/Payable — they belong to the Total
 * Sales / Purchases figures only.
 */
export function computePartyBalances(data: DataSet, period: Period): PartyBalance[] {
  return data.parties.map((party) => {
    const opening = openingPartyBalance(party, period, data.closings, data.opening);
    let balance = opening;

    // Cash Receivable (received) => +receivable; Cash Payable (paid) => -payable.
    data.cash
      .filter((c) => c.partyId === party.id && inPeriod(c, period))
      .forEach((c) => {
        if (c.direction === 'received') balance += c.amount;
        else balance -= c.amount;
      });
    // Manual party adjustments: +receivable / -payable.
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

export interface SettlementSummary {
  receivableCreated: number; // gross non-settlement receivable adjustments (+)
  received: number;          // gross receive settlements applied
  pendingReceivable: number; // net receivable still outstanding
  payableCreated: number;    // gross non-settlement payable adjustments (abs)
  paid: number;              // gross pay settlements applied
  pendingPayable: number;    // net payable still outstanding
}

/**
 * Split manual adjustments into "created" vs "settled" so reports can show
 * Total Receivable Created / Received / Pending (and payable equivalents).
 * Pending = the live net from computeReceivables/computePayables.
 */
export function computeSettlementSummary(data: DataSet, period: Period): SettlementSummary {
  const adj = (data.partyAdjustments ?? []).filter((a) => inPeriod(a, period));
  const created = adj.filter((a) => !a.settlement);
  const settled = adj.filter((a) => a.settlement);
  const sum = (arr: PartyAdjustment[], pred: (a: PartyAdjustment) => boolean) =>
    round2(arr.filter(pred).reduce((s, a) => s + Math.abs(a.amount), 0));

  const pendingReceivable = round2(computeReceivables(data, period).reduce((s, b) => s + b.balance, 0));
  const pendingPayable = round2(computePayables(data, period).reduce((s, b) => s + b.balance, 0));

  return {
    receivableCreated: sum(created, (a) => a.amount > 0),
    received: sum(settled, (a) => a.amount < 0), // receive settlement is negative
    pendingReceivable,
    payableCreated: sum(created, (a) => a.amount < 0),
    paid: sum(settled, (a) => a.amount > 0),      // pay settlement is positive
    pendingPayable,
  };
}

export interface PartyOption {
  id: string;
  name: string;
  /** Net balance: +receivable / -payable / 0 settled. */
  balance: number;
  status: 'Receivable' | 'Payable' | 'Settled';
}

/**
 * The Ledger party dropdown list. ALWAYS built from the master Parties
 * collection (never from ledger entries / transactions), so parties without any
 * transactions still appear. Sorted A→Z case-insensitively, each carrying its
 * current net balance + status for display.
 */
export function partyDropdownOptions(data: DataSet, period: Period): PartyOption[] {
  const balances = computePartyBalances(data, period);
  const balOf = (id: string) => balances.find((b) => b.partyId === id)?.balance ?? 0;
  return [...data.parties]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((p) => {
      const balance = balOf(p.id);
      return {
        id: p.id,
        name: p.name,
        balance,
        status: balance > 0.005 ? 'Receivable' : balance < -0.005 ? 'Payable' : 'Settled',
      };
    });
}

/** Net cash position from cash transactions in the period. */
export function computeCashInHand(data: DataSet, period: Period): number {
  let cash = 0;
  // Opening cash from the migration snapshot, applied from the opening period on
  // (it's a carried-in balance, not a transaction, so it never affects profit).
  if (data.opening?.openingCash && isOpeningPeriod(data.opening, period)) {
    cash += data.opening.openingCash;
  }
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
  // NOTE: Expenses & income do NOT touch Cash in Hand — they affect Profit/Loss
  // only (they post to the Expense / Income account, not the cash account). So
  // recording an expense with no cash movement leaves Cash in Hand unchanged.
  // Manual receivable/payable adjustments are also NOT cash here — they move
  // real cash only when settled via Receive/Pay (recorded as cash above).
  return round2(cash);
}

/**
 * THE single source of truth for all party/cash totals shown anywhere in the
 * app (dashboard cards, Business Summary, reports, PDF, Excel). Never sum raw
 * receivable/payable collections directly — always go through here.
 *
 *   1. Each party is netted to ONE balance (computePartyBalances):
 *        partyNet = opening + credit sales + payments in
 *                 - credit purchases - payments out + adjustments
 *      partyNet > 0 => receivable, < 0 => payable, = 0 => hidden.
 *   2. netReceivable = Σ partyNet where partyNet > 0
 *      netPayable    = |Σ partyNet where partyNet < 0|
 *   3. cashInHand = PHYSICAL CASH ONLY = openingCash + cashSales - cashPurchases
 *        + cashReceived - cashPaid + income - expenses.
 *      Receivable/Payable are NOT folded into cash — they are separate figures
 *      shown on their own cards. cashInHand === computeCashInHand (the SAME
 *      value the Cash Book & Monthly Closing use).
 */
export interface Financials {
  rawCash: number;         // physical cash from cash events
  netReceivable: number;   // Σ positive party nets (own card, NOT in cash)
  netPayable: number;      // |Σ negative party nets| (own card, NOT in cash)
  netParty: number;        // netReceivable - netPayable (informational)
  cashInHand: number;      // === rawCash — physical cash only
}
export function computeFinancials(data: DataSet, period: Period): Financials {
  const balances = computePartyBalances(data, period);
  const netReceivable = round2(balances.reduce((a, b) => (b.balance > 0 ? a + b.balance : a), 0));
  const netPayable = round2(balances.reduce((a, b) => (b.balance < 0 ? a + Math.abs(b.balance) : a), 0));
  const rawCash = computeCashInHand(data, period);
  const netParty = round2(netReceivable - netPayable);
  return {
    rawCash,
    netReceivable,
    netPayable,
    netParty,
    // Cash in Hand is PHYSICAL CASH ONLY — receivable/payable are NOT added.
    cashInHand: rawCash,
  };
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
    .forEach((s) => lines.push({ date: s.date, description: describeSale(data, s), inflow: s.amount, outflow: 0 }));
  data.purchases.filter((p) => inPeriod(p, period) && p.payment === 'cash')
    .forEach((p) => lines.push({ date: p.date, description: describePurchase(data, p), inflow: 0, outflow: p.amount }));
  data.cash.filter((c) => inPeriod(c, period)).forEach((c) => {
    if (c.direction === 'received') lines.push({ date: c.date, description: describeCash(data, c), inflow: c.amount, outflow: 0 });
    else lines.push({ date: c.date, description: describeCash(data, c), inflow: 0, outflow: c.amount });
  });
  (data.expenses ?? []).filter((e) => inPeriod(e, period)).forEach((e) => {
    if (e.kind === 'income') lines.push({ date: e.date, description: `Income · ${e.category}`, inflow: e.amount, outflow: 0 });
    else lines.push({ date: e.date, description: `Expense · ${e.category}`, inflow: 0, outflow: e.amount });
  });
  return lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Unified Cash Book / transaction view. ONE reactive list over the existing
 * collections — every Purchase, Sale, Cash Receipt, Cash Payment, Expense and
 * Adjustment written to Firebase appears here as a typed row. This is a pure
 * projection: it adds NO writes and changes NO existing calculation.
 *
 * `cashDelta` is the row's effect on physical Cash in Hand (signed): cash
 * sales/receipts/income are +, cash purchases/payments/expenses are −, and
 * credit trades / manual adjustments are 0 (they show but don't move cash). The
 * running total of cashDelta therefore reconciles with computeCashInHand.
 */
export type TxnBookType =
  | 'Purchase' | 'Sale' | 'Receivable' | 'Payable' | 'Expense' | 'Income' | 'Adjustment';

export interface TxnBookRow {
  id: string;          // stable, collection-qualified (e.g. "sale:<docId>")
  refId: string;       // raw Firestore document id
  collection: 'purchases' | 'sales' | 'cashTransactions' | 'expenses' | 'partyAdjustments';
  date: string;
  createdAt: number;
  voucher: string;     // human voucher no (PUR-01, SAL-02, …)
  type: TxnBookType;
  partyId?: string;
  partyName: string;
  description: string;
  qty?: number;        // bond trades only
  rate?: number;       // bond trades only
  amount: number;      // gross transaction value (always positive)
  cashDelta: number;   // signed effect on physical cash (0 = non-cash row)
}

export function computeTransactionBook(data: DataSet, period: Period): TxnBookRow[] {
  const rows: TxnBookRow[] = [];
  const seq: Record<string, number> = {};
  const voucher = (prefix: string) => {
    seq[prefix] = (seq[prefix] ?? 0) + 1;
    return `${prefix}-${String(seq[prefix]).padStart(2, '0')}`;
  };

  data.purchases.filter((p) => inPeriod(p, period)).forEach((p) =>
    rows.push({
      id: 'purchase:' + p.id, refId: p.id, collection: 'purchases',
      date: p.date, createdAt: p.createdAt, voucher: voucher('PUR'), type: 'Purchase',
      partyId: p.partyId, partyName: nameOfParty(data, p.partyId),
      description: describePurchase(data, p), qty: p.quantity, rate: p.rate,
      amount: p.amount, cashDelta: p.payment === 'cash' ? -p.amount : 0,
    })
  );
  data.sales.filter((s) => inPeriod(s, period)).forEach((s) =>
    rows.push({
      id: 'sale:' + s.id, refId: s.id, collection: 'sales',
      date: s.date, createdAt: s.createdAt, voucher: voucher('SAL'), type: 'Sale',
      partyId: s.partyId, partyName: nameOfParty(data, s.partyId),
      description: describeSale(data, s), qty: s.quantity, rate: s.rate,
      amount: s.amount, cashDelta: s.receipt === 'cash' ? s.amount : 0,
    })
  );
  data.cash.filter((c) => inPeriod(c, period)).forEach((c) => {
    const received = c.direction === 'received';
    rows.push({
      id: 'cash:' + c.id, refId: c.id, collection: 'cashTransactions',
      date: c.date, createdAt: c.createdAt,
      voucher: voucher(received ? 'RCV' : 'PAY'), type: received ? 'Receivable' : 'Payable',
      partyId: c.partyId, partyName: nameOfParty(data, c.partyId),
      description: describeCash(data, c),
      amount: c.amount, cashDelta: received ? c.amount : -c.amount,
    });
  });
  (data.expenses ?? []).filter((e) => inPeriod(e, period)).forEach((e) => {
    const income = e.kind === 'income';
    rows.push({
      id: 'expense:' + e.id, refId: e.id, collection: 'expenses',
      date: e.date, createdAt: e.createdAt,
      voucher: voucher(income ? 'INC' : 'EXP'), type: income ? 'Income' : 'Expense',
      partyName: income ? `Income · ${e.category}` : `Expense · ${e.category}`,
      description: e.description?.trim() || (income ? `Income · ${e.category}` : `Expense · ${e.category}`),
      // Expenses/income are NON-cash in this engine (see computeCashInHand) —
      // they post to their own account, so they do NOT move Cash in Hand.
      amount: e.amount, cashDelta: 0,
    });
  });
  (data.partyAdjustments ?? []).filter((a) => inPeriod(a, period)).forEach((a) =>
    rows.push({
      id: 'adjustment:' + a.id, refId: a.id, collection: 'partyAdjustments',
      date: a.date, createdAt: a.createdAt, voucher: voucher('ADJ'), type: 'Adjustment',
      partyId: a.partyId, partyName: nameOfParty(data, a.partyId),
      description: describeAdjustment(a),
      amount: Math.abs(a.amount), cashDelta: 0,
    })
  );

  // Chronological, stable by creation order for same-day rows.
  return rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt
  );
}

/**
 * Cash Book summary — every headline figure the single Cash Book screen shows.
 *
 * CLIENT CASH FORMULA (this screen only):
 *   Cash in Hand = (Total Sales − Total Purchases) + (Cash Received − Cash Paid)
 * i.e. ALL sales/purchases count toward cash here (not just no-party ones), plus
 * the net of cash receipts/payments. Profit, Receivable and Payable are shown as
 * SEPARATE figures and are NOT folded into this cash number.
 *
 * NOTE: This is the Cash Book's own presentation figure. The trial balance and
 * other reports keep using computeCashInHand (physical cash) unchanged.
 */
export interface CashBookSummary {
  totalSales: number;
  totalPurchases: number;
  totalReceived: number;
  totalPaid: number;
  cashInHand: number;    // (Sales − Purchases) + (Received − Paid)
  receivable: number;    // Σ positive party balances
  payable: number;       // |Σ negative party balances|
  profit: number;        // trading profit = Sales − Cost of Sales
  txnCount: number;
}

export function computeCashBookSummary(data: DataSet, period: Period): CashBookSummary {
  const totalSales = round2(
    data.sales.filter((s) => inPeriod(s, period)).reduce((a, s) => a + s.amount, 0)
  );
  const totalPurchases = round2(
    data.purchases.filter((p) => inPeriod(p, period)).reduce((a, p) => a + p.amount, 0)
  );
  const cashRows = data.cash.filter((c) => inPeriod(c, period));
  const totalReceived = round2(cashRows.filter((c) => c.direction === 'received').reduce((a, c) => a + c.amount, 0));
  const totalPaid = round2(cashRows.filter((c) => c.direction === 'paid').reduce((a, c) => a + c.amount, 0));

  const fin = computeFinancials(data, period);

  return {
    totalSales,
    totalPurchases,
    totalReceived,
    totalPaid,
    // Client formula: (Sales − Purchases) + (Received − Paid). Expenses are NOT
    // part of Cash in Hand — they only reduce Profit.
    cashInHand: round2((totalSales - totalPurchases) + (totalReceived - totalPaid)),
    receivable: fin.netReceivable,
    payable: fin.netPayable,
    // Net Profit = trading − expenses (same single source of truth everywhere).
    profit: computeProfitLoss(data, period),
    txnCount: computeTransactionBook(data, period).length,
  };
}

/** Total imported bank/"file" account balances (assets), shown from opening on. */
export function computeFileBalance(opening: OpeningBalances | null | undefined): number {
  if (!opening) return 0;
  return round2(opening.files.reduce((a, f) => a + f.balance, 0));
}

/** Party display name (falls back to "Cash" when no party is attached). */
function nameOfParty(data: DataSet, id: string | undefined): string {
  if (!id) return 'Cash';
  return data.parties.find((p) => p.id === id)?.name ?? 'Cash';
}
/** Bond denomination label, e.g. "Rs. 100 Prize Bonds". */
function nameOfBond(data: DataSet, id: string): string {
  const b = data.bondTypes.find((x) => x.id === id);
  return b ? `Rs. ${b.name} Prize Bonds` : 'Prize Bonds';
}
/** "… from X" / "… to X"; omits the party phrase for cash-only entries. */
function withParty(prefix: string, data: DataSet, id: string | undefined): string {
  if (!id || !data.parties.find((p) => p.id === id)) return '';
  return ` ${prefix} ${nameOfParty(data, id)}`;
}

/**
 * A meaningful, human-readable description for any transaction. Prefers the
 * user's own note/remarks; otherwise auto-generates one from the party, bond
 * and quantity so no ledger line is ever blank or cryptic.
 */
export function describePurchase(data: DataSet, p: Purchase): string {
  if (p.note?.trim()) return p.note.trim();
  return `Purchased ${formatNumber(p.quantity)} ${nameOfBond(data, p.bondTypeId)}${withParty('from', data, p.partyId)}`;
}
export function describeSale(data: DataSet, s: Sale): string {
  if (s.note?.trim()) return s.note.trim();
  return `Sold ${formatNumber(s.quantity)} ${nameOfBond(data, s.bondTypeId)}${withParty('to', data, s.partyId)}`;
}
export function describeCash(data: DataSet, c: CashTransaction): string {
  if (c.note?.trim()) return c.note.trim();
  const hasParty = c.partyId && data.parties.find((p) => p.id === c.partyId);
  if (c.direction === 'received') return hasParty ? `Received payment from ${nameOfParty(data, c.partyId)}` : 'Cash received';
  return hasParty ? `Payment made to ${nameOfParty(data, c.partyId)}` : 'Cash paid';
}
export function describeAdjustment(a: PartyAdjustment): string {
  if (a.reason?.trim()) return a.reason.trim();
  return a.amount > 0 ? 'Receivable added' : 'Payable added';
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

  // Sales & Purchases appear in the party ledger for REFERENCE (memo), but do
  // NOT affect the running balance — debit/credit stay 0, so receivable/payable
  // still comes only from opening + cash + manual adjustments.
  data.purchases
    .filter((p) => p.partyId === partyId && inPeriod(p, period))
    .forEach((p) =>
      entries.push({
        id: 'p-' + p.id, partyId, refType: 'purchase', refId: p.id,
        description: describePurchase(data, p),
        debit: 0, credit: 0, memo: p.amount,
        date: p.date, month: p.month, year: p.year,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      })
    );
  data.sales
    .filter((s) => s.partyId === partyId && inPeriod(s, period))
    .forEach((s) =>
      entries.push({
        id: 's-' + s.id, partyId, refType: 'sale', refId: s.id,
        description: describeSale(data, s),
        debit: 0, credit: 0, memo: s.amount,
        date: s.date, month: s.month, year: s.year,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
      })
    );

  // Cash Receivable (received) => debit (+receivable); Cash Payable (paid) =>
  // credit (-payable). Matches computePartyBalances so the amount lands under
  // the card whose name matches the button.
  data.cash
    .filter((c) => c.partyId === partyId && inPeriod(c, period))
    .forEach((c) =>
      entries.push({
        id: 'c-' + c.id,
        partyId,
        refType: 'cash',
        refId: c.id,
        description: describeCash(data, c),
        debit: c.direction === 'received' ? c.amount : 0,
        credit: c.direction === 'paid' ? c.amount : 0,
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
        refType: 'adjustment',
        refId: a.id,
        description: describeAdjustment(a),
        debit: a.amount > 0 ? a.amount : 0,
        credit: a.amount < 0 ? Math.abs(a.amount) : 0,
        date: a.date,
        month: a.month,
        year: a.year,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })
    );

  // Date-wise ascending (oldest first); same-day entries keep creation order.
  return entries.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt
  );
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
  // Cash in Hand matches the Cash Book screen: (Sales−Purchases)+(Received−Paid).
  const cash = computeCashBookSummary(data, period).cashInHand;
  const bank = computeFileBalance(data.opening);
  const stock = computeStock(data, period).reduce((a, s) => a + s.closingValue, 0);
  const profit = computeProfitLoss(data, period);
  const { expense, income } = computeExpenseNet(data, period);

  // Display order only (no value/calc change): Cash, Stock, Payable, Receivable,
  // then Profit/(Loss) below. (Client-required Trial Balance section order.)
  rows.push({ name: 'Cash in Hand', debit: Math.max(cash, 0), credit: Math.max(-cash, 0) });
  if (bank !== 0) rows.push({ name: 'Bank / File Accounts', debit: Math.max(bank, 0), credit: Math.max(-bank, 0) });
  rows.push({ name: 'Closing Stock', debit: 0, credit: stock });
  rows.push({ name: 'Accounts Payable', debit: 0, credit: payable });
  rows.push({ name: 'Accounts Receivable', debit: receivable, credit: 0 });
  // Expenses post to their own account (debit), income to its own (credit) —
  // NOT to Cash in Hand. They flow into Profit/Loss below.
  if (expense !== 0) rows.push({ name: 'Expenses', debit: expense, credit: 0 });
  if (income !== 0) rows.push({ name: 'Other Income', debit: 0, credit: income });
  // Profit / (Loss) shown on the DEBIT side (client preference): a positive
  // profit sits in the debit column, a loss in the credit column.
  rows.push({
    name: 'Profit / (Loss)',
    debit: profit > 0 ? profit : 0,
    credit: profit < 0 ? Math.abs(profit) : 0,
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
 * Period profit = trading profit ONLY (sale revenue − weighted-avg cost of
 * sales). Expenses and other income are NOT included (client rule), and profit
 * is never folded into Receivable/Payable.
 */
export function computeProfitLoss(data: DataSet, period: Period): number {
  // Profit = trading profit ONLY = Sales − Cost of Sales. (Expense/Income
  // feature removed from the UI, so nothing else affects Profit.)
  // Single source of truth for the Profit figure across every screen/report.
  return computeTradingProfit(data, period);
}

/** Trading-only profit (before expenses/income), for reporting clarity. */
export function computeTradingProfit(data: DataSet, period: Period): number {
  return round2(
    data.sales.filter((s) => inPeriod(s, period)).reduce((a, s) => a + saleProfitLive(data, s, period), 0)
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
  // All party/cash totals come from the one Financial Engine (per-party netting).
  const fin = computeFinancials(data, period);
  const bank = computeFileBalance(data.opening);
  const exp = computeExpenseNet(data, period);
  const tb = computeTrialBalance(data, period);
  // Cash in Hand for reports MATCHES the Cash Book screen formula:
  //   (Sales − Purchases) + (Received − Paid).
  const cashInHand = computeCashBookSummary(data, period).cashInHand;

  return {
    totalPurchase,
    totalSale,
    closingStockQty,
    closingStockValue,
    cashReceivable: fin.netReceivable,
    cashPayable: fin.netPayable,
    cashInHand,
    // Net worth = cash + bank + stock + net party position (receivable − payable).
    netBalance: round2(cashInHand + bank + closingStockValue + fin.netParty),
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
