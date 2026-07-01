import { useMemo } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeTrialBalance } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney } from '@/lib/utils';
import { toast } from '@/store/toast';

export function TrialBalance() {
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;
  const tb = useMemo(() => computeTrialBalance(data, period), [data, period]);

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        subtitle="Debits and credits must be equal"
        actions={
          <button className="btn" onClick={() => { exportReportPdf(data, settings, period, 'trial'); toast.success('PDF exported'); }}>
            <Icon name="pdf" size={16} /> Export PDF
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className={`tb-status ${tb.balanced ? 'ok' : 'bad'}`}>
          <span className="tb-status-icon">
            <Icon name={tb.balanced ? 'check' : 'warning'} size={20} strokeWidth={2.4} />
          </span>
          <div className="col">
            <strong style={{ fontSize: 15 }}>{tb.balanced ? 'Trial Balance is Balanced' : 'Trial Balance is Out of Balance'}</strong>
            <span className="faint" style={{ fontSize: 13 }}>
              Debits {formatMoney(tb.totalDebit, cur)} · Credits {formatMoney(tb.totalCredit, cur)}
              {!tb.balanced && ` · Difference ${formatMoney(Math.abs(tb.totalDebit - tb.totalCredit), cur)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong></td>
                  <td className="num mono">{r.debit ? formatMoney(r.debit, cur) : '—'}</td>
                  <td className="num mono">{r.credit ? formatMoney(r.credit, cur) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num mono">{formatMoney(tb.totalDebit, cur)}</td>
                <td className="num mono">{formatMoney(tb.totalCredit, cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
