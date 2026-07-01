/**
 * One-time migration from the client's real workbook (e.g. "18-6-2026.xlsx").
 *
 * Sheets handled:
 *  - BALANCE SHEET : denomination-blocked. Each bond (100, 200, 750, 1500, …)
 *                    is a section headed "<denom> PRICE BOND" followed by a
 *                    PURCHASE table (DATE|QTY|RATE|AMOUNT) and a SALE table,
 *                    then TOTAL / AVERAGE / TOTAL BOND / PROFIT summary rows.
 *                    -> opening stock qty, avg cost, value, profit per bond.
 *  - REC           : parties who owe us -> opening receivable (+ve).
 *  - PAY           : parties we owe     -> opening payable (-ve).
 *  - FILE          : bank / file accounts + balances.
 *  - Sheet1        : date-wise activity -> historical ledger (best-effort).
 *
 * Output is normalized into real entities + a singleton OpeningBalances doc.
 * All records are tagged source: "old_excel_migration".
 */
import * as XLSX from 'xlsx';
import type {
  Party, BondType, FileAccount, OpeningBalances, OpeningStockLine, Period,
} from '@/types';
import { MIGRATION_SOURCE } from '@/types';
import { uid, now, round2 } from './utils';

/** Raw grid: array of rows, each an array of cells. */
type Grid = any[][];

function num(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function str(v: any): string {
  return v === null || v === undefined ? '' : String(v).trim();
}
function up(v: any): string {
  return str(v).toUpperCase();
}

function sheetGrid(wb: XLSX.WorkBook, name: string): Grid | null {
  const key = wb.SheetNames.find((s) => s.toLowerCase().trim() === name.toLowerCase().trim());
  if (!key) return null;
  return XLSX.utils.sheet_to_json<any[]>(wb.Sheets[key], { header: 1, defval: '' });
}

// ---------------------------------------------------------------------------
// BALANCE SHEET
// ---------------------------------------------------------------------------

export interface ParsedBond {
  denomination: string;        // "100"
  purchaseQty: number;
  purchaseAmount: number;
  purchaseAvgRate: number;
  saleQty: number;
  saleAmount: number;
  saleAvgRate: number;
  closingQty: number;          // from TOTAL BOND, or purchase-sale
  avgCost: number;             // opening stock unit cost
  stockValue: number;
  profit: number;
}

const DENOM_RE = /^(\d[\d,]*)\s*(?:RS\.?\s*)?(?:PRICE\s*)?BOND/i;

/**
 * Scan the grid for "<n> PRICE BOND" section headers and, within each section
 * (up to the next header), read the TOTAL / AVERAGE / TOTAL BOND / PROFIT rows.
 * The sheet places these labels in a cell with the value in a nearby cell, so
 * we search the whole row for the label then take the first numeric after it.
 */
export function parseBalanceSheet(grid: Grid): ParsedBond[] {
  // Find section header row indexes.
  const headers: { denom: string; row: number }[] = [];
  grid.forEach((row, i) => {
    for (const cell of row) {
      const m = up(cell).match(DENOM_RE);
      if (m) { headers.push({ denom: m[1].replace(/,/g, ''), row: i }); break; }
    }
  });

  const bonds: ParsedBond[] = [];

  headers.forEach((h, idx) => {
    const end = idx + 1 < headers.length ? headers[idx + 1].row : grid.length;
    const section = grid.slice(h.row, end);

    // Helper: find a labelled value inside the section. Some labels sit in the
    // PURCHASE column, some in the SALE column, so we can restrict by side.
    const findLabel = (
      label: string,
      side: 'any' | 'left' | 'right' = 'any'
    ): number | null => {
      for (const row of section) {
        for (let c = 0; c < row.length; c++) {
          if (up(row[c]).replace(/\s+/g, ' ') === label) {
            // scan forward for first numeric, honoring side split.
            const from = c + 1;
            for (let k = from; k < row.length; k++) {
              const n = num(row[k]);
              if (n !== 0 || str(row[k]) === '0') {
                if (side === 'left' && k > 25) continue;
                return n;
              }
            }
          }
        }
      }
      return null;
    };

    // TOTAL appears twice on the same row (purchase side then sale side).
    // For each TOTAL cell, read numerics ONLY up to the next TOTAL cell so the
    // purchase totals don't bleed into the sale columns. qty = first numeric,
    // amount = last numeric within that bounded window.
    const totals: { qty: number; amount: number }[] = [];
    for (const row of section) {
      // indexes of every TOTAL label in this row
      const totalCols: number[] = [];
      for (let c = 0; c < row.length; c++) {
        if (up(row[c]).trim() === 'TOTAL') totalCols.push(c);
      }
      totalCols.forEach((c, ti) => {
        const stop = ti + 1 < totalCols.length ? totalCols[ti + 1] : row.length;
        const nums: number[] = [];
        for (let k = c + 1; k < stop; k++) {
          const s = str(row[k]);
          if (s !== '' && Number.isFinite(Number(s.replace(/[,\s]/g, '')))) nums.push(num(row[k]));
        }
        if (nums.length) totals.push({ qty: nums[0] ?? 0, amount: nums[nums.length - 1] ?? 0 });
      });
    }

    const purchaseTotal = totals[0] ?? { qty: 0, amount: 0 };
    const saleTotal = totals[1] ?? { qty: 0, amount: 0 };

    const totalBond = findLabel('TOTAL BOND');
    const profit = findLabel('PROFIT') ?? 0;

    const purchaseQty = purchaseTotal.qty;
    const purchaseAmount = purchaseTotal.amount;
    const saleQty = saleTotal.qty;
    const saleAmount = saleTotal.amount;

    const purchaseAvgRate = purchaseQty ? round2(purchaseAmount / purchaseQty) : 0;
    const saleAvgRate = saleQty ? round2(saleAmount / saleQty) : 0;

    const closingQty = totalBond != null ? totalBond : purchaseQty - saleQty;
    const avgCost = purchaseAvgRate; // weighted-average cost basis = purchase avg
    const stockValue = round2(closingQty * avgCost);

    bonds.push({
      denomination: h.denom,
      purchaseQty, purchaseAmount, purchaseAvgRate,
      saleQty, saleAmount, saleAvgRate,
      closingQty, avgCost, stockValue,
      profit: round2(profit),
    });
  });

  return bonds;
}

// ---------------------------------------------------------------------------
// REC / PAY / FILE  (name + amount lists)
// ---------------------------------------------------------------------------

export interface ParsedBalanceRow { name: string; amount: number; }

/**
 * Read a two-column-ish "name | amount" list. Tolerates label columns, totals
 * rows and blank rows. Takes the first non-empty text as the name and the
 * last numeric on the row as the amount.
 */
export function parseNameAmountSheet(grid: Grid): ParsedBalanceRow[] {
  const rows: ParsedBalanceRow[] = [];
  for (const row of grid) {
    const cells = row.map(str);
    const name = cells.find((c) => c && !/^[\d,.\s-]+$/.test(c));
    if (!name) continue;
    if (/^(TOTAL|GRAND TOTAL|REC|PAY|FILE|NAME|PARTY|BALANCE|S\.?NO|SR)/i.test(name)) continue;
    // last numeric in the row
    let amount = 0;
    for (let k = row.length - 1; k >= 0; k--) {
      const s = str(row[k]);
      if (s !== '' && /^-?[\d,]+(\.\d+)?$/.test(s.replace(/\s/g, ''))) { amount = num(row[k]); break; }
    }
    if (amount === 0 && !cells.some((c) => c === '0')) continue;
    rows.push({ name: name.trim(), amount });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Full migration assembly
// ---------------------------------------------------------------------------

export interface MigrationBundle {
  parties: Party[];
  bondTypes: BondType[];
  files: FileAccount[];
  opening: OpeningBalances;
  preview: MigrationPreview;
}

export interface MigrationPreview {
  asOf: Period;
  bonds: (ParsedBond & { name: string })[];
  receivables: ParsedBalanceRow[];
  payables: ParsedBalanceRow[];
  files: ParsedBalanceRow[];
  totals: {
    stockValue: number;
    receivable: number;
    payable: number;
    fileBalance: number;
    profit: number;
    partyCount: number;
    bondCount: number;
  };
  warnings: string[];
  sheetsFound: string[];
}

export function buildExcelMigration(
  wb: XLSX.WorkBook,
  asOf: Period
): MigrationBundle {
  const t = now();
  const warnings: string[] = [];
  const sheetsFound = wb.SheetNames.slice();

  // --- BALANCE SHEET -> bonds + opening stock ---
  const balGrid = sheetGrid(wb, 'BALANCE SHEET') ?? sheetGrid(wb, 'BALANCESHEET');
  const parsedBonds = balGrid ? parseBalanceSheet(balGrid) : [];
  if (!balGrid) warnings.push('Sheet "BALANCE SHEET" not found — no opening stock imported.');
  else if (parsedBonds.length === 0) warnings.push('No bond denomination sections detected in BALANCE SHEET.');

  const bondTypes: BondType[] = parsedBonds.map((b) => ({
    id: uid(), name: b.denomination, faceValue: num(b.denomination),
    createdAt: t, updatedAt: t,
  }));
  const bondIdByDenom = new Map(bondTypes.map((bt) => [bt.name, bt.id]));

  const openingStock: OpeningStockLine[] = parsedBonds.map((b) => ({
    bondTypeId: bondIdByDenom.get(b.denomination)!,
    bondTypeName: b.denomination,
    qty: b.closingQty,
    avgCost: b.avgCost,
    value: b.stockValue,
    importedProfit: b.profit,
  }));

  // --- Parties from REC / PAY ---
  const partyByName = new Map<string, Party>();
  const ensureParty = (name: string, opening = 0): Party => {
    const key = name.toLowerCase();
    let p = partyByName.get(key);
    if (!p) {
      p = { id: uid(), name, phone: '', openingBalance: opening, createdAt: t, updatedAt: t };
      partyByName.set(key, p);
    } else if (opening) {
      p.openingBalance += opening;
    }
    return p;
  };

  const recGrid = sheetGrid(wb, 'REC');
  const payGrid = sheetGrid(wb, 'PAY');
  const receivables = recGrid ? parseNameAmountSheet(recGrid) : [];
  const payables = payGrid ? parseNameAmountSheet(payGrid) : [];
  if (!recGrid) warnings.push('Sheet "REC" not found — no opening receivables imported.');
  if (!payGrid) warnings.push('Sheet "PAY" not found — no opening payables imported.');

  receivables.forEach((r) => ensureParty(r.name, Math.abs(r.amount)));   // +ve = receivable
  payables.forEach((r) => ensureParty(r.name, -Math.abs(r.amount)));     // -ve = payable

  // --- FILE accounts ---
  const fileGrid = sheetGrid(wb, 'FILE');
  const fileRows = fileGrid ? parseNameAmountSheet(fileGrid) : [];
  if (!fileGrid) warnings.push('Sheet "FILE" not found — no bank/file accounts imported.');
  const files: FileAccount[] = fileRows.map((f) => ({
    id: uid(), name: f.name, balance: f.amount, createdAt: t, updatedAt: t, source: MIGRATION_SOURCE,
  }));

  // Sheet1 (historical activity) — detected but imported as reference only.
  if (sheetGrid(wb, 'Sheet1')) {
    warnings.push('Sheet1 detected — historical day-book kept as reference (opening balances take precedence).');
  }

  const parties = [...partyByName.values()];

  const opening: OpeningBalances = {
    id: 'opening',
    asOf,
    stock: openingStock,
    parties: parties.map((p) => ({ partyId: p.id, balance: p.openingBalance })),
    files: files.map((f) => ({ fileAccountId: f.id, balance: f.balance })),
    importedProfit: round2(parsedBonds.reduce((a, b) => a + b.profit, 0)),
    source: MIGRATION_SOURCE,
    createdAt: t,
  };

  const preview: MigrationPreview = {
    asOf,
    bonds: parsedBonds.map((b) => ({ ...b, name: `Rs. ${b.denomination}` })),
    receivables,
    payables,
    files: fileRows,
    totals: {
      stockValue: round2(openingStock.reduce((a, s) => a + s.value, 0)),
      receivable: round2(receivables.reduce((a, r) => a + Math.abs(r.amount), 0)),
      payable: round2(payables.reduce((a, r) => a + Math.abs(r.amount), 0)),
      fileBalance: round2(files.reduce((a, f) => a + f.balance, 0)),
      profit: opening.importedProfit,
      partyCount: parties.length,
      bondCount: bondTypes.length,
    },
    warnings,
    sheetsFound,
  };

  return { parties, bondTypes, files, opening, preview };
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: 'array', cellDates: true });
}
