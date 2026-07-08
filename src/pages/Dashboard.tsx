import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Icon } from '@/components/ui/Icon';
import { computeBusinessSummary, computeBondMovement } from '@/lib/accounting';
import { formatMoney, formatNumber, formatDate, monthName, cx } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import './dashboard.css';

/**
 * Prize-bond business dashboard. Shows only the figures the owner watches —
 * cash, profit, receivable/payable — plus running bond movement. No debit/
 * credit, no stock valuation.
 */
export function Dashboard() {
  const nav = useNavigate();
  const t = useT();
  const { period, dataset, settings, isMonthClosed } = useData();
  const data = dataset();
  const cur = settings.currency;

  const s = useMemo(() => computeBusinessSummary(data, period), [data, period]);
  const movement = useMemo(() => computeBondMovement(data, period), [data, period]);
  // The exact numeric value shown in the Cash in Hand hero (used for its colour).
  const heroCash = s.cashInHand + s.netReceivable - s.netPayable;

  const recent = useMemo(() => {
    const items = [
      ...data.purchases.filter((p) => p.month === period.month && p.year === period.year).map((p) => ({ ...p, _t: 'purchase' as const })),
      ...data.sales.filter((x) => x.month === period.month && x.year === period.year).map((x) => ({ ...x, _t: 'sale' as const })),
      ...data.cash.filter((c) => c.month === period.month && c.year === period.year).map((c) => ({ ...c, _t: 'cash' as const })),
    ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    return items;
  }, [data, period]);

  const partyName = (id: string) => (id ? (data.parties.find((p) => p.id === id)?.name ?? '—') : 'Cash');
  const closed = isMonthClosed();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${monthName(period.month)} ${period.year}${closed ? ' · Closed (editable)' : ''}`}
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

      {/* Cash in Hand — headline money position (cash + receivable − payable),
          with a transparent breakdown. This replaces the old separate cards. */}
      <div className="cash-hero card animate-in" onClick={() => nav('/cashbook')} role="button" tabIndex={0}>
        <div className="cash-hero-icon"><Icon name="wallet" size={26} strokeWidth={2} /></div>
        <div className="col" style={{ flex: 1 }}>
          <span className="cash-hero-label">Cash in Hand · Mere paas kitne paise hain?</span>
          {/* Colour rules (visual only — the value itself is unchanged):
              - RED   if the displayed Cash in Hand < 0, OR Profit/Loss < 0
              - GREEN only if displayed Cash in Hand > 0 AND Profit/Loss > 0
              - NEUTRAL when either is exactly 0 (and not otherwise red)
              A negative amount is never shown in green. */}
          <span className={cx('cash-hero-value mono',
            (heroCash < 0 || s.totalProfitLoss < 0) ? 'neg'
              : (heroCash > 0 && s.totalProfitLoss > 0) ? 'pos'
              : '')}>
            {formatMoney(heroCash, cur)}
          </span>
          <div className="cash-hero-breakdown">
            <span><span className="faint">Cash</span> <span className="mono">{formatMoney(s.cashInHand, cur)}</span></span>
            <span><span className="faint">+ Receivable (aane wale)</span> <span className="mono pos">{formatMoney(s.netReceivable, cur)}</span></span>
            <span><span className="faint">− Payable (dene wale)</span> <span className="mono neg">{formatMoney(s.netPayable, cur)}</span></span>
          </div>
        </div>
      </div>

      {/* The 6 KPIs the owner monitors */}
      <div className="dash-grid">
        <StatCard
          label={s.totalProfitLoss >= 0 ? 'Profit' : 'Loss'}
          value={formatMoney(Math.abs(s.totalProfitLoss), cur)}
          icon="trial"
          accent={s.totalProfitLoss >= 0 ? 'green' : 'red'}
          trend={s.totalProfitLoss > 0 ? 'up' : s.totalProfitLoss < 0 ? 'down' : null}
          hint={s.totalProfitLoss >= 0 ? 'Business profit mein hai' : 'Business loss mein hai'}
          onClick={() => nav('/reports')}
        />
        <StatCard label="Total Sales" value={formatMoney(s.totalSaleAmount, cur)} icon="sale" accent="green" onClick={() => nav('/sale')} />
        <StatCard label="Total Purchases" value={formatMoney(s.totalPurchaseAmount, cur)} icon="purchase" accent="blue" onClick={() => nav('/purchase')} />
        {/* Per-party netting: each card sums only the party nets on its side.
            A card is hidden when its total is 0. If both are 0, show a single
            "all settled" card. */}
        {s.netReceivable > 0 && (
          <StatCard label="Money to Receive" value={formatMoney(s.netReceivable, cur)} icon="receivable" accent="green" hint="Paise jo aap ne lene hain" onClick={() => nav('/receivable')} />
        )}
        {s.netPayable > 0 && (
          <StatCard label="Money to Pay" value={formatMoney(s.netPayable, cur)} icon="payable" accent="red" hint="Paise jo aap ne dene hain" onClick={() => nav('/payable')} />
        )}
        {s.netReceivable === 0 && s.netPayable === 0 && (
          <StatCard label="Money to Receive" value={formatMoney(0, cur)} icon="receivable" accent="green" hint="All settled" onClick={() => nav('/receivable')} />
        )}
        <StatCard label="Net Bonds" value={formatNumber(s.netBonds)} icon="stock" accent="purple" hint={`${formatNumber(s.totalPurchased)} bought · ${formatNumber(s.totalSold)} sold`} onClick={() => nav('/stock')} />
      </div>

      <div className="dash-lower">
        {/* Bond movement — running quantities, no value */}
        <div className="card">
          <div className="section-title"><Icon name="stock" size={16} /> Bond Movement</div>
          {movement.every((m) => m.purchasedQty === 0 && m.soldQty === 0) ? (
            <div className="empty">No bond activity this month yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr><th>Bond</th><th className="num">Bought</th><th className="num">Sold</th><th className="num">Net Qty</th></tr>
                </thead>
                <tbody>
                  {movement.map((m) => (
                    <tr key={m.bondTypeId}>
                      <td><strong>Rs. {m.bondTypeName}</strong></td>
                      <td className="num mono pos">{formatNumber(m.purchasedQty)}</td>
                      <td className="num mono neg">{formatNumber(m.soldQty)}</td>
                      <td className={cx('num mono', m.netQty < 0 ? 'neg' : '')}><strong>{formatNumber(m.netQty)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent activity */}
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
                      {r._t === 'purchase' && `Purchase · ${partyName(r.partyId)}`}
                      {r._t === 'sale' && `Sale · ${partyName(r.partyId)}`}
                      {r._t === 'cash' && `Cash ${(r as any).direction} · ${partyName(r.partyId)}`}
                    </span>
                    <span className="faint" style={{ fontSize: 12 }}>{formatDate(r.date)}</span>
                  </div>
                  <span className="mono act-amt">{formatMoney((r as any).amount, cur)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
