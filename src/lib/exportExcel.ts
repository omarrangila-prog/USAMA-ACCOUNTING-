/** Excel export + import helpers using SheetJS (xlsx). */
import * as XLSX from 'xlsx';

export interface Sheet {
  name: string;
  rows: (string | number)[][];
}

export function exportWorkbook(fileName: string, sheets: Sheet[]): void {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    // Auto-ish column widths.
    const widths = (s.rows[0] ?? []).map((_, colIdx) => {
      const max = s.rows.reduce(
        (m, r) => Math.max(m, String(r[colIdx] ?? '').length),
        8
      );
      return { wch: Math.min(max + 2, 40) };
    });
    ws['!cols'] = widths;
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, fileName);
}

/** Parse an uploaded .xlsx/.csv file into { sheetName: rowsAsObjects }. */
export async function parseWorkbook(
  file: File
): Promise<Record<string, Record<string, any>[]>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const out: Record<string, Record<string, any>[]> = {};
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    out[name] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  });
  return out;
}

/** Download an Excel template so the client knows the migration format. */
export function downloadImportTemplate(): void {
  exportWorkbook('bond-ledger-import-template.xlsx', [
    {
      name: 'Parties',
      rows: [
        ['name', 'phone', 'openingBalance'],
        ['Ali Traders', '03001234567', 0],
        ['Khan & Sons', '03007654321', 50000],
      ],
    },
    {
      name: 'BondTypes',
      rows: [
        ['name', 'faceValue'],
        ['100', 100],
        ['750', 750],
        ['1500', 1500],
      ],
    },
    {
      name: 'Purchases',
      rows: [
        ['date', 'party', 'bondType', 'quantity', 'rate', 'payment'],
        ['2026-06-05', 'Ali Traders', '100', 10, 17500, 'cash'],
      ],
    },
    {
      name: 'Sales',
      rows: [
        ['date', 'party', 'bondType', 'quantity', 'rate', 'receipt'],
        ['2026-06-08', 'Khan & Sons', '100', 5, 17800, 'credit'],
      ],
    },
    {
      name: 'Cash',
      rows: [
        ['date', 'party', 'direction', 'amount'],
        ['2026-06-10', 'Khan & Sons', 'received', 50000],
      ],
    },
  ]);
}
