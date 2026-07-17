/**
 * Professional PDF report builder using jsPDF + autotable.
 * Produces a title, business header, month/year, summary cards and clean
 * tables with totals — print-friendly.
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
}

export interface PdfSummaryCard {
  label: string;
  value: string;
  accent?: [number, number, number];
}

const BLUE: [number, number, number] = [59, 130, 246];
const DARK: [number, number, number] = [24, 28, 38];
const SOFT: [number, number, number] = [120, 128, 140];
const GREEN: [number, number, number] = [16, 150, 100];
const LINE: [number, number, number] = [232, 235, 240];
// Excel-style worksheet colours: visible grey grid lines + light grey header.
const GRID: [number, number, number] = [180, 186, 196];
const HEAD: [number, number, number] = [238, 240, 244];

export function buildReportPdf(opts: {
  title: string;
  settings: Settings;
  month: number;
  year: number;
  summary?: PdfSummaryCard[];
  sections: PdfSection[];
}): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 24;              // tighter page margin — more usable width, less edge space
  let y = 30;

  // --- Compact header: business name + report title on nearby lines ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text((opts.settings.businessName || 'USAMA RAZA').toUpperCase(), M, y);

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
    const colW = (pageW - M * 2) / cols;
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
      doc.setTextColor(...(neg ? [200, 60, 60] as [number, number, number] : DARK));
      // value right after the label (labels are short) — keep it on one line.
      doc.text(c.value, x + doc.getTextWidth(`${c.label}: `) + 2, cy + 10);
    });
    const rows = Math.ceil(opts.summary.length / cols);
    y += rows * rowH + 4;
  }

  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.5);
  doc.line(M, y, pageW - M, y);
  y += 8;

  // --- Sections: one report per page, each filled to the page bottom with
  //     empty bordered grid rows so it prints as a COMPLETE Excel worksheet. ---
  const pageH = doc.internal.pageSize.getHeight();
  const FOOTER_SPACE = 10;       // minimal bottom reserve — grid runs to the edge
  const ROW_H = 12.6;            // ACTUAL rendered row height (slightly over so the
                                 // fill never spills onto a 2nd page)
  const numCols = (s: PdfSection) => s.head.length;
  const blankRow = (n: number) => Array.from({ length: n }, () => '');

  opts.sections.forEach((section, idx) => {
    // Each report begins on its own fresh page (the first uses the header area).
    if (idx > 0) { doc.addPage(); y = 24; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(section.title, M, y + 8);
    y += 12;

    const realCols = numCols(section);
    // Real columns take a natural share of the page; the REMAINING width is
    // filled with extra empty bordered columns so the grid reaches the right
    // edge like a blank Excel sheet. ~40pt per spare column.
    const usableW = pageW - M * 2;
    const REAL_W = 62;                                     // avg width budget / real col
    const SPARE_W = 40;
    const extraCols = Math.max(0, Math.floor((usableW - realCols * REAL_W) / SPARE_W));
    const cols = realCols + extraCols;
    const pad = (arr: string[]) => [...arr, ...blankRow(extraCols)];

    // Body = data rows, then the totals row (if any) right after the data.
    const dataRows = section.rows.map((r) => pad(r.map(String)));
    const totalRowIdx = section.foot ? dataRows.length : -1;
    if (section.foot) dataRows.push(pad(section.foot.map(String)));

    // How many BLANK rows fit between the totals and the page bottom → the sheet
    // stays a full bordered grid ALL THE WAY DOWN with no leftover space, even
    // with only a few records. ceil (+ tiny epsilon) so the last row reaches the
    // very edge rather than stopping a row short.
    const gridTop = y + ROW_H;                       // after the header row
    const avail = pageH - FOOTER_SPACE - gridTop;
    // Floor so the grid NEVER spills onto a 2nd page; ROW_H is set slightly over
    // the real height so the last row still sits right at the bottom edge.
    const fitRows = Math.floor(avail / ROW_H);
    const blanks = Math.max(0, fitRows - dataRows.length);
    for (let i = 0; i < blanks; i++) dataRows.push(blankRow(cols));

    autoTable(doc, {
      startY: y,
      head: [pad(section.head)],
      body: dataRows,
      margin: { left: M, right: M },
      tableWidth: 'auto',       // span the full page width
      styles: { fontSize: 8.5, cellPadding: { top: 1, bottom: 1, left: 3, right: 3 }, textColor: DARK as any, lineColor: GRID, lineWidth: 0.4, halign: 'left', valign: 'middle', minCellHeight: ROW_H - 2, overflow: 'linebreak' },
      headStyles: { fillColor: HEAD, textColor: DARK as any, fontStyle: 'bold', fontSize: 8, lineColor: GRID, lineWidth: 0.4, halign: 'center', cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: [255, 255, 255] }, // uniform white — like a printed sheet
      columnStyles: (() => {
        const cs: Record<number, any> = { 0: { halign: 'left' } };
        (section.numericCols ?? []).forEach((c) => { cs[c] = { halign: 'right' }; });
        // Extra spare columns get a fixed narrow width so they tile to the edge.
        for (let c = realCols; c < cols; c++) cs[c] = { cellWidth: SPARE_W };
        return cs;
      })(),
      // Emphasise the totals row (bold + grey) without a separate foot band.
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index === totalRowIdx && d.column.index < realCols) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = HEAD;
        }
      },
      theme: 'grid',
    });
    // @ts-expect-error lastAutoTable is set by the plugin
    y = doc.lastAutoTable.finalY;
  });

  // --- Footer on every page ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 168, 180);
    doc.text(
      `${opts.settings.businessName || 'USAMA RAZA'} · Generated ${new Date().toLocaleString()}`,
      M,
      doc.internal.pageSize.getHeight() - 22
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageW - M,
      doc.internal.pageSize.getHeight() - 22,
      { align: 'right' }
    );
  }

  return doc;
}

export function money(n: number, currency = 'Rs'): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency} ${formatNumber(Math.abs(n))}`;
}
