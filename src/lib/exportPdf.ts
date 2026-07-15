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
  const M = 40;
  let y = 46;

  // --- Easy-Khata style header: business name (small caps) + report title ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text((opts.settings.businessName || 'USAMA RAZA').toUpperCase(), M, y - 20);

  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text(opts.title, M, y);

  // Owner/contact line under the title.
  const sub = [opts.settings.ownerName, opts.settings.phone, opts.settings.address]
    .filter(Boolean)
    .join('  •  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SOFT);
  doc.text(`${monthName(opts.month)} ${opts.year}${sub ? '   ·   ' + sub : ''}`, M, y + 15);
  y += 30;

  // --- Summary strip (label above value, plain — like the statement) ---
  if (opts.summary?.length) {
    const cols = 4;
    const colW = (pageW - M * 2) / cols;
    const rowH = 40;
    opts.summary.forEach((c, i) => {
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);
      const x = M + col * colW;
      const cy = y + rowIdx * rowH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SOFT);
      doc.text(c.label, x, cy + 12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      const neg = c.value.trim().startsWith('-') || /\(-\)/.test(c.value);
      doc.setTextColor(...(neg ? [200, 60, 60] as [number, number, number] : DARK));
      doc.text(c.value, x, cy + 27);
    });
    const rows = Math.ceil(opts.summary.length / cols);
    y += rows * rowH + 6;
  }

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(M, y, pageW - M, y);
  y += 14;

  // --- Sections (plain-lined statement tables, green totals) ---
  for (const section of opts.sections) {
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 46; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...DARK);
    doc.text(section.title, M, y + 12);
    y += 20;

    autoTable(doc, {
      startY: y,
      head: [section.head],
      body: section.rows.map((r) => r.map(String)),
      foot: section.foot ? [section.foot.map(String)] : undefined,
      margin: { left: M, right: M },
      // Center-align every column (header + body + foot) so values line up
      // under their headings. The first column (labels) stays left-aligned.
      styles: { fontSize: 9.5, cellPadding: 7, textColor: DARK as any, lineColor: LINE, lineWidth: 0.5, halign: 'center' },
      headStyles: { fillColor: [255, 255, 255], textColor: SOFT as any, fontStyle: 'bold', fontSize: 8.5, lineWidth: { bottom: 0.8 } as any, halign: 'center' },
      footStyles: { fillColor: [246, 250, 248], textColor: GREEN as any, fontStyle: 'bold', lineWidth: { top: 0.8 } as any, halign: 'center' },
      alternateRowStyles: { fillColor: [250, 251, 252] },
      columnStyles: { 0: { halign: 'left' } },
      theme: 'plain',
    });
    // @ts-expect-error lastAutoTable is set by the plugin
    y = doc.lastAutoTable.finalY + 22;

    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = 46;
    }
  }

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
