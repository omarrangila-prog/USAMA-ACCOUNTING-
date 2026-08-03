import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import {
  exportReportPdf, exportReportExcel, reportTitle, buildReportDoc, buildYearReportDoc,
  reportFileName, yearReportFileName, azSortByName, type ReportId,
} from '@/lib/reportBuilder';
import { PdfPreview } from '@/components/ui/PdfPreview';
import { usePrintConfirm } from '@/components/ui/PrintConfirm';
import { computePartyBalances, partyTradeTotals, partyCashTotals, computeProfitLoss, yearDataset, YEAR_PERIOD } from '@/lib/accounting';
import { formatMoney, monthName, cx, MONTHS, round2 } from '@/lib/utils';
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
  const { period, dataset, settings, isMonthClosed, closeMonth, deleteParty } = useData();
  const data = dataset();
  const cur = settings.currency;
  const [confirmClose, setConfirmClose] = useState(false);
  const [preview, setPreview] = useState<{ which: 'all' | ReportId; title: string; year?: boolean } | null>(null);
  const [partyToDelete, setPartyToDelete] = useState<{ id: string; name: string } | null>(null);
  const printConfirm = usePrintConfirm();

  // Report scope selector: a specific month (1-12) or 'year' (whole year merged).
  // Independent of the top-bar; defaults to the top-bar's current month.
  const [scope, setScope] = useState<number | 'year'>(period.month);
  const isYear = scope === 'year';
  // The period every report/preview on this page uses when a month is selected.
  const rPeriod = isYear ? period : { month: scope as number, year: period.year };
  const scopeLabel = isYear ? `Full Year ${period.year}` : `${monthName(rPeriod.month)} ${period.year}`;

  const closed = isMonthClosed();

  // Scoped dataset/period the on-page tables use: the whole year aggregated when
  // 'All Year' is picked, otherwise the selected month.
  const rData = useMemo(() => (isYear ? yearDataset(data, period.year) : data), [isYear, data, period.year]);
  const rp = isYear ? YEAR_PERIOD(period.year) : rPeriod;

  // On-page party ledger: every party (A→Z) with buying/selling + cash + balance.
  const ledger = useMemo(() => {
    const balances = computePartyBalances(rData, rp);
    return azSortByName(rData.parties).map((p) => {
      const bal = balances.find((b) => b.partyId === p.id)?.balance ?? 0;
      const trade = partyTradeTotals(rData, p.id, rp);
      const cash = partyCashTotals(rData, p.id, rp);
      return {
        id: p.id, name: p.name,
        purchased: trade.purchased, sold: trade.sold,
        paid: cash.paid, received: cash.received,
        balance: bal,
        status: bal > 0.005 ? 'Receivable' : bal < -0.005 ? 'Payable' : 'Settled',
      };
    });
  }, [rData, rp]);

  // Financial-year summary: each month's Sales, Purchases and Profit (same
  // per-month engine functions), plus a year total. Months with no activity are
  // hidden so the table stays clean. Lets the user see the whole year at a
  // glance while each month keeps its own figures.
  const yearSummary = useMemo(() => {
    const rows = MONTHS.map((_, i) => {
      const m = i + 1;
      const p = { month: m, year: period.year };
      const inP = (r: { month: number; year: number }) => r.month === m && r.year === period.year;
      const sales = round2(data.sales.filter(inP).reduce((a, s) => a + s.amount, 0));
      const purchases = round2(data.purchases.filter(inP).reduce((a, s) => a + s.amount, 0));
      const profit = computeProfitLoss(data, p);
      return { month: m, sales, purchases, profit };
    }).filter((r) => r.sales !== 0 || r.purchases !== 0 || r.profit !== 0);
    const total = rows.reduce(
      (a, r) => ({ sales: a.sales + r.sales, purchases: a.purchases + r.purchases, profit: a.profit + r.profit }),
      { sales: 0, purchases: 0, profit: 0 }
    );
    return { rows, total };
  }, [data, period.year]);

  // Open the preview for a report honoring the selected scope (month or year).
  const openPreview = (which: 'all' | ReportId, baseTitle: string) => {
    setPreview({ which, title: `${baseTitle} — ${scopeLabel}`, year: isYear });
  };
  const generate = () => openPreview('all', isYear ? 'Annual Report' : 'Monthly Report');

  /** Open the native print dialog directly on a report — no download needed. */
  const printReport = (which: 'all' | ReportId) => {
    printConfirm.print({
      makeDoc: () => isYear ? buildYearReportDoc(data, settings, period.year, which) : buildReportDoc(data, settings, rPeriod, which),
      fileName: isYear ? yearReportFileName(period.year, which) : reportFileName(rPeriod, which),
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
        subtitle={`Reports for ${scopeLabel}`}
        actions={
          <>
            <select
              className="select"
              style={{ width: 'auto' }}
              value={String(scope)}
              onChange={(e) => setScope(e.target.value === 'year' ? 'year' : Number(e.target.value))}
              aria-label="Report month"
              title="Choose a month, or All Year for one merged annual report"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m} {period.year}</option>
              ))}
              <option value="year">All Year {period.year}</option>
            </select>
            <button className="btn btn-primary" onClick={generate}>
              <Icon name="reports" size={16} /> Generate Report
            </button>
            <button className="btn" onClick={() => { isYear ? exportReportExcel(yearDataset(data, period.year), YEAR_PERIOD(period.year)) : exportReportExcel(data, rPeriod); toast.success('Excel exported'); }}>
              <Icon name="excel" size={16} /> Export Excel
            </button>
          </>
        }
      />

      {/* Financial-Year Summary: every month with activity + a year total, so the
          whole year is visible while each month keeps its own figures. */}
      {yearSummary.rows.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-title"><Icon name="calendar" size={16} /> Financial Year {period.year} · Month-by-Month</div>
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Sales</th>
                  <th className="num">Purchases</th>
                  <th className="num">Profit / (Loss)</th>
                </tr>
              </thead>
              <tbody>
                {yearSummary.rows.map((r) => (
                  <tr key={r.month}>
                    <td data-label="Month"><strong>{monthName(r.month)} {period.year}</strong></td>
                    <td data-label="Sales" className="num mono">{formatMoney(r.sales, cur)}</td>
                    <td data-label="Purchases" className="num mono">{formatMoney(r.purchases, cur)}</td>
                    <td data-label="Profit" className={cx('num mono', r.profit < 0 && 'neg')}>{formatMoney(r.profit, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Year Total</strong></td>
                  <td className="num mono">{formatMoney(yearSummary.total.sales, cur)}</td>
                  <td className="num mono">{formatMoney(yearSummary.total.purchases, cur)}</td>
                  <td className={cx('num mono', yearSummary.total.profit < 0 && 'neg')}>{formatMoney(yearSummary.total.profit, cur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title"><Icon name="reports" size={16} /> Individual Reports (PDF)</div>
        <div className="report-grid">
          {REPORTS.map((r) => (
            <div key={r.id} className="report-tile">
              {/* Default click = Preview */}
              <button
                className="rt-main"
                onClick={() => openPreview(r.id, reportTitle(r.id))}
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
                  onClick={() => openPreview(r.id, reportTitle(r.id))}>
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

      {/* Party Ledger — how much each party bought / sold + cash + balance.
          Shown below the report options; each row can be deleted. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title"><Icon name="ledger" size={16} /> Party Ledger · {ledger.length}</div>
        {ledger.length === 0 ? (
          <div className="empty">No parties yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid stack-sm party-ledger-table">
              <thead>
                <tr>
                  <th>Party</th>
                  <th className="num">Total Purchased</th><th className="num">Total Sold</th>
                  <th className="num">Payable</th><th className="num">Receivable</th>
                  <th className="num">Balance</th><th>Status</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Party"><strong>{r.name}</strong></td>
                    <td data-label="Total Purchased" className="num mono">{formatMoney(r.purchased, cur)}</td>
                    <td data-label="Total Sold" className="num mono">{formatMoney(r.sold, cur)}</td>
                    <td data-label="Payable" className="num mono">{formatMoney(r.paid, cur)}</td>
                    <td data-label="Receivable" className="num mono">{formatMoney(r.received, cur)}</td>
                    <td data-label="Balance" className={cx('num mono', r.balance > 0 ? 'pos' : r.balance < 0 ? 'neg' : '')}>
                      {formatMoney(Math.abs(r.balance), cur)} {r.balance > 0 ? 'Dr' : r.balance < 0 ? 'Cr' : ''}
                    </td>
                    <td data-label="Status" className={cx(r.balance > 0 ? 'pos' : r.balance < 0 ? 'neg' : '')}>{r.status}</td>
                    <td className="no-print actions-cell">
                      <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete party"
                        onClick={() => setPartyToDelete({ id: r.id, name: r.name })}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      <ConfirmDialog
        open={!!partyToDelete}
        title={`Delete ${partyToDelete?.name ?? 'party'}?`}
        message="This removes the party. Any of its existing transactions are kept (they will show without a party name). This cannot be undone."
        confirmLabel="Delete Party" danger
        onConfirm={() => { if (partyToDelete) deleteParty(partyToDelete.id); setPartyToDelete(null); }}
        onCancel={() => setPartyToDelete(null)}
      />

      <PdfPreview
        makeDoc={preview
          ? (preview.year
              ? () => buildYearReportDoc(data, settings, period.year, preview.which)
              : () => buildReportDoc(data, settings, rPeriod, preview.which))
          : null}
        title={preview?.title ?? ''}
        fileName={preview?.year ? yearReportFileName(period.year, preview.which) : reportFileName(rPeriod, preview?.which ?? 'all')}
        onClose={() => setPreview(null)}
      />
      {printConfirm.dialog}
    </div>
  );
}
