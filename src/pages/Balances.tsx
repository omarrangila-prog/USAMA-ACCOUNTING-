import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeReceivables, computePayables } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';

export function Balances({ kind }: { kind: 'receivable' | 'payable' }) {
  const nav = useNavigate();
  const t = useT();
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;
  const isRec = kind === 'receivable';

  const rows = useMemo(
    () => (isRec ? computeReceivables(data, period) : computePayables(data, period)),
    [data, period, isRec]
  );
  const total = rows.reduce((a, r) => a + r.balance, 0);

  return (
    <div>
      <PageHeader
        title={isRec ? t('p.receivableTitle') : t('p.payableTitle')}
        subtitle={isRec ? 'Parties who owe you money' : 'Parties you owe money to'}
        actions={
          <button className="btn" onClick={() => { exportReportPdf(data, settings, period, kind); toast.success('PDF exported'); }}>
            <Icon name="pdf" size={16} /> Export PDF
          </button>
        }
      />
      <div className="card">
        <div className="section-title">
          <Icon name={isRec ? 'receivable' : 'payable'} size={16} />
          {isRec ? 'Receivables' : 'Payables'} · {rows.length}
          <span className="spacer" />
          <span className={`badge ${isRec ? 'badge-green' : 'badge-red'}`}>{formatMoney(total, cur)}</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">Nothing {isRec ? 'receivable' : 'payable'} this month.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Party</th>
                  <th className="num">Opening</th>
                  <th className="num">{isRec ? 'Receivable' : 'Payable'}</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partyId}>
                    <td><strong>{r.name}</strong></td>
                    <td className="num mono">{formatMoney(Math.abs(r.opening), cur)}</td>
                    <td className={`num mono ${isRec ? 'pos' : 'neg'}`}><strong>{formatMoney(r.balance, cur)}</strong></td>
                    <td className="no-print">
                      <button className="btn btn-ghost btn-sm" onClick={() => nav(`/ledger?party=${r.partyId}`)}>
                        <Icon name="ledger" size={14} /> Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className={`num mono ${isRec ? 'pos' : 'neg'}`}>{formatMoney(total, cur)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
