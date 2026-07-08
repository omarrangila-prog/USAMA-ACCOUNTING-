import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { computeBusinessSummary } from '@/lib/accounting';
import { formatMoney, cx } from '@/lib/utils';
import { Icon } from './Icon';

/**
 * Reusable Cash in Hand summary card. THE single place the Cash in Hand figure
 * is rendered — value, formatting and colour logic live here so every screen
 * (Dashboard, Business Summary, Trial Balance, Reports, …) shows an identical
 * card that updates automatically with the data.
 *
 * Value + colour reuse the existing engine (computeBusinessSummary); nothing is
 * duplicated or recalculated differently.
 *
 *   displayed value = cashInHand + netReceivable − netPayable
 *   colour: RED if value < 0 OR profit/loss < 0; GREEN only if value > 0 AND
 *   profit/loss > 0; NEUTRAL when either is exactly 0.
 */
export function CashInHandCard({
  variant = 'full',
  clickable = true,
}: {
  /** 'full' = hero with breakdown; 'compact' = single-line summary tile. */
  variant?: 'full' | 'compact';
  clickable?: boolean;
}) {
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;
  const nav = useNavigate();

  const s = useMemo(() => computeBusinessSummary(data, period), [data, period]);
  const value = s.cashInHand + s.netReceivable - s.netPayable;

  const colour =
    value < 0 || s.totalProfitLoss < 0 ? 'neg'
      : value > 0 && s.totalProfitLoss > 0 ? 'pos'
        : '';

  const go = clickable ? () => nav('/cashbook') : undefined;

  if (variant === 'compact') {
    return (
      <div className="card summary-tile animate-in" onClick={go} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}>
        <div className="faint" style={{ fontSize: 12.5, fontWeight: 600 }}>Cash in Hand</div>
        <div className={cx('mono', colour)} style={{ fontSize: 22, fontWeight: 750, marginTop: 4 }}>{formatMoney(value, cur)}</div>
      </div>
    );
  }

  return (
    <div className="cash-hero card animate-in" onClick={go} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}>
      <div className="cash-hero-icon"><Icon name="wallet" size={26} strokeWidth={2} /></div>
      <div className="col" style={{ flex: 1 }}>
        <span className="cash-hero-label">Cash in Hand · Mere paas kitne paise hain?</span>
        <span className={cx('cash-hero-value mono', colour)}>{formatMoney(value, cur)}</span>
        <div className="cash-hero-breakdown">
          <span><span className="faint">Cash</span> <span className="mono">{formatMoney(s.cashInHand, cur)}</span></span>
          <span><span className="faint">+ Receivable (aane wale)</span> <span className="mono pos">{formatMoney(s.netReceivable, cur)}</span></span>
          <span><span className="faint">− Payable (dene wale)</span> <span className="mono neg">{formatMoney(s.netPayable, cur)}</span></span>
        </div>
      </div>
    </div>
  );
}
