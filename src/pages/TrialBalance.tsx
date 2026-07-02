import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { PdfPreview } from '@/components/ui/PdfPreview';
import { usePrintConfirm } from '@/components/ui/PrintConfirm';
import { computeBusinessSummary, computeProfitByBond } from '@/lib/accounting';
import { buildReportDoc, reportFileName, exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney, formatNumber, cx } from '@/lib/utils';
import { toast } from '@/store/toast';

/**
 * Business Summary (replaces the traditional Trial Balance). Prize-bond owners
 * don't want debit/credit reports — just the key figures at a glance.
 */
export function TrialBalance() {
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;
  const [preview, setPreview] = useState(false);
  const printConfirm = usePrintConfirm();
  const s = useMemo(() => computeBusinessSummary(data, period), [data, period]);
  const byBond = useMemo(() => computeProfitByBond(data, period).filter((b) => b.profit !== 0), [data, period]);

  const items: { label: string; value: string; accent?: 'pos' | 'neg' }[] = [
    { label: 'Cash in Hand', value: formatMoney(s.cashInHand, cur), accent: s.cashInHand >= 0 ? 'pos' : 'neg' },
    { label: 'Total Profit / Loss', value: formatMoney(s.totalProfitLoss, cur), accent: s.totalProfitLoss >= 0 ? 'pos' : 'neg' },
    { label: 'Sale Profit', value: formatMoney(s.saleProfit, cur), accent: s.saleProfit >= 0 ? 'pos' : 'neg' },
    { label: 'Purchase Profit', value: formatMoney(s.purchaseProfit, cur), accent: s.purchaseProfit >= 0 ? 'pos' : 'neg' },
    { label: 'Net Receivable', value: formatMoney(s.netReceivable, cur), accent: 'pos' },
    { label: 'Net Payable', value: formatMoney(s.netPayable, cur), accent: 'neg' },
  ];

  return (
    <div>
      <PageHeader
        title="Business Summary"
        subtitle="Your key numbers at a glance"
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setPreview(true)}>
              <Icon name="search" size={16} /> Preview
            </button>
            <button className="btn" onClick={() => printConfirm.print({
              makeDoc: () => buildReportDoc(data, settings, period, 'trial'),
              fileName: reportFileName(period, 'trial'),
            })}>
              <Icon name="print" size={16} /> Print
            </button>
            <button className="btn" onClick={() => { exportReportPdf(data, settings, period, 'trial'); toast.success('Downloaded'); }}>
              <Icon name="pdf" size={16} /> Download
            </button>
          </>
        }
      />

      <div className="dash-grid" style={{ marginBottom: 18 }}>
        {items.map((it) => (
          <div key={it.label} className="card summary-tile animate-in">
            <div className="faint" style={{ fontSize: 12.5, fontWeight: 600 }}>{it.label}</div>
            <div className={cx('mono', it.accent)} style={{ fontSize: 22, fontWeight: 750, marginTop: 4 }}>{it.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title"><Icon name="stock" size={16} /> Net Bonds</div>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <Metric label="Bought" value={formatNumber(s.totalPurchased)} />
          <Metric label="Sold" value={formatNumber(s.totalSold)} />
          <Metric label="Net Quantity" value={formatNumber(s.netBonds)} accent={s.netBonds < 0 ? 'neg' : undefined} />
        </div>
      </div>

      {byBond.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title"><Icon name="trial" size={16} /> Profit by Bond</div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Bond</th><th className="num">Profit / Loss</th></tr></thead>
              <tbody>
                {byBond.map((b) => (
                  <tr key={b.bondTypeId}>
                    <td><strong>Rs. {b.bondTypeName}</strong></td>
                    <td className={cx('num mono', b.profit >= 0 ? 'pos' : 'neg')}>{formatMoney(b.profit, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td><td className={cx('num mono', s.saleProfit >= 0 ? 'pos' : 'neg')}>{formatMoney(s.saleProfit, cur)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <PdfPreview
        makeDoc={preview ? () => buildReportDoc(data, settings, period, 'trial') : null}
        title="Business Summary"
        fileName={reportFileName(period, 'trial')}
        onClose={() => setPreview(false)}
      />
      {printConfirm.dialog}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'neg' }) {
  return (
    <div className="col">
      <span className="faint" style={{ fontSize: 12 }}>{label}</span>
      <span className={cx('mono', accent)} style={{ fontSize: 24, fontWeight: 750 }}>{value}</span>
    </div>
  );
}
