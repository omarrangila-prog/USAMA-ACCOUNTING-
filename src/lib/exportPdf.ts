/**
 * Professional PDF report builder using jsPDF + autotable.
 * Produces a title, business header, month/year, summary cards and clean
 * tables with totals — print-friendly.
 *
 * LAYOUT RULE (client spec): the printed page is DYNAMIC. Tables are exactly as
 * tall as their data — never padded to the page bottom with blank rows, never
 * given filler columns. Empty rows and empty sections are dropped entirely, so
 * a report with three records ends right after the third record; a report with
 * three hundred flows onto the next page with its header/columns repeated.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { monthName, formatNumber } from './utils';
import type { Settings } from '@/types';

export interface PdfSection {
  title: string;
  head: string[];
  rows: (string | number)[][];
  /** Optional bold totals row. */
  foot?: (string | number)[];
  /** Right-align these column indexes. */
  numericCols?: number[];
  /** Keep ALL rows — never drop all-zero rows (e.g. Trial Balance positions). */
  keepAllRows?: boolean;
}

export interface PdfSummaryCard {
  label: string;
  value: string;
  accent?: [number, number, number];
}

const DARK: [number, number, number] = [24, 28, 38];
const SOFT: [number, number, number] = [120, 128, 140];
const RED: [number, number, number] = [200, 60, 60];
// Excel-style worksheet colours: visible grey grid lines + light grey header.
const GRID: [number, number, number] = [180, 186, 196];
const HEAD: [number, number, number] = [238, 240, 244];

/** Page geometry, in points (A4 portrait). */
const M = 24;            // page margin — usable width without wasting edges
const FOOT_RESERVE = 34; // bottom strip kept free for the page footer line
const CONT_TOP = 34;     // top margin on pages 2+ (below the running header)
const PAD_X = 8;         // total horizontal cell padding (4 left + 4 right)
const MIN_COL = 34;      // narrowest a column may become
const ELASTIC_FLOOR = 70; // a wrapping text column never goes below this
const SECTION_GAP = 14;  // vertical space between two stacked sections

/** Shared cell styling. `linebreak` = long text WRAPS, never gets cut off. */
const baseStyles = {
  fontSize: 8.5,
  cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
  textColor: DARK as any,
  lineColor: GRID,
  lineWidth: 0.4,
  halign: 'left' as const,
  valign: 'middle' as const,
  overflow: 'linebreak' as const,
};

/** A row is worthless when every numeric column on it is zero/blank. */
function isZeroCell(v: string | number): boolean {
  const s = String(v).replace(/[^0-9.\-]/g, '');
  return s === '' || Number(s) === 0;
}

interface Prepared {
  title: string;
  head: string[];
  body: string[][];
  foot?: string[];
  numericCols: number[];
  widths: number[];
}

export function buildReportPdf(opts: {
  title: string;
  settings: Settings;
  month: number;
  year: number;
  summary?: PdfSummaryCard[];
  sections: PdfSection[];
}): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  // Print at TRUE size: tell the PDF viewer not to shrink-/blow-up-to-fit, which
  // is what crops edges or stretches the grid on some printers. The layout below
  // already fits inside the A4 margins, so 100% is the correct scale.
  try { doc.viewerPreferences({ PrintScaling: 'None' }, true); } catch { /* older viewers */ }

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - M * 2;
  const business = (opts.settings.businessName || 'USAMA RAZA').toUpperCase();
  let y = 30;

  // --- Compact header: business name + report title on nearby lines ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(business, M, y);

  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(opts.title, M, y + 15);

  // Owner/contact line under the title.
  const sub = [opts.settings.ownerName, opts.settings.phone, opts.settings.address]
    .filter(Boolean)
    .join('  •  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  doc.text(`${monthName(opts.month)} ${opts.year}${sub ? '   ·   ' + sub : ''}`, M, y + 27);
  y += 34;

  // --- Summary strip: dense single-line rows (no tall cards). ---
  if (opts.summary?.length) {
    const cols = 4;
    const colW = usableW / cols;
    const rowH = 15;         // compact line height
    opts.summary.forEach((c, i) => {
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);
      const x = M + col * colW;
      const cy = y + rowIdx * rowH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SOFT);
      doc.text(`${c.label}:`, x, cy + 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const neg = c.value.trim().startsWith('-') || /\(-\)/.test(c.value);
      doc.setTextColor(...(neg ? RED : DARK));
      // value right after the label (labels are short) — keep it on one line.
      doc.text(c.value, x + doc.getTextWidth(`${c.label}: `) + 2, cy + 10);
    });
    y += Math.ceil(opts.summary.length / cols) * rowH + 4;
  }

  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.5);
  doc.line(M, y, pageW - M, y);
  y += 8;

  // ---------------------------------------------------------------------------
  // Column sizing: measure the real text so each column is only as wide as it
  // needs to be. Number columns keep their natural width (numbers must never
  // wrap); the leftover page width goes to the text columns. The widths always
  // sum to exactly the usable width, so the grid fills the page edge-to-edge
  // without ever overflowing it (nothing cut off, nothing stretched).
  // ---------------------------------------------------------------------------
  const measure = (t: string, size: number, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(t);
  };

  const columnWidths = (
    head: string[], body: string[][], foot: string[] | undefined, numericCols: number[]
  ): number[] => {
    const isNum = (c: number) => numericCols.includes(c);
    const TEXT_CAP = usableW * 0.42;   // one long text column must not hog the page
    const natural = head.map((h, c) => {
      let w = measure(h, 8, true);
      for (const r of body) w = Math.max(w, measure(r[c], 8.5, false));
      if (foot) w = Math.max(w, measure(foot[c], 8.5, true));
      w += PAD_X + 2;
      return Math.max(MIN_COL, isNum(c) ? w : Math.min(w, TEXT_CAP));
    });

    const total = natural.reduce((a, b) => a + b, 0);
    let widths = natural;
    if (total < usableW) {
      // Spare room → hand it to the WIDEST text column (party name, tafseel,
      // description). Every other column keeps the width its content needs, so
      // short columns such as Status or Amount stay tight instead of being
      // stretched into empty space. An all-number table shares it evenly.
      const slack = usableW - total;
      let main = -1;
      head.forEach((_, c) => { if (!isNum(c) && (main < 0 || natural[c] > natural[main])) main = c; });
      widths = main >= 0
        ? natural.map((w, c) => (c === main ? w + slack : w))
        : natural.map((w) => w + slack / head.length);
    } else if (total > usableW) {
      // Too wide → squeeze ONLY the genuinely long text columns (party names,
      // descriptions — they wrap gracefully). Numbers and short text columns
      // such as Date / Bond / Status keep their natural width so a date never
      // breaks across two lines.
      const elastic = head.map((_, c) => !isNum(c) && natural[c] > ELASTIC_FLOOR);
      const elasticW = natural.reduce((a, w, c) => a + (elastic[c] ? w : 0), 0);
      const room = usableW - (total - elasticW);
      const count = elastic.filter(Boolean).length;
      widths = count && room >= count * ELASTIC_FLOOR
        ? natural.map((w, c) => (elastic[c] ? Math.max(ELASTIC_FLOOR, (w * room) / elasticW) : w))
        : natural.map((w) => (w * usableW) / total);   // last resort: scale all
    }
    // Final normalise — guarantees the table is exactly the usable width.
    const sum = widths.reduce((a, b) => a + b, 0);
    return sum > 0 ? widths.map((w) => (w * usableW) / sum) : widths;
  };

  // ---------------------------------------------------------------------------
  // Prepare sections: drop all-zero rows, then drop any section left with no
  // rows at all. Nothing empty is ever printed.
  // ---------------------------------------------------------------------------
  const prepared: Prepared[] = [];
  for (const section of opts.sections) {
    const numericCols = section.numericCols ?? [];
    const kept = (numericCols.length && !section.keepAllRows)
      ? section.rows.filter((r) => numericCols.some((c) => !isZeroCell(r[c])))
      : section.rows;
    if (!kept.length) continue;                       // empty section → skipped

    const n = section.head.length;
    const pad = (a: (string | number)[]) =>
      Array.from({ length: n }, (_, i) => String(a[i] ?? ''));
    const head = section.head.map(String);
    const body = kept.map(pad);
    const foot = section.foot ? pad(section.foot) : undefined;
    prepared.push({
      title: section.title, head, body, foot, numericCols,
      widths: columnWidths(head, body, foot, numericCols),
    });
  }

  // ---------------------------------------------------------------------------
  // Sections flow down the page one after another. A section only starts on a
  // new page when its title + column header + first rows genuinely don't fit —
  // so short reports end right after their last record instead of leaving a
  // page-sized hole, and long ones continue naturally with repeated headers.
  // ---------------------------------------------------------------------------
  const ROW_GUESS = 14;                       // ~one data row at 8.5pt
  const NEED = 12 + ROW_GUESS * 3;            // title + column head + 2 rows

  prepared.forEach((s, idx) => {
    if (idx > 0) y += SECTION_GAP;
    if (y + NEED > pageH - FOOT_RESERVE) { doc.addPage(); y = CONT_TOP; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(s.title, M, y + 8);
    y += 12;

    const columnStyles: Record<number, any> = {};
    s.widths.forEach((w, c) => {
      columnStyles[c] = { cellWidth: w, halign: s.numericCols.includes(c) ? 'right' : 'left' };
    });

    autoTable(doc, {
      startY: y,
      head: [s.head],
      body: s.body,
      foot: s.foot ? [s.foot] : undefined,
      showFoot: s.foot ? 'lastPage' : 'never',
      margin: { left: M, right: M, top: CONT_TOP, bottom: FOOT_RESERVE },
      tableWidth: usableW,
      styles: baseStyles,
      headStyles: { fillColor: HEAD, textColor: DARK as any, fontStyle: 'bold', fontSize: 8, lineColor: GRID, lineWidth: 0.4, halign: 'left' },
      footStyles: { fillColor: HEAD, textColor: DARK as any, fontStyle: 'bold', fontSize: 8.5, lineColor: GRID, lineWidth: 0.4, halign: 'left' },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles,
      rowPageBreak: 'avoid',   // a wrapped row never splits across two pages
      theme: 'grid',
      didParseCell: (d) => {
        // columnStyles only reach body cells — mirror the numeric alignment on
        // the column header and the totals row so every column stays aligned.
        if (d.section !== 'body' && s.numericCols.includes(d.column.index)) {
          d.cell.styles.halign = 'right';
        }
      },
    });
    // @ts-expect-error plugin sets lastAutoTable
    y = doc.lastAutoTable.finalY;
  });

  if (!prepared.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SOFT);
    doc.text('No records for this period.', M, y + 16);
  }

  // --- Running header (pages 2+) and footer on every page ---
  const pageCount = doc.getNumberOfPages();
  const generated = `Generated ${new Date().toLocaleString()}`;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (i > 1) {
      // Slim continuation header so every page identifies itself.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...SOFT);
      doc.text(`${business}  ·  ${opts.title}  ·  ${monthName(opts.month)} ${opts.year}`, M, 20);
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.5);
      doc.line(M, 25, pageW - M, 25);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 168, 180);
    doc.text(`${opts.settings.businessName || 'USAMA RAZA'} · ${generated}`, M, pageH - 18);
    doc.text(`Page ${i} of ${pageCount}`, pageW - M, pageH - 18, { align: 'right' });
  }

  return doc;
}

export function money(n: number, currency = 'Rs'): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency} ${formatNumber(Math.abs(n))}`;
}
