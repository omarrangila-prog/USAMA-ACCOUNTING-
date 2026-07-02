import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeStock } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney, formatNumber, formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';
import { AdjustStock } from './AdjustStock';
import { ConfirmDialog } from '@/components/ui/Modal';
import './entry.css';

export function Stock() {
  const t = useT();
  const { period, dataset, settings, bondTypes, deleteStockAdjustment } = useData();
  const data = dataset();
  const cur = settings.currency;
  const stock = useMemo(() => computeStock(data, period), [data, period]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjToDelete, setAdjToDelete] = useState<string | null>(null);

  const bondName = (id: string) => bondTypes.find((b) => b.id === id)?.name ?? '—';
  const adjustments = useMemo(
    () => data.stockAdjustments!.filter((a) => a.month === period.month && a.year === period.year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.stockAdjustments, period]
  );

  const totals = stock.reduce(
    (a, s) => ({
      closing: a.closing + s.closingQty,
      value: a.value + s.closingValue,
    }),
    { closing: 0, value: 0 }
  );

  return (
    <div>
      <PageHeader
        title={t('p.stockTitle')}
        subtitle="Bond-wise stock movement (weighted-average cost)"
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setAdjustOpen(true)}>
              <Icon name="plus" size={16} /> Adjust Stock
            </button>
            <button className="btn" onClick={() => { exportReportPdf(data, settings, period, 'stock'); toast.success('Stock PDF exported'); }}>
              <Icon name="pdf" size={16} /> Export PDF
            </button>
          </>
        }
      />
      <div className="card">
        {stock.length === 0 ? (
          <div className="empty">No bond types yet. Add one via a Purchase entry.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr>
                  <th>Bond</th>
                  <th className="num">Opening</th>
                  <th className="num">Purchased</th>
                  <th className="num">Sold</th>
                  <th className="num">Closing</th>
                  <th className="num">Avg Cost</th>
                  <th className="num">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.bondTypeId}>
                    <td data-label="Bond"><strong>Rs. {s.bondTypeName}</strong></td>
                    <td data-label="Opening" className="num mono">{formatNumber(s.openingQty)}</td>
                    <td data-label="Purchased" className="num mono pos">+{formatNumber(s.purchasedQty)}</td>
                    <td data-label="Sold" className="num mono neg">-{formatNumber(s.soldQty)}</td>
                    <td data-label="Closing" className="num mono"><strong>{formatNumber(s.closingQty)}</strong></td>
                    <td data-label="Avg Cost" className="num mono">{formatNumber(s.avgCost)}</td>
                    <td data-label="Stock Value" className="num mono">{formatMoney(s.closingValue, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total</td>
                  <td className="num mono">{formatNumber(totals.closing)}</td>
                  <td></td>
                  <td className="num mono">{formatMoney(totals.value, cur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {adjustments.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title"><Icon name="plus" size={16} /> Stock Adjustments · {adjustments.length}</div>
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr><th>Date</th><th>Bond</th><th className="num">Qty</th><th className="num">Cost</th><th>Reason</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Date">{formatDate(a.date)}</td>
                    <td data-label="Bond"><strong>Rs. {bondName(a.bondTypeId)}</strong></td>
                    <td data-label="Qty" className={`num mono ${a.quantity >= 0 ? 'pos' : 'neg'}`}>
                      {a.quantity >= 0 ? '+' : ''}{formatNumber(a.quantity)}
                    </td>
                    <td data-label="Cost" className="num mono">{a.quantity > 0 ? formatNumber(a.unitCost) : '—'}</td>
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
        message="This removes the stock adjustment and recalculates stock."
        confirmLabel="Delete" danger
        onConfirm={() => { if (adjToDelete) deleteStockAdjustment(adjToDelete); setAdjToDelete(null); }}
        onCancel={() => setAdjToDelete(null)}
      />
    </div>
  );
}
