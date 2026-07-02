import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeBondMovement } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatNumber, formatMoney, formatDate, cx } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';
import { AdjustStock } from './AdjustStock';
import { ConfirmDialog } from '@/components/ui/Modal';
import './entry.css';

/**
 * Prize-bond stock = a running movement log per denomination. Stock is
 * UNLIMITED — net qty may go negative and that is fine. No valuation.
 */
export function Stock() {
  const t = useT();
  const { period, dataset, settings, bondTypes, deleteStockAdjustment } = useData();
  const data = dataset();
  const cur = settings.currency;
  const movement = useMemo(() => computeBondMovement(data, period), [data, period]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjToDelete, setAdjToDelete] = useState<string | null>(null);

  const bondName = (id: string) => bondTypes.find((b) => b.id === id)?.name ?? '—';
  const adjustments = useMemo(
    () => (data.stockAdjustments ?? []).filter((a) => a.month === period.month && a.year === period.year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.stockAdjustments, period]
  );

  const totals = movement.reduce(
    (a, m) => ({ bought: a.bought + m.purchasedQty, sold: a.sold + m.soldQty, net: a.net + m.netQty }),
    { bought: 0, sold: 0, net: 0 }
  );

  return (
    <div>
      <PageHeader
        title={t('p.stockTitle')}
        subtitle="Running bond movement — stock is unlimited (net can be negative)"
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setAdjustOpen(true)}>
              <Icon name="plus" size={16} /> Adjust
            </button>
            <button className="btn" onClick={() => { exportReportPdf(data, settings, period, 'stock'); toast.success('Stock PDF exported'); }}>
              <Icon name="pdf" size={16} /> Export PDF
            </button>
          </>
        }
      />
      <div className="card">
        {movement.length === 0 ? (
          <div className="empty">No bond types yet. Add one via a Purchase entry.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr>
                  <th>Bond</th>
                  <th className="num">Purchased</th>
                  <th className="num">Sold</th>
                  <th className="num">Net Qty</th>
                  <th className="num">Avg Buy Rate</th>
                </tr>
              </thead>
              <tbody>
                {movement.map((m) => (
                  <tr key={m.bondTypeId}>
                    <td data-label="Bond"><strong>Rs. {m.bondTypeName}</strong></td>
                    <td data-label="Purchased" className="num mono pos">+{formatNumber(m.purchasedQty)}</td>
                    <td data-label="Sold" className="num mono neg">-{formatNumber(m.soldQty)}</td>
                    <td data-label="Net Qty" className={cx('num mono', m.netQty < 0 ? 'neg' : '')}><strong>{formatNumber(m.netQty)}</strong></td>
                    <td data-label="Avg Buy Rate" className="num mono">{m.avgBuyRate ? formatNumber(m.avgBuyRate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num mono pos">+{formatNumber(totals.bought)}</td>
                  <td className="num mono neg">-{formatNumber(totals.sold)}</td>
                  <td className={cx('num mono', totals.net < 0 ? 'neg' : '')}>{formatNumber(totals.net)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {adjustments.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title"><Icon name="plus" size={16} /> Manual Adjustments · {adjustments.length}</div>
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr><th>Date</th><th>Bond</th><th className="num">Qty</th><th>Reason</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Date">{formatDate(a.date)}</td>
                    <td data-label="Bond"><strong>Rs. {bondName(a.bondTypeId)}</strong></td>
                    <td data-label="Qty" className={`num mono ${a.quantity >= 0 ? 'pos' : 'neg'}`}>{a.quantity >= 0 ? '+' : ''}{formatNumber(a.quantity)}</td>
                    <td data-label="Reason" className="muted">{a.reason}</td>
                    <td className="no-print actions-cell">
                      <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete" onClick={() => setAdjToDelete(a.id)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdjustStock open={adjustOpen} onClose={() => setAdjustOpen(false)} />
      <ConfirmDialog
        open={!!adjToDelete}
        title="Delete adjustment?"
        message="This removes the manual stock adjustment."
        confirmLabel="Delete" danger
        onConfirm={() => { if (adjToDelete) deleteStockAdjustment(adjToDelete); setAdjToDelete(null); }}
        onCancel={() => setAdjToDelete(null)}
      />
    </div>
  );
}
