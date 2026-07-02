import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import {
  exportReportPdf, exportReportExcel, reportTitle, buildReportDoc, reportFileName, type ReportId,
} from '@/lib/reportBuilder';
import { PdfPreview } from '@/components/ui/PdfPreview';
import { usePrintConfirm } from '@/components/ui/PrintConfirm';
import { computeDashboard } from '@/lib/accounting';
import { formatMoney, formatNumber, monthName } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';
import './reports.css';

const REPORTS: { id: ReportId; icon: IconName; desc: string; accent: string }[] = [
  { id: 'balance', icon: 'scale', desc: 'All party balances & status', accent: 'var(--blue)' },
  { id: 'stock', icon: 'stock', desc: 'Bond-wise stock movement', accent: 'var(--purple)' },
  { id: 'purchase', icon: 'purchase', desc: 'Purchases in the month', accent: 'var(--blue)' },
  { id: 'sale', icon: 'sale', desc: 'Sales & profit in the month', accent: 'var(--green)' },
  { id: 'receivable', icon: 'receivable', desc: 'Amounts owed to you', accent: 'var(--green)' },
  { id: 'payable', icon: 'payable', desc: 'Amounts you owe', accent: 'var(--red)' },
  { id: 'trial', icon: 'trial', desc: 'Debit / credit balance', accent: 'var(--orange)' },
  { id: 'ledger', icon: 'ledger', desc: 'All party statements', accent: 'var(--blue)' },
  { id: 'expenses', icon: 'wallet', desc: 'Expenses & income', accent: 'var(--orange)' },
  { id: 'monthly', icon: 'reports', desc: 'Full month summary', accent: 'var(--purple)' },
];

export function Reports() {
  const t = useT();
  const { period, dataset, settings, isMonthClosed, closeMonth } = useData();
  const data = dataset();
  const cur = settings.currency;
  const [confirmClose, setConfirmClose] = useState(false);
  const [preview, setPreview] = useState<{ which: 'all' | ReportId; title: string } | null>(null);
  const printConfirm = usePrintConfirm();

  const stats = useMemo(() => computeDashboard(data, period), [data, period]);
  const closed = isMonthClosed();

  const generate = () => {
    setPreview({ which: 'all', title: `Monthly Report — ${monthName(period.month)} ${period.year}` });
  };

  /** Open the native print dialog directly on a report — no download needed. */
  const printReport = (which: 'all' | ReportId) => {
    printConfirm.print({
      makeDoc: () => buildReportDoc(data, settings, period, which),
      fileName: reportFileName(period, which),
    });
  };

  const doClose = async () => {
    setConfirmClose(false);
    await closeMonth(period, 'Owner');
  };

  return (
    <div>
      <PageHeader
        title={t('p.reportsTitle')}
        subtitle={`Generate professional reports for ${monthName(period.month)} ${period.year}`}
        actions={
          <>
            <button className="btn btn-primary" onClick={generate}>
              <Icon name="reports" size={16} /> Generate Report
            </button>
            <button className="btn" onClick={() => { exportReportExcel(data, period); toast.success('Excel exported'); }}>
              <Icon name="excel" size={16} /> Export Excel
            </button>
          </>
        }
      />

      <div className="summary-cards">
        <StatCard label="Total Purchase" value={formatMoney(stats.totalPurchase, cur)} icon="purchase" accent="blue" />
        <StatCard label="Total Sale" value={formatMoney(stats.totalSale, cur)} icon="sale" accent="green" />
        <StatCard label="Closing Stock" value={formatMoney(stats.closingStockValue, cur)} icon="stock" accent="purple" hint={`${formatNumber(stats.closingStockQty)} bonds`} />
        <StatCard label="Profit / Loss" value={formatMoney(stats.profitLoss, cur)} icon="trial" accent={stats.profitLoss >= 0 ? 'green' : 'red'} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title"><Icon name="reports" size={16} /> Individual Reports (PDF)</div>
        <div className="report-grid">
          {REPORTS.map((r) => (
            <div key={r.id} className="report-tile">
              {/* Default click = Preview */}
              <button
                className="rt-main"
                onClick={() => setPreview({ which: r.id, title: reportTitle(r.id) })}
                title="Preview"
              >
                <span className="rt-icon" style={{ background: r.accent }}>
                  <Icon name={r.icon} size={19} />
                </span>
                <div className="col">
                  <strong>{reportTitle(r.id)}</strong>
                  <span className="rt-desc">{r.desc}</span>
                </div>
              </button>
              <div className="rt-actions no-print">
                <button className="btn btn-ghost btn-icon btn-sm" title="Preview"
                  onClick={() => setPreview({ which: r.id, title: reportTitle(r.id) })}>
                  <Icon name="search" size={15} />
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" title="Print"
                  onClick={() => printReport(r.id)}>
                  <Icon name="print" size={15} />
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" title="Download PDF"
                  onClick={() => { exportReportPdf(data, settings, period, r.id); toast.success('PDF downloaded'); }}>
                  <Icon name="pdf" size={15} />
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" title="Download Excel"
                  onClick={() => { exportReportExcel(data, period); toast.success('Excel downloaded'); }}>
                  <Icon name="excel" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title"><Icon name="check" size={16} /> Monthly Closing</div>
        <div className="close-panel">
          <div className="close-info">
            {closed ? (
              <>
                <strong style={{ fontSize: 15 }} className="closed-tag pos">
                  <Icon name="check" size={16} /> {monthName(period.month)} {period.year} is Closed
                </strong>
                <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                  Stock & party balances are carried forward. You can still edit any entry — the
                  summary updates automatically. Click Refresh to re-save the snapshot.
                </div>
              </>
            ) : (
              <>
                <strong style={{ fontSize: 15 }}>Close {monthName(period.month)} {period.year}</strong>
                <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                  Carries stock & balances to next month and saves a monthly summary.
                  Entries stay fully editable afterwards.
                </div>
              </>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setConfirmClose(true)}>
            <Icon name={closed ? 'refresh' : 'check'} size={16} /> {closed ? 'Refresh Summary' : 'Close Month'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClose}
        title={`${closed ? 'Refresh' : 'Close'} ${monthName(period.month)} ${period.year}?`}
        message="This carries stock & party balances forward and saves a monthly summary. Entries remain fully editable afterwards — nothing is locked."
        confirmLabel={closed ? 'Refresh Summary' : 'Close Month'}
        onConfirm={doClose}
        onCancel={() => setConfirmClose(false)}
      />

      <PdfPreview
        makeDoc={preview ? () => buildReportDoc(data, settings, period, preview.which) : null}
        title={preview?.title ?? ''}
        fileName={reportFileName(period, preview?.which ?? 'all')}
        onClose={() => setPreview(null)}
      />
      {printConfirm.dialog}
    </div>
  );
}
