import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeBondMovement } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatNumber, formatDate, cx } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';
import { AdjustStock } from './AdjustStock';
import { ConfirmDialog } from '@/components/ui/Modal';
import './entry.css';
import './report-grid.css';

/**
 * Prize-bond stock = a running movement log per denomination. Stock is
 * UNLIMITED — net qty may go negative and that is fine. No valuation.
 *
 * This page is presentation only: the per-transaction register and the per-bond
 * summary are derived from the SAME purchases/sales/adjustments used everywhere.
 * Deleting a row removes that one record via the existing store method, and all
 * figures recompute automatically (they are derived, never stored).
 */
type StockTxn = {
  id: string;
  kind: 'purchases' | 'sales' | 'stockAdjustments';
  date: string;
  createdAt: number;
  bondTypeId: string;
  purchaseQty: number; // + into stock
  saleQty: number;     // - out of stock
  note: string;
};

export function Stock() {
  const t = useT();
  const store = useData();
  const { period, dataset, settings, bondTypes } = store;
  const data = dataset();
  const cur = settings.currency;
  const movement = useMemo(() => computeBondMovement(data, period), [data, period]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toDelete, setToDelete] = useState<StockTxn | null>(null);

  const bondName = (id: string) => bondTypes.find((b) => b.id === id)?.name ?? '—';
  const inPeriod = (r: { month: number; year: number }) => r.month === period.month && r.year === period.year;

  // Flatten every stock-affecting record into dated rows, OLDEST → NEWEST, with
  // a running Remaining Stock (all denominations combined, per the spec columns).
  const register = useMemo(() => {
    const rows: StockTxn[] = [];
    data.purchases.filter(inPeriod).forEach((p) =>
      rows.push({ id: p.id, kind: 'purchases', date: p.date, createdAt: p.createdAt, bondTypeId: p.bondTypeId, purchaseQty: p.quantity, saleQty: 0, note: p.note ?? '' }));
    data.sales.filter(inPeriod).forEach((s) =>
      rows.push({ id: s.id, kind: 'sales', date: s.date, createdAt: s.createdAt, bondTypeId: s.bondTypeId, purchaseQty: 0, saleQty: s.quantity, note: s.note ?? '' }));
    (data.stockAdjustments ?? []).filter(inPeriod).forEach((a) =>
      rows.push({ id: a.id, kind: 'stockAdjustments', date: a.date, createdAt: a.createdAt, bondTypeId: a.bondTypeId, purchaseQty: a.quantity > 0 ? a.quantity : 0, saleQty: a.quantity < 0 ? -a.quantity : 0, note: a.reason }));
    rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.createdAt - y.createdAt));
    // Running remaining stock per bond type, shown on each row.
    const running: Record<string, number> = {};
    return rows.map((r) => {
      running[r.bondTypeId] = (running[r.bondTypeId] ?? 0) + r.purchaseQty - r.saleQty;
      return { row: r, remaining: running[r.bondTypeId] };
    });
  }, [data.purchases, data.sales, data.stockAdjustments, period]);

  const totals = movement.reduce(
    (a, m) => ({ bought: a.bought + m.purchasedQty, sold: a.sold + m.soldQty, net: a.net + m.netQty }),
    { bought: 0, sold: 0, net: 0 }
  );

  const doDelete = async () => {
    const r = toDelete;
    setToDelete(null);
    if (!r) return;
    if (r.kind === 'stockAdjustments') await store.deleteStockAdjustment(r.id);
    else await store.deleteRecord(r.kind, r.id); // purchases | sales
  };

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

      {/* Per-bond summary (restyled Excel worksheet) */}
      <div className="card rpt-card">
        <div className="rpt-title">Stock Summary · {movement.length} bond{movement.length === 1 ? '' : 's'}</div>
        {movement.length === 0 ? (
          <div className="empty">No bond types yet. Add one via a Purchase entry.</div>
        ) : (
          <div className="table-wrap">
            <table className="rpt-grid">
              <thead>
                <tr>
                  <th className="l">Bond Type</th>
                  <th className="r">Purchase Qty</th>
                  <th className="r">Sale Qty</th>
                  <th className="r">Remaining Stock</th>
                  <th className="r">Avg Buy Rate</th>
                </tr>
              </thead>
              <tbody>
                {movement.map((m) => (
                  <tr key={m.bondTypeId}>
                    <td className="l">Rs. {m.bondTypeName}</td>
                    <td className="r mono">{formatNumber(m.purchasedQty)}</td>
                    <td className="r mono">{formatNumber(m.soldQty)}</td>
                    <td className={cx('r mono', m.netQty < 0 && 'neg')}>{formatNumber(m.netQty)}</td>
                    <td className="r mono">{m.avgBuyRate ? formatNumber(m.avgBuyRate) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">Total</td>
                  <td className="r mono">{formatNumber(totals.bought)}</td>
                  <td className="r mono">{formatNumber(totals.sold)}</td>
                  <td className={cx('r mono', totals.net < 0 && 'neg')}>{formatNumber(totals.net)}</td>
                  <td className="r"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Per-transaction register (Date-wise oldest→newest) with delete */}
      <div className="card rpt-card" style={{ marginTop: 16 }}>
        <div className="rpt-title">Stock Register · {register.length} transaction{register.length === 1 ? '' : 's'}</div>
        {register.length === 0 ? (
          <div className="empty">No stock transactions this month.</div>
        ) : (
          <div className="table-wrap">
            <table className="rpt-grid">
              <thead>
                <tr>
                  <th className="l">Date</th>
                  <th className="l">Bond Type</th>
                  <th className="r">Purchase Qty</th>
                  <th className="r">Sale Qty</th>
                  <th className="r">Remaining Stock</th>
                  <th className="l">Note</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {register.map(({ row: r, remaining }) => (
                  <tr key={r.kind + r.id}>
                    <td className="l">{formatDate(r.date)}</td>
                    <td className="l">Rs. {bondName(r.bondTypeId)}</td>
                    <td className="r mono">{r.purchaseQty ? formatNumber(r.purchaseQty) : ''}</td>
                    <td className="r mono">{r.saleQty ? formatNumber(r.saleQty) : ''}</td>
                    <td className={cx('r mono', remaining < 0 && 'neg')}>{formatNumber(remaining)}</td>
                    <td className="l muted">{r.note}</td>
                    <td className="no-print actions-cell">
                      <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete stock transaction"
                        onClick={() => setToDelete(r)}>
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

      <AdjustStock open={adjustOpen} onClose={() => setAdjustOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete stock transaction?"
        message={
          toDelete?.kind === 'stockAdjustments'
            ? 'This removes the manual stock adjustment. Stock recalculates automatically.'
            : 'This deletes the underlying ' + (toDelete?.kind === 'purchases' ? 'Purchase' : 'Sale') +
              ' record — it will also disappear from the Cash Book and reports. All stock figures recalculate automatically.'
        }
        confirmLabel="Delete" danger
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
