/** Assembles the standard month-end reports from the accounting engine. */
import type { Period, Settings } from '@/types';
import {
  type DataSet,
  computeStock,
  computePartyBalances,
  computeReceivables,
  computePayables,
  computeFinancials,
  computeSettlementSummary,
  computeCashBookSummary,
  computeTrialBalance,
  computeDashboard,
  computeLedger,
  describePurchase,
  describeSale,
  saleProfitLive,
  describeCash,
  computeProfitByBond,
  yearDataset,
  YEAR_PERIOD,
} from './accounting';
import { buildReportPdf, money, type PdfSection, type PdfSummaryCard } from './exportPdf';
import { exportWorkbook, type Sheet } from './exportExcel';
import { formatDate, formatNumber, monthName, round2 } from './utils';

/**
 * Strict alphabetical (A→Z) sort by party name, case-insensitive so "ali" and
 * "Ali" sort together. THE single sort used by every Balance Sheet output
 * (preview / PDF / print / Excel) plus the receivable, payable & ledger
 * sections — never by amount, creation date or transaction date.
 */
export function azSortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

/**
 * Date-wise, OLDEST → NEWEST: earliest date on top, latest at the bottom.
 * Same-day rows keep creation order (oldest created first). Used by the
 * Purchase / Sale / Stock report registers per the client spec.
 */
function oldestFirst<T extends { date: string; createdAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt
  );
}
/** Newest first — retained ONLY for the Cash sheet (Cash Book order unchanged). */
function newestFirst<T extends { date: string; createdAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.date > b.date ? -1 : a.date < b.date ? 1 : b.createdAt - a.createdAt
  );
}

const C = {
  blue: [59, 130, 246] as [number, number, number],
  green: [16, 185, 129] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  orange: [245, 158, 11] as [number, number, number],
  purple: [139, 92, 246] as [number, number, number],
};

function partyName(data: DataSet, id: string): string {
  return data.parties.find((p) => p.id === id)?.name ?? '—';
}
function bondName(data: DataSet, id: string): string {
  return data.bondTypes.find((b) => b.id === id)?.name ?? '—';
}

export function summaryCards(data: DataSet, period: Period): PdfSummaryCard[] {
  const d = computeDashboard(data, period);
  // Average cost per bond currently in stock (value ÷ qty). Guarded for 0 qty.
  const avgCost = d.closingStockQty !== 0 ? round2(d.closingStockValue / d.closingStockQty) : 0;
  const cards: PdfSummaryCard[] = [
    { label: 'Total Purchase', value: money(d.totalPurchase), accent: C.blue },
    { label: 'Total Sale', value: money(d.totalSale), accent: C.green },
    { label: 'Profit / Loss', value: money(d.profitLoss), accent: d.profitLoss >= 0 ? C.green : C.red },
    { label: 'Payable', value: money(d.cashPayable), accent: C.red },
    { label: 'Receivable', value: money(d.cashReceivable), accent: C.green },
    { label: 'Cash in Hand', value: money(d.cashInHand), accent: C.orange },
    // All stock figures on hand (replaces the old 'Net Balance' net-worth line):
    // how much stock (qty), its value, and the average cost per unit.
    { label: 'Stock on Hand (Qty)', value: formatNumber(d.closingStockQty), accent: C.blue },
    { label: 'Stock Value', value: money(d.closingStockValue), accent: C.purple },
  ];
  // Only show Avg Cost when it's meaningful (non-zero) — hides 'Avg Cost: Rs 0'.
  if (avgCost !== 0) cards.push({ label: 'Avg Cost', value: money(avgCost), accent: C.blue });
  return cards;
}

/** All report sections for a period, keyed by report id. */
export function buildSections(
  data: DataSet,
  period: Period,
  which: 'all' | ReportId = 'all',
  /** When set with which='ledger', build ONLY this party's statement. */
  onlyPartyId?: string,
): PdfSection[] {
  const sections: PdfSection[] = [];
  const want = (id: ReportId) => which === 'all' || which === id;

  if (want('stock')) {
    // Alphabetical (A→Z) so items never appear in a random order. Each row also
    // shows realised Profit for that bond, with a Total Profit at the bottom.
    const profitByBond = computeProfitByBond(data, period);
    const profitOf = (id: string) => profitByBond.find((p) => p.bondTypeId === id)?.profit ?? 0;
    const stock = [...computeStock(data, period)].sort((a, b) =>
      a.bondTypeName.localeCompare(b.bondTypeName, undefined, { numeric: true })
    );
    const totalProfit = round2(stock.reduce((a, s) => a + profitOf(s.bondTypeId), 0));
    sections.push({
      title: 'Stock Report',
      head: ['Bond', 'Opening', 'Purchased', 'Sold', 'Closing', 'Avg Cost', 'Value', 'Profit'],
      rows: stock.map((s) => [
        s.bondTypeName,
        formatNumber(s.openingQty),
        formatNumber(s.purchasedQty),
        formatNumber(s.soldQty),
        formatNumber(s.closingQty),
        formatNumber(s.avgCost),
        money(s.closingValue),
        money(profitOf(s.bondTypeId)),
      ]),
      foot: [
        'Total', '', '', '',
        formatNumber(stock.reduce((a, s) => a + s.closingQty, 0)), '',
        money(stock.reduce((a, s) => a + s.closingValue, 0)),
        money(totalProfit),
      ],
      numericCols: [1, 2, 3, 4, 5, 6, 7],
    });
  }

  if (want('purchase')) {
    const rows = oldestFirst(data.purchases.filter((p) => p.month === period.month && p.year === period.year));
    sections.push({
      title: 'Purchase Report',
      head: ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Description'],
      rows: rows.map((p) => [
        formatDate(p.date), partyName(data, p.partyId), bondName(data, p.bondTypeId),
        formatNumber(p.quantity), formatNumber(p.rate), money(p.amount), describePurchase(data, p),
      ]),
      foot: ['', '', 'Total', formatNumber(rows.reduce((a, p) => a + p.quantity, 0)), '', money(rows.reduce((a, p) => a + p.amount, 0)), ''],
      numericCols: [3, 4, 5],
    });
  }

  if (want('sale')) {
    const rows = oldestFirst(data.sales.filter((s) => s.month === period.month && s.year === period.year));
    sections.push({
      title: 'Sale Report',
      head: ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Profit', 'Description'],
      rows: rows.map((s) => [
        formatDate(s.date), partyName(data, s.partyId), bondName(data, s.bondTypeId),
        formatNumber(s.quantity), formatNumber(s.rate), money(s.amount), money(saleProfitLive(data, s, period)), describeSale(data, s),
      ]),
      foot: ['', '', 'Total', formatNumber(rows.reduce((a, s) => a + s.quantity, 0)), '', money(rows.reduce((a, s) => a + s.amount, 0)), money(rows.reduce((a, s) => a + saleProfitLive(data, s, period), 0)), ''],
      numericCols: [3, 4, 5, 6],
    });
  }

  const azSort = azSortByName;

  if (want('receivable')) {
    const rows = azSort(computeReceivables(data, period));
    sections.push({
      title: 'Cash Receivable',
      head: ['Party', 'Amount Receivable'],
      rows: rows.map((r) => [r.name, money(r.balance)]),
      foot: ['Total', money(rows.reduce((a, r) => a + r.balance, 0))],
      numericCols: [1],
    });
  }

  if (want('payable')) {
    const rows = azSort(computePayables(data, period));
    sections.push({
      title: 'Cash Payable',
      head: ['Party', 'Amount Payable'],
      rows: rows.map((r) => [r.name, money(r.balance)]),
      foot: ['Total', money(rows.reduce((a, r) => a + r.balance, 0))],
      numericCols: [1],
    });
  }

  if (want('trial')) {
    // Business Summary of positions (assets vs liabilities). Since we do NOT
    // synthesise an opening-capital plug, this is a position summary rather than
    // a self-tying double-entry trial balance — so we don't flag it as
    // "(Out of Balance)", which would look like an error to the owner. A neutral
    // "Net Position" foot shows assets − liabilities.
    const tb = computeTrialBalance(data, period);
    const netPosition = round2(tb.totalDebit - tb.totalCredit);
    sections.push({
      title: 'Business Summary',
      head: ['Account', 'Debit', 'Credit'],
      // Cash in Hand always shows its value (even Rs 0) so it never appears blank
      // in the report. Other zero rows stay empty to keep the table clean.
      rows: tb.rows.map((r) => {
        const alwaysShow = r.name === 'Cash in Hand';
        const debit = r.debit || (alwaysShow && r.credit === 0) ? money(r.debit) : '';
        const credit = r.credit ? money(r.credit) : '';
        return [r.name, debit, credit];
      }),
      foot: ['Net Position (Assets - Liabilities)', money(netPosition), ''],
      numericCols: [1, 2],
    });

    // Merged detail: PAYABLES first, then receivables (client order), plus sale
    // / purchase totals — all inside the Trial Balance report.
    const pay = azSort(computePayables(data, period));
    sections.push({
      title: 'Payables (party-wise)',
      head: ['Party', 'Amount Payable'],
      rows: pay.length ? pay.map((r) => [r.name, money(r.balance)]) : [['No payables', money(0)]],
      foot: ['Total Payable', money(pay.reduce((a, r) => a + r.balance, 0))],
      numericCols: [1],
    });

    const rec = azSort(computeReceivables(data, period));
    sections.push({
      title: 'Receivables (party-wise)',
      head: ['Party', 'Amount Receivable'],
      rows: rec.length ? rec.map((r) => [r.name, money(r.balance)]) : [['No receivables', money(0)]],
      foot: ['Total Receivable', money(rec.reduce((a, r) => a + r.balance, 0))],
      numericCols: [1],
    });

    const totalSale = data.sales.filter((s) => s.month === period.month && s.year === period.year).reduce((a, s) => a + s.amount, 0);
    const totalPurchase = data.purchases.filter((p) => p.month === period.month && p.year === period.year).reduce((a, p) => a + p.amount, 0);
    sections.push({
      title: 'Sale & Purchase',
      head: ['Type', 'Amount'],
      rows: [
        ['Total Sale', money(totalSale)],
        ['Total Purchase', money(totalPurchase)],
      ],
      numericCols: [1],
    });
  }

  if (want('balance')) {
    // Balance Check — driven ONLY by the Financial Engine's per-party net
    // balances (same source as the dashboard). computeReceivables = parties
    // whose net > 0; computePayables = parties whose net < 0 (abs). Net-zero
    // parties are already excluded by those helpers.
    const fin = computeFinancials(data, period);
    const cbCash = computeCashBookSummary(data, period).cashInHand;
    const rec = azSort(computeReceivables(data, period));
    const pay = azSort(computePayables(data, period));
    const totalRec = rec.reduce((a, r) => a + r.balance, 0);
    const totalPay = pay.reduce((a, r) => a + r.balance, 0);

    // PAYABLES first, A→Z: Party | Amount | Status (client order).
    sections.push({
      title: 'PAYABLES (A - Z)',
      head: ['Party', 'Amount', 'Status'],
      rows: pay.length
        ? pay.map((r) => [r.name, money(r.balance), 'Payable'])
        : [['No payables', money(0), '—']],
      foot: ['Total Payable', money(totalPay), ''],
      numericCols: [1],
    });

    // RECEIVABLES next, A→Z: Party | Amount | Status.
    sections.push({
      title: 'RECEIVABLES (A - Z)',
      head: ['Party', 'Amount', 'Status'],
      rows: rec.length
        ? rec.map((r) => [r.name, money(r.balance), 'Receivable'])
        : [['No receivables', money(0), '—']],
      foot: ['Total Receivable', money(totalRec), ''],
      numericCols: [1],
    });

    // Summary totals — same numbers as the dashboard, plus the created / settled
    // / pending breakdown so settlement activity is clear.
    const ss = computeSettlementSummary(data, period);
    sections.push({
      title: 'SUMMARY',
      head: ['Metric', 'Amount'],
      rows: [
        ['Total Receivable Created', money(ss.receivableCreated)],
        ['Total Received', money(ss.received)],
        ['Pending Receivable', money(ss.pendingReceivable)],
        ['Total Payable Created', money(ss.payableCreated)],
        ['Total Paid', money(ss.paid)],
        ['Pending Payable', money(ss.pendingPayable)],
        ['Cash in Hand', money(cbCash)],
        ['Net Position', money(fin.netReceivable - fin.netPayable)],
      ],
      numericCols: [1],
    });
  }

  if (want('ledger')) {
    const ledgerParties = onlyPartyId
      ? data.parties.filter((p) => p.id === onlyPartyId)
      : azSort(data.parties);
    ledgerParties.forEach((party) => {
      const entries = computeLedger(data, party.id, period);
      const hasMovement = entries.some((e) => e.refType !== 'opening');
      // Skip parties with no real transactions this month (a lone Opening
      // Balance is not a transaction) — for BOTH single- and all-party prints,
      // so an empty month never renders a blank ledger.
      if (!hasMovement) return;
      // Seed the running balance from the carried-forward opening, then DROP the
      // "Opening Balance" row (the client doesn't want that line in the ledger).
      let running = 0;
      const realEntries = entries.filter((e) => {
        if (e.refType === 'opening') { running += e.debit - e.credit; return false; }
        return true;
      });
      const totalDebit = realEntries.reduce((a, e) => a + e.debit, 0);
      const totalCredit = realEntries.reduce((a, e) => a + e.credit, 0);
      // Statement style: Date · Tafseel · Debit(-) · Credit(+) · Balance (+/-)
      // Build rows with the running balance accumulated chronologically.
      const statementRows = realEntries.map((e) => {
        running += e.debit - e.credit;
        // Sale/Purchase are memo rows: show the amount in Tafseel; balance flat.
        const tafseel = e.memo ? `${e.description} — ${money(e.memo)}` : e.description;
        return [
          formatDate(e.date), tafseel,
          e.debit ? formatNumber(e.debit) : '-',
          e.credit ? formatNumber(e.credit) : '-',
          `${formatNumber(Math.abs(running))} ${running >= 0 ? '(+)' : '(-)'}`,
        ];
      });
      sections.push({
        title: `${party.name} Statement`,
        head: ['Date', 'Tafseel', 'Debit (-)', 'Credit (+)', 'Balance'],
        // Entries read first → last (oldest at top) so the running balance
        // builds naturally down the page — for both single- and all-party.
        rows: statementRows,
        foot: ['', 'Total', formatNumber(totalDebit), formatNumber(totalCredit),
          `${formatNumber(Math.abs(running))} ${running >= 0 ? '(+)' : '(-)'}`],
        numericCols: [2, 3, 4],
      });
    });
  }

  if (want('expenses')) {
    const rows = oldestFirst((data.expenses ?? []).filter((e) => e.month === period.month && e.year === period.year));
    if (rows.length) {
      const totalExp = rows.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.amount, 0);
      const totalInc = rows.filter((e) => e.kind === 'income').reduce((a, e) => a + e.amount, 0);
      sections.push({
        title: 'Expenses & Income',
        head: ['Date', 'Type', 'Category', 'Note', 'Amount'],
        rows: rows.map((e) => [
          formatDate(e.date), e.kind === 'income' ? 'Income' : 'Expense',
          e.category, e.description ?? '', money(e.amount),
        ]),
        foot: ['', '', 'Net (Income - Expense)', '', money(totalInc - totalExp)],
        numericCols: [4],
      });
    }
  }

  if (want('monthly')) {
    const d = computeDashboard(data, period);
    sections.push({
      title: 'Monthly Summary',
      head: ['Metric', 'Value'],
      rows: [
        ['Total Purchase', money(d.totalPurchase)],
        ['Total Sale', money(d.totalSale)],
        ['Stock on Hand (Qty)', formatNumber(d.closingStockQty)],
        ['Stock Value', money(d.closingStockValue)],
        ['Avg Cost', money(d.closingStockQty !== 0 ? round2(d.closingStockValue / d.closingStockQty) : 0)],
        ['Cash Receivable', money(d.cashReceivable)],
        ['Cash Payable', money(d.cashPayable)],
        ['Total Expense', money(d.totalExpense)],
        ['Total Income', money(d.totalIncome)],
        ['Cash in Hand', money(d.cashInHand)],
        ['Profit / Loss', money(d.profitLoss)],
        ['Trial Balance', d.trialBalanced ? 'Balanced' : 'Out of Balance'],
      ],
      numericCols: [1],
    });
  }

  return sections;
}

export type ReportId =
  | 'balance' | 'stock' | 'purchase' | 'sale' | 'receivable'
  | 'payable' | 'trial' | 'ledger' | 'expenses' | 'monthly';

/** Build the report jsPDF doc WITHOUT downloading (used for in-app preview). */
export function buildReportDoc(
  data: DataSet,
  settings: Settings,
  period: Period,
  which: 'all' | ReportId = 'all',
  onlyPartyId?: string,
) {
  const partyName = onlyPartyId ? data.parties.find((p) => p.id === onlyPartyId)?.name : undefined;
  return buildReportPdf({
    title: partyName ? `${partyName} — Ledger` : which === 'all' ? 'Monthly Report' : reportTitle(which),
    settings,
    month: period.month,
    year: period.year,
    // A single-party ledger doesn't need the whole-business summary cards.
    summary: onlyPartyId ? [] : summaryCards(data, period),
    sections: buildSections(data, period, which, onlyPartyId),
  });
}

/** Build + download a single party's ledger statement PDF (one month). */
export function buildPartyLedgerDoc(data: DataSet, settings: Settings, period: Period, partyId: string) {
  return buildReportDoc(data, settings, period, 'ledger', partyId);
}

/**
 * Single party's ledger for the WHOLE financial year (all months merged). Uses
 * yearDataset so every month's entries for that party appear in one statement.
 */
export function buildPartyLedgerYearDoc(data: DataSet, settings: Settings, year: number, partyId: string) {
  const yData = yearDataset(data, year);
  const partyName = yData.parties.find((p) => p.id === partyId)?.name;
  return buildReportPdf({
    title: partyName ? `${partyName} — Ledger (FY ${year})` : `Ledger — FY ${year}`,
    settings,
    month: YEAR_PERIOD(year).month,
    year,
    summary: [],
    sections: buildSections(yData, YEAR_PERIOD(year), 'ledger', partyId),
  });
}

/**
 * FULL-YEAR aggregated report: one PDF that sums the entire financial year into a
 * single Trial Balance / Stock / P&L (all months merged). Uses yearDataset so the
 * existing per-month report builders aggregate the whole year — same formulas.
 */
export function buildYearReportDoc(data: DataSet, settings: Settings, year: number, which: 'all' | ReportId = 'all') {
  const yData = yearDataset(data, year);
  const yPeriod = YEAR_PERIOD(year);
  return buildReportPdf({
    title: `${which === 'all' ? 'Annual Report' : reportTitle(which)} — Financial Year ${year}`,
    settings,
    month: yPeriod.month,
    year,
    summary: summaryCards(yData, yPeriod),
    sections: buildSections(yData, yPeriod, which),
  });
}

/** Months (1-12) of `year` that have any transaction, in order. */
function monthsWithData(data: DataSet, year: number): number[] {
  const set = new Set<number>();
  const add = (rows: { month: number; year: number }[] | undefined) =>
    (rows ?? []).forEach((r) => { if (r.year === year) set.add(r.month); });
  add(data.purchases); add(data.sales); add(data.cash);
  add(data.expenses); add(data.stockAdjustments); add(data.partyAdjustments);
  return [...set].sort((a, b) => a - b);
}

/**
 * YEAR, GROUPED MONTH-WISE: one PDF where each month that has data is its own
 * set of sections (July Trial Balance, August Trial Balance, …) stacked on the
 * page under a month heading. Reuses the EXACT existing per-month section
 * builders — no formula, layout or column change — just repeated per month with
 * the month name prefixed to each section title. Only months with data appear.
 */
export function buildYearGroupedDoc(data: DataSet, settings: Settings, year: number, which: 'all' | ReportId = 'all') {
  const months = monthsWithData(data, year);
  const sections: PdfSection[] = [];
  for (const m of months) {
    const period = { month: m, year };
    const monthSections = buildSections(data, period, which);
    // Prefix each section's title with the month so every month is a clear,
    // separately-headed block. (Empty months are skipped above.)
    for (const s of monthSections) {
      sections.push({ ...s, title: `${monthName(m)} ${year} — ${s.title}` });
    }
  }
  return buildReportPdf({
    title: `${which === 'all' ? 'Annual Report' : reportTitle(which)} — Financial Year ${year} (Month-wise)`,
    settings,
    month: 12,
    year,
    summary: [], // month-wise view: figures live in each month's own sections
    sections: sections.length ? sections : buildSections(data, YEAR_PERIOD(year), which),
  });
}

export function reportFileName(period: Period, which: 'all' | ReportId = 'all'): string {
  const w = which === 'all' ? 'monthly' : which;
  return `bond-${w}-${period.year}-${String(period.month).padStart(2, '0')}.pdf`;
}

export function yearReportFileName(year: number, which: 'all' | ReportId = 'all'): string {
  const w = which === 'all' ? 'annual' : which;
  return `bond-${w}-FY${year}.pdf`;
}

export function exportReportPdf(
  data: DataSet,
  settings: Settings,
  period: Period,
  which: 'all' | ReportId = 'all'
): void {
  buildReportDoc(data, settings, period, which).save(reportFileName(period, which));
}

export function exportReportExcel(data: DataSet, period: Period): void {
  const sheets: Sheet[] = [];
  // Alphabetical (A→Z) + a Profit column with a Total Profit row.
  const profitByBond = computeProfitByBond(data, period);
  const profitOf = (id: string) => profitByBond.find((p) => p.bondTypeId === id)?.profit ?? 0;
  const stock = [...computeStock(data, period)].sort((a, b) =>
    a.bondTypeName.localeCompare(b.bondTypeName, undefined, { numeric: true })
  );
  sheets.push({
    name: 'Stock',
    rows: [
      ['Bond', 'Opening', 'Purchased', 'Sold', 'Closing', 'Avg Cost', 'Value', 'Profit'],
      ...stock.map((s) => [s.bondTypeName, s.openingQty, s.purchasedQty, s.soldQty, s.closingQty, s.avgCost, s.closingValue, profitOf(s.bondTypeId)]),
      ['Total', '', '', '', stock.reduce((a, s) => a + s.closingQty, 0), '', stock.reduce((a, s) => a + s.closingValue, 0), round2(stock.reduce((a, s) => a + profitOf(s.bondTypeId), 0))],
    ],
  });
  sheets.push({
    name: 'Purchases',
    rows: [
      ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Mode', 'Description'],
      ...oldestFirst(data.purchases.filter((p) => p.month === period.month && p.year === period.year))
        .map((p) => [p.date, partyName(data, p.partyId), bondName(data, p.bondTypeId), p.quantity, p.rate, p.amount, p.payment, describePurchase(data, p)]),
    ],
  });
  sheets.push({
    name: 'Sales',
    rows: [
      ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Profit', 'Mode', 'Description'],
      ...oldestFirst(data.sales.filter((s) => s.month === period.month && s.year === period.year))
        .map((s) => [s.date, partyName(data, s.partyId), bondName(data, s.bondTypeId), s.quantity, s.rate, s.amount, saleProfitLive(data, s, period), s.receipt, describeSale(data, s)]),
    ],
  });
  sheets.push({
    name: 'Cash',
    rows: [
      ['Date', 'Party', 'Direction', 'Amount', 'Description'],
      ...newestFirst(data.cash.filter((c) => c.month === period.month && c.year === period.year))
        .map((c) => [c.date, partyName(data, c.partyId), c.direction, c.amount, describeCash(data, c)]),
    ],
  });
  sheets.push({
    name: 'ExpensesIncome',
    rows: [
      ['Date', 'Type', 'Category', 'Note', 'Amount'],
      ...(data.expenses ?? []).filter((e) => e.month === period.month && e.year === period.year)
        .map((e) => [e.date, e.kind, e.category, e.description ?? '', e.amount]),
    ],
  });
  const balances = azSortByName(computePartyBalances(data, period)); // parties A→Z
  sheets.push({
    name: 'Balances',
    rows: [
      ['Party', 'Opening', 'Closing', 'Status'],
      ...balances.map((b) => [b.name, b.opening, b.balance, b.balance > 0 ? 'Receivable' : b.balance < 0 ? 'Payable' : 'Settled']),
    ],
  });
  // Balance Check sheet — receivables (A→Z) then payables (A→Z) with totals,
  // driven by the same Financial Engine as the dashboard & PDF report.
  {
    const fin = computeFinancials(data, period);
    const cbCash = computeCashBookSummary(data, period).cashInHand;
    const recRows = azSortByName(computeReceivables(data, period));
    const payRows = azSortByName(computePayables(data, period));
    sheets.push({
      name: 'BalanceCheck',
      rows: [
        ['Party', 'Amount', 'Status'],
        ['RECEIVABLES (A-Z)', '', ''],
        ...recRows.map((r) => [r.name, r.balance, 'Receivable']),
        ['Total Receivable', fin.netReceivable, ''],
        ['', '', ''],
        ['PAYABLES (A-Z)', '', ''],
        ...payRows.map((r) => [r.name, r.balance, 'Payable']),
        ['Total Payable', fin.netPayable, ''],
        ['', '', ''],
        ['Cash in Hand', cbCash, ''],
        ['Net Position', fin.netReceivable - fin.netPayable, ''],
      ],
    });
  }
  const tb = computeTrialBalance(data, period);
  sheets.push({
    name: 'TrialBalance',
    rows: [
      ['Account', 'Debit', 'Credit'],
      ...tb.rows.map((r) => [r.name, r.debit, r.credit]),
      ['Total', tb.totalDebit, tb.totalCredit],
    ],
  });
  exportWorkbook(`bond-report-${period.year}-${String(period.month).padStart(2, '0')}.xlsx`, sheets);
}

export function reportTitle(id: ReportId): string {
  return {
    balance: 'Balance Check', stock: 'Stock Report', purchase: 'Purchase Report',
    sale: 'Sale Report', receivable: 'Cash Receivable', payable: 'Cash Payable',
    trial: 'Trial Balance', ledger: 'Ledger', expenses: 'Expenses & Income',
    monthly: 'Monthly Summary',
  }[id];
}

export { monthName };
