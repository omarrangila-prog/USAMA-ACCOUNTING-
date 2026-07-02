import { useMemo } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeStock } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney, formatNumber } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';

export function Stock() {
  const t = useT();
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;
  const stock = useMemo(() => computeStock(data, period), [data, period]);

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
          <button className="btn" onClick={() => { exportReportPdf(data, settings, period, 'stock'); toast.success('Stock PDF exported'); }}>
            <Icon name="pdf" size={16} /> Export PDF
          </button>
        }
      />
      <div className="card">
        {stock.length === 0 ? (
          <div className="empty">No bond types yet. Add one via a Purchase entry.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
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
                    <td><strong>Rs. {s.bondTypeName}</strong></td>
                    <td className="num mono">{formatNumber(s.openingQty)}</td>
                    <td className="num mono pos">+{formatNumber(s.purchasedQty)}</td>
                    <td className="num mono neg">-{formatNumber(s.soldQty)}</td>
                    <td className="num mono"><strong>{formatNumber(s.closingQty)}</strong></td>
                    <td className="num mono">{formatNumber(s.avgCost)}</td>
                    <td className="num mono">{formatMoney(s.closingValue, cur)}</td>
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
    </div>
  );
}
