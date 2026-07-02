import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { useT } from '@/lib/i18n';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { TransactionForm } from './TransactionForm';
import { EditTransactionModal } from './EditTransactionModal';
import { formatMoney, formatNumber, formatDate, cx } from '@/lib/utils';
import type { Sale as SaleRec } from '@/types';
import './entry.css';

export function Sale() {
  const { period, dataset, settings, deleteRecord, isMonthLocked } = useData();
  const data = dataset();
  const cur = settings.currency;
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [toEdit, setToEdit] = useState<SaleRec | null>(null);
  const t = useT();

  const rows = useMemo(
    () => data.sales
      .filter((s) => s.month === period.month && s.year === period.year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.sales, period]
  );

  const partyName = (id: string) => data.parties.find((p) => p.id === id)?.name ?? '—';
  const bondName = (id: string) => data.bondTypes.find((b) => b.id === id)?.name ?? '—';
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const profit = rows.reduce((a, r) => a + r.profit, 0);
  const locked = isMonthLocked();

  return (
    <div>
      <PageHeader title={t('p.saleTitle')} subtitle={t('p.saleSub')} />
      <div className="entry-layout">
        <TransactionForm kind="sale" />

        <div className="card">
          <div className="section-title">
            <Icon name="sale" size={16} /> Sales · {rows.length}
            <span className="spacer" />
            <span className="badge badge-green">{formatMoney(total, cur)}</span>
            <span className={cx('badge', profit >= 0 ? 'badge-green' : 'badge-red')}>P/L {formatMoney(profit, cur)}</span>
          </div>
          {rows.length === 0 ? (
            <div className="empty">No sales recorded this month.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Date</th><th>Party</th><th>Bond</th>
                    <th className="num">Qty</th><th className="num">Rate</th>
                    <th className="num">Amount</th><th className="num">Profit</th><th>Mode</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.date)}</td>
                      <td><strong>{partyName(r.partyId)}</strong></td>
                      <td>Rs. {bondName(r.bondTypeId)}</td>
                      <td className="num mono">{formatNumber(r.quantity)}</td>
                      <td className="num mono">{formatNumber(r.rate)}</td>
                      <td className="num mono">{formatMoney(r.amount, cur)}</td>
                      <td className={cx('num mono', r.profit >= 0 ? 'pos' : 'neg')}>{formatMoney(r.profit, cur)}</td>
                      <td>
                        <span className={`badge ${r.receipt === 'cash' ? 'badge-green' : 'badge-orange'}`}>
                          {r.receipt}
                        </span>
                      </td>
                      <td className="no-print">
                        {!locked && (
                          <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => setToEdit(r)}>
                              <Icon name="settings" size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete" onClick={() => setToDelete(r.id)}>
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="tx-total-row">
                    <td colSpan={5}>Total</td>
                    <td className="num mono">{formatMoney(total, cur)}</td>
                    <td className={cx('num mono', profit >= 0 ? 'pos' : 'neg')}>{formatMoney(profit, cur)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete sale?"
        message="This will remove the sale and update stock, ledger, profit and balances."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (toDelete) deleteRecord('sales', toDelete); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
      <EditTransactionModal kind="sale" record={toEdit} onClose={() => setToEdit(null)} />
    </div>
  );
}
