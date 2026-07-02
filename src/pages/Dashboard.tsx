import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Icon } from '@/components/ui/Icon';
import {
  computeDashboard,
  computeStock,
} from '@/lib/accounting';
import { formatMoney, formatNumber, formatDate, monthName } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import './dashboard.css';

export function Dashboard() {
  const nav = useNavigate();
  const t = useT();
  const { period, dataset, settings, isMonthClosed } = useData();
  const data = dataset();
  const cur = settings.currency;

  const stats = useMemo(() => computeDashboard(data, period), [data, period]);
  const stock = useMemo(() => computeStock(data, period), [data, period]);

  const recent = useMemo(() => {
    const items = [
      ...data.purchases.filter((p) => p.month === period.month && p.year === period.year)
        .map((p) => ({ ...p, _t: 'purchase' as const })),
      ...data.sales.filter((s) => s.month === period.month && s.year === period.year)
        .map((s) => ({ ...s, _t: 'sale' as const })),
      ...data.cash.filter((c) => c.month === period.month && c.year === period.year)
        .map((c) => ({ ...c, _t: 'cash' as const })),
    ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    return items;
  }, [data, period]);

  const partyName = (id: string) => data.parties.find((p) => p.id === id)?.name ?? '—';
  const closed = isMonthClosed();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Overview for ${monthName(period.month)} ${period.year}${closed ? ' · Closed (editable)' : ''}`}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => nav('/purchase?new=1')}>
              <Icon name="plus" size={16} /> {t('nav.purchase')}
            </button>
            <button className="btn btn-green" onClick={() => nav('/sale?new=1')}>
              <Icon name="plus" size={16} /> {t('nav.sale')}
            </button>
          </>
        }
      />

      {/* Cash in Hand is the headline number for this cash-only business. */}
      <div className="cash-hero card animate-in" onClick={() => nav('/ledger')} role="button" tabIndex={0}>
        <div className="cash-hero-icon"><Icon name="wallet" size={26} strokeWidth={2} /></div>
        <div className="col">
          <span className="cash-hero-label">{t('d.cashInHand') || 'Cash in Hand'}</span>
          <span className="cash-hero-value mono">{formatMoney(stats.cashInHand, cur)}</span>
        </div>
      </div>

      <div className="dash-grid">
        <StatCard label={t('d.totalPurchase')} value={formatMoney(stats.totalPurchase, cur)} icon="purchase" accent="blue" onClick={() => nav('/purchase')} />
        <StatCard label={t('d.totalSale')} value={formatMoney(stats.totalSale, cur)} icon="sale" accent="green" onClick={() => nav('/sale')} />
        <StatCard label={t('d.closingStock')} value={formatMoney(stats.closingStockValue, cur)} icon="stock" accent="purple" hint={`${formatNumber(stats.closingStockQty)} bonds`} onClick={() => nav('/stock')} />
        <StatCard label={t('d.expenses')} value={formatMoney(stats.totalExpense, cur)} icon="wallet" accent="orange" hint={stats.totalIncome ? `${t('f.income')} ${formatMoney(stats.totalIncome, cur)}` : undefined} onClick={() => nav('/expenses')} />
        <StatCard
          label={t('d.profitLoss')}
          value={formatMoney(stats.profitLoss, cur)}
          icon="trial"
          accent={stats.profitLoss >= 0 ? 'green' : 'red'}
          trend={stats.profitLoss > 0 ? 'up' : stats.profitLoss < 0 ? 'down' : null}
          onClick={() => nav('/reports')}
        />
        <StatCard
          label={t('d.trialBalance')}
          value={stats.trialBalanced ? 'Balanced' : 'Check'}
          icon="scale"
          accent={stats.trialBalanced ? 'green' : 'orange'}
          hint={stats.trialBalanced ? 'Debits = Credits' : 'Review entries'}
          onClick={() => nav('/trial-balance')}
        />
      </div>

      <div className="dash-lower">
        <div className="card">
          <div className="section-title"><Icon name="stock" size={16} /> Stock Snapshot</div>
          {stock.length === 0 ? (
            <div className="empty">No bond types yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr><th>Bond</th><th className="num">Closing Qty</th><th className="num">Avg Cost</th><th className="num">Value</th></tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.bondTypeId}>
                      <td><strong>Rs. {s.bondTypeName}</strong></td>
                      <td className="num mono">{formatNumber(s.closingQty)}</td>
                      <td className="num mono">{formatNumber(s.avgCost)}</td>
                      <td className="num mono">{formatMoney(s.closingValue, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title"><Icon name="refresh" size={16} /> Recent Activity</div>
          {recent.length === 0 ? (
            <div className="empty">No transactions this month yet.</div>
          ) : (
            <div className="activity">
              {recent.map((r) => (
                <div key={r._t + r.id} className="act-row">
                  <span className={`act-dot ${r._t}`} />
                  <div className="col" style={{ flex: 1, minWidth: 0 }}>
                    <span className="act-title">
                      {r._t === 'purchase' && `Purchase from ${partyName(r.partyId)}`}
                      {r._t === 'sale' && `Sale to ${partyName(r.partyId)}`}
                      {r._t === 'cash' && `Cash ${(r as any).direction} · ${partyName(r.partyId)}`}
                    </span>
                    <span className="faint" style={{ fontSize: 12 }}>{formatDate(r.date)}</span>
                  </div>
                  <span className="mono act-amt">
                    {formatMoney((r as any).amount, cur)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

