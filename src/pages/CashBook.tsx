import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { computeCashBook, computeCashInHand } from '@/lib/accounting';
import { formatMoney, formatDate, cx } from '@/lib/utils';
import { toast } from '@/store/toast';
import './statement.css';

/**
 * Cash Book — the simple "how much cash do I have right now?" view.
 * Opening cash + every cash movement of the period, with a live running balance.
 * Reads the same computeCashInHand the rest of the app uses (one source of truth).
 */
export function CashBook() {
  const store = useData();
  const { period, dataset, settings, opening } = store;
  const data = dataset();
  const cur = settings.currency;

  const openingCash = opening?.openingCash ?? 0;
  const lines = useMemo(() => computeCashBook(data, period), [data, period]);
  const currentCash = useMemo(() => computeCashInHand(data, period), [data, period]);

  // Running balance starting from opening cash.
  const rows = useMemo(() => {
    let run = openingCash;
    return lines.map((l) => { run += l.inflow - l.outflow; return { ...l, balance: run }; });
  }, [lines, openingCash]);

  const totalIn = lines.reduce((a, l) => a + l.inflow, 0);
  const totalOut = lines.reduce((a, l) => a + l.outflow, 0);

  const [editOpening, setEditOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState(String(Math.round(openingCash)));

  const saveOpening = async () => {
    const val = Number(openingInput.replace(/,/g, '')) || 0;
    await store.setOpeningCash(val);
    setEditOpening(false);
    toast.success('Opening cash updated.');
  };

  return (
    <div>
      <PageHeader title="Cash Book" subtitle="Aaj mere paas kitna cash hai — live balance" />

      {/* The one big answer. */}
      <div className="cash-hero card animate-in" style={{ marginBottom: 16 }}>
        <div className="cash-hero-icon"><Icon name="wallet" size={26} strokeWidth={2} /></div>
        <div className="col">
          <span className="cash-hero-label">Current Cash in Hand</span>
          <span className={cx('cash-hero-value mono', currentCash < 0 && 'neg')}>{formatMoney(currentCash, cur)}</span>
        </div>
      </div>

      {/* Opening cash — editable at the start of the day. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="col">
            <span className="faint" style={{ fontSize: 12.5 }}>Opening Cash (start of day)</span>
            {editOpening ? (
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <input className="input" style={{ maxWidth: 200 }} inputMode="numeric"
                  value={openingInput} onChange={(e) => setOpeningInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveOpening()} autoFocus />
                <button className="btn btn-primary btn-sm" onClick={saveOpening}><Icon name="save" size={15} /> Save</button>
                <button className="btn btn-sm" onClick={() => { setEditOpening(false); setOpeningInput(String(Math.round(openingCash))); }}>Cancel</button>
              </div>
            ) : (
              <strong className="mono" style={{ fontSize: 20 }}>{formatMoney(openingCash, cur)}</strong>
            )}
          </div>
          {!editOpening && (
            <button className="btn btn-sm" onClick={() => setEditOpening(true)}><Icon name="settings" size={14} /> Edit</button>
          )}
        </div>
      </div>

      {/* Cash movements + running balance. */}
      <div className="card statement-card">
        <div className="stmt-summary">
          <div className="stmt-sum-item"><span className="stmt-sum-label">Cash In</span><span className="stmt-sum-value pos">{formatMoney(totalIn, cur)}</span></div>
          <div className="stmt-sum-item"><span className="stmt-sum-label">Cash Out</span><span className="stmt-sum-value neg">{formatMoney(totalOut, cur)}</span></div>
          <div className="stmt-sum-item"><span className="stmt-sum-label">Current Cash</span><span className={cx('stmt-sum-value', currentCash >= 0 ? 'pos' : 'neg')}>{formatMoney(currentCash, cur)}</span></div>
        </div>

        <div className="table-wrap">
          <table className="grid stmt-grid stack-sm">
            <thead>
              <tr><th>Date</th><th>Detail</th><th className="num">In (+)</th><th className="num">Out (−)</th><th className="num">Balance</th></tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Date">—</td>
                <td data-label="Detail"><strong>Opening Cash</strong></td>
                <td data-label="In (+)" className="num mono">-</td>
                <td data-label="Out (−)" className="num mono">-</td>
                <td data-label="Balance" className="num mono">{formatMoney(openingCash, cur)}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td data-label="Date">{formatDate(r.date)}</td>
                  <td data-label="Detail">{r.description}</td>
                  <td data-label="In (+)" className="num mono pos">{r.inflow ? formatMoney(r.inflow, cur) : '-'}</td>
                  <td data-label="Out (−)" className="num mono neg">{r.outflow ? formatMoney(r.outflow, cur) : '-'}</td>
                  <td data-label="Balance" className={cx('num mono', r.balance < 0 && 'neg')}>{formatMoney(r.balance, cur)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="empty">No cash movements yet today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
