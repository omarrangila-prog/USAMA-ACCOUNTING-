/** Assembles the standard month-end reports from the accounting engine. */
import type { Period, Settings } from '@/types';
import {
  type DataSet,
  computeStock,
  computePartyBalances,
  computeReceivables,
  computePayables,
  computeFinancials,
  computeCashInHand,
  computeTrialBalance,
  computeDashboard,
  computeLedger,
  describePurchase,
  describeSale,
  describeCash,
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
  return [
    { label: 'Total Purchase', value: money(d.totalPurchase), accent: C.blue },
    { label: 'Total Sale', value: money(d.totalSale), accent: C.green },
    { label: 'Closing Stock', value: money(d.closingStockValue), accent: C.purple },
    { label: 'Profit / Loss', value: money(d.profitLoss), accent: d.profitLoss >= 0 ? C.green : C.red },
    { label: 'Receivable', value: money(d.cashReceivable), accent: C.green },
    { label: 'Payable', value: money(d.cashPayable), accent: C.red },
    { label: 'Cash in Hand', value: money(d.cashInHand), accent: C.orange },
    { label: 'Net Balance', value: money(d.netBalance), accent: C.blue },
  ];
}

/** All report sections for a period, keyed by report id. */
export function buildSections(
  data: DataSet,
  period: Period,
  which: 'all' | ReportId = 'all'
): PdfSection[] {
  const sections: PdfSection[] = [];
  const want = (id: ReportId) => which === 'all' || which === id;

  if (want('stock')) {
    const stock = computeStock(data, period);
    sections.push({
      title: 'Stock Report',
      head: ['Bond', 'Opening', 'Purchased', 'Sold', 'Closing', 'Avg Cost', 'Value'],
      rows: stock.map((s) => [
        s.bondTypeName,
        formatNumber(s.openingQty),
        formatNumber(s.purchasedQty),
        formatNumber(s.soldQty),
        formatNumber(s.closingQty),
        formatNumber(s.avgCost),
        money(s.closingValue),
      ]),
      foot: ['Total', '', '', '', formatNumber(stock.reduce((a, s) => a + s.closingQty, 0)), '', money(stock.reduce((a, s) => a + s.closingValue, 0))],
      numericCols: [1, 2, 3, 4, 5, 6],
    });
  }

  if (want('purchase')) {
    const rows = data.purchases.filter((p) => p.month === period.month && p.year === period.year);
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
    const rows = data.sales.filter((s) => s.month === period.month && s.year === period.year);
    sections.push({
      title: 'Sale Report',
      head: ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Profit', 'Description'],
      rows: rows.map((s) => [
        formatDate(s.date), partyName(data, s.partyId), bondName(data, s.bondTypeId),
        formatNumber(s.quantity), formatNumber(s.rate), money(s.amount), money(s.profit), describeSale(data, s),
      ]),
      foot: ['', '', 'Total', formatNumber(rows.reduce((a, s) => a + s.quantity, 0)), '', money(rows.reduce((a, s) => a + s.amount, 0)), money(rows.reduce((a, s) => a + s.profit, 0)), ''],
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
      rows: tb.rows.map((r) => [r.name, r.debit ? money(r.debit) : '', r.credit ? money(r.credit) : '']),
      foot: ['Net Position (Assets − Liabilities)', money(netPosition), ''],
      numericCols: [1, 2],
    });
  }

  if (want('balance')) {
    // Balance Check — driven ONLY by the Financial Engine's per-party net
    // balances (same source as the dashboard). computeReceivables = parties
    // whose net > 0; computePayables = parties whose net < 0 (abs). Net-zero
    // parties are already excluded by those helpers.
    const fin = computeFinancials(data, period);
    const rec = azSort(computeReceivables(data, period));
    const pay = azSort(computePayables(data, period));
    const totalRec = rec.reduce((a, r) => a + r.balance, 0);
    const totalPay = pay.reduce((a, r) => a + r.balance, 0);

    // RECEIVABLES first, A→Z: Party | Amount | Status.
    sections.push({
      title: 'RECEIVABLES (A - Z)',
      head: ['Party', 'Amount', 'Status'],
      rows: rec.length
        ? rec.map((r) => [r.name, money(r.balance), 'Receivable'])
        : [['No receivables', money(0), '—']],
      foot: ['Total Receivable', money(totalRec), ''],
      numericCols: [1],
    });

    // PAYABLES next, A→Z: Party | Amount | Status.
    sections.push({
      title: 'PAYABLES (A - Z)',
      head: ['Party', 'Amount', 'Status'],
      rows: pay.length
        ? pay.map((r) => [r.name, money(r.balance), 'Payable'])
        : [['No payables', money(0), '—']],
      foot: ['Total Payable', money(totalPay), ''],
      numericCols: [1],
    });

    // Summary totals — same numbers as the dashboard.
    sections.push({
      title: 'SUMMARY',
      head: ['Metric', 'Amount'],
      rows: [
        ['Total Receivable', money(fin.netReceivable)],
        ['Total Payable', money(fin.netPayable)],
        ['Cash in Hand', money(fin.cashInHand)],
        ['Net Position', money(fin.netReceivable - fin.netPayable)],
      ],
      numericCols: [1],
    });
  }

  if (want('ledger')) {
    azSort(data.parties).forEach((party) => {
      const entries = computeLedger(data, party.id, period);
      const hasMovement = entries.some((e) => e.refType !== 'opening');
      if (!hasMovement && (entries[0]?.debit ?? 0) === 0 && (entries[0]?.credit ?? 0) === 0) return;
      let running = 0;
      const totalDebit = entries.reduce((a, e) => a + e.debit, 0);
      const totalCredit = entries.reduce((a, e) => a + e.credit, 0);
      // Statement style: Date · Tafseel · Debit(-) · Credit(+) · Balance (+/-)
      sections.push({
        title: `${party.name} Statement`,
        head: ['Date', 'Tafseel', 'Debit (-)', 'Credit (+)', 'Balance'],
        rows: entries.map((e) => {
          running += e.debit - e.credit;
          return [
            formatDate(e.date), e.description,
            e.debit ? formatNumber(e.debit) : '-',
            e.credit ? formatNumber(e.credit) : '-',
            `${formatNumber(Math.abs(running))} ${running >= 0 ? '(+)' : '(-)'}`,
          ];
        }),
        foot: ['', 'Total', formatNumber(totalDebit), formatNumber(totalCredit),
          `${formatNumber(Math.abs(running))} ${running >= 0 ? '(+)' : '(-)'}`],
        numericCols: [2, 3, 4],
      });
    });
  }

  if (want('expenses')) {
    const rows = (data.expenses ?? []).filter((e) => e.month === period.month && e.year === period.year);
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
        ['Closing Stock Qty', formatNumber(d.closingStockQty)],
        ['Closing Stock Value', money(d.closingStockValue)],
        ['Cash Receivable', money(d.cashReceivable)],
        ['Cash Payable', money(d.cashPayable)],
        ['Total Expense', money(d.totalExpense)],
        ['Total Income', money(d.totalIncome)],
        ['Cash in Hand', money(d.cashInHand)],
        ['Net Balance', money(d.netBalance)],
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
  which: 'all' | ReportId = 'all'
) {
  return buildReportPdf({
    title: which === 'all' ? 'Monthly Report' : reportTitle(which),
    settings,
    month: period.month,
    year: period.year,
    summary: summaryCards(data, period),
    sections: buildSections(data, period, which),
  });
}

export function reportFileName(period: Period, which: 'all' | ReportId = 'all'): string {
  const w = which === 'all' ? 'monthly' : which;
  return `bond-${w}-${period.year}-${String(period.month).padStart(2, '0')}.pdf`;
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
  const stock = computeStock(data, period);
  sheets.push({
    name: 'Stock',
    rows: [
      ['Bond', 'Opening', 'Purchased', 'Sold', 'Closing', 'Avg Cost', 'Value'],
      ...stock.map((s) => [s.bondTypeName, s.openingQty, s.purchasedQty, s.soldQty, s.closingQty, s.avgCost, s.closingValue]),
    ],
  });
  sheets.push({
    name: 'Purchases',
    rows: [
      ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Mode', 'Description'],
      ...data.purchases.filter((p) => p.month === period.month && p.year === period.year)
        .map((p) => [p.date, partyName(data, p.partyId), bondName(data, p.bondTypeId), p.quantity, p.rate, p.amount, p.payment, describePurchase(data, p)]),
    ],
  });
  sheets.push({
    name: 'Sales',
    rows: [
      ['Date', 'Party', 'Bond', 'Qty', 'Rate', 'Amount', 'Profit', 'Mode', 'Description'],
      ...data.sales.filter((s) => s.month === period.month && s.year === period.year)
        .map((s) => [s.date, partyName(data, s.partyId), bondName(data, s.bondTypeId), s.quantity, s.rate, s.amount, s.profit, s.receipt, describeSale(data, s)]),
    ],
  });
  sheets.push({
    name: 'Cash',
    rows: [
      ['Date', 'Party', 'Direction', 'Amount', 'Description'],
      ...data.cash.filter((c) => c.month === period.month && c.year === period.year)
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
  const balances = computePartyBalances(data, period);
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
        ['Cash in Hand', fin.cashInHand, ''],
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
