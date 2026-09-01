import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { useT } from '@/lib/i18n';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { TransactionForm } from './TransactionForm';
import { EditTransactionModal } from './EditTransactionModal';
import { formatMoney, formatNumber, formatDate, cx } from '@/lib/utils';
import { useTableKeys } from '@/hooks/useTableKeys';
import type { Purchase as PurchaseRec } from '@/types';
import './entry.css';

export function Purchase() {
  const { period, dataset, settings, deleteRecord, isMonthLocked } = useData();
  const data = dataset();
  const cur = settings.currency;
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [toEdit, setToEdit] = useState<PurchaseRec | null>(null);
  const t = useT();

  const rows = useMemo(
    () => data.purchases
      .filter((p) => p.month === period.month && p.year === period.year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.purchases, period]
  );

  const locked = isMonthLocked();
  // Keyboard row control: ↑/↓ select, Ctrl+E / Enter edit, Delete removes.
  const { selected, setSelected } = useTableKeys<PurchaseRec>({
    rows,
    onEdit: (r) => setToEdit(r),
    onDelete: (r) => setToDelete(r.id),
    disabled: locked,
  });

  const partyName = (id: string) => (id ? (data.parties.find((p) => p.id === id)?.name ?? '—') : 'Cash (no party)');
  const bondName = (id: string) => data.bondTypes.find((b) => b.id === id)?.name ?? '—';
  const total = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div>
      <PageHeader title={t('p.purchaseTitle')} subtitle={t('p.purchaseSub')} />
      <div className="entry-layout">
        <TransactionForm kind="purchase" />

        <div className="card">
          <div className="section-title">
            <Icon name="purchase" size={16} /> Purchases · {rows.length}
            <span className="spacer" />
            <span className="badge badge-blue">{formatMoney(total, cur)}</span>
          </div>
          {rows.length === 0 ? (
            <div className="empty">No purchases recorded this month.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid stack-sm">
                <thead>
                  <tr>
                    <th>Date</th><th>Party</th><th>Bond</th>
                    <th className="num">Qty</th><th className="num">Rate</th>
                    <th className="num">Amount</th><th>Note</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={cx(i === selected && 'row-selected')} onClick={() => setSelected(i)}>
                      <td data-label="Date">{formatDate(r.date)}</td>
                      <td data-label="Party"><strong>{partyName(r.partyId)}</strong></td>
                      <td data-label="Bond">Rs. {bondName(r.bondTypeId)}</td>
                      <td data-label="Qty" className="num mono">{formatNumber(r.quantity)}</td>
                      <td data-label="Rate" className="num mono">{formatNumber(r.rate)}</td>
                      <td data-label="Amount" className="num mono">{formatMoney(r.amount, cur)}</td>
                      <td data-label="Note" className="muted">{r.note || '—'}</td>
                      <td className="no-print actions-cell">
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
        title="Delete purchase?"
        message="This will remove the purchase and update stock, ledger and balances."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (toDelete) deleteRecord('purchases', toDelete); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
      <EditTransactionModal kind="purchase" record={toEdit} onClose={() => setToEdit(null)} />
    </div>
  );
}
