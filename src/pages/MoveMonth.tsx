import { useState } from 'react';
import { useData } from '@/store/dataStore';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { MONTHS } from '@/lib/utils';

const now = new Date();
const YEARS = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 4 + i);

/**
 * Move all records (purchases, sales, cash, expenses) from one month to
 * another — e.g. entries mistakenly recorded in July can be shifted to June.
 * Shows a live count preview and requires confirmation.
 */
export function MoveMonth() {
  const store = useData();
  const [from, setFrom] = useState({ month: 7, year: now.getFullYear() });
  const [to, setTo] = useState({ month: 6, year: now.getFullYear() });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const counts = store.countInPeriod(from);
  const sameMonth = from.month === to.month && from.year === to.year;

  const doMove = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      await store.moveMonth(from, to);
    } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="section-title">
        <Icon name="calendar" size={16} /> Move Month Data
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Shift every record (purchases, sales, cash, expenses) from one month into another —
        useful if entries were saved in the wrong month.
      </p>

      <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: 150 }}>
          <label>From</label>
          <div className="row" style={{ gap: 6 }}>
            <select className="select" value={from.month} onChange={(e) => setFrom({ ...from, month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="select" value={from.year} onChange={(e) => setFrom({ ...from, year: Number(e.target.value) })} style={{ width: 90 }}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <Icon name="arrow-down" size={18} className="faint" style={{ transform: 'rotate(-90deg)', marginBottom: 10 }} />

        <div className="field" style={{ minWidth: 150 }}>
          <label>To</label>
          <div className="row" style={{ gap: 6 }}>
            <select className="select" value={to.month} onChange={(e) => setTo({ ...to, month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="select" value={to.year} onChange={(e) => setTo({ ...to, year: Number(e.target.value) })} style={{ width: 90 }}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          disabled={busy || sameMonth || counts.total === 0}
          onClick={() => setConfirm(true)}
        >
          <Icon name="refresh" size={16} /> Move {counts.total} Record{counts.total === 1 ? '' : 's'}
        </button>
      </div>

      <div className="move-preview">
        <span className="faint" style={{ fontSize: 12 }}>
          {MONTHS[from.month - 1]} {from.year} has:
        </span>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <span className="badge badge-blue">{counts.purchases} purchases</span>
          <span className="badge badge-green">{counts.sales} sales</span>
          <span className="badge badge-orange">{counts.cash} cash</span>
          <span className="badge badge-gray">{counts.expenses} expenses</span>
        </div>
        {sameMonth && <div className="warn-box" style={{ marginTop: 10 }}><Icon name="warning" size={14} /> From and To are the same month.</div>}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Move all records?"
        message={`This moves all ${counts.total} record(s) from ${MONTHS[from.month - 1]} ${from.year} into ${MONTHS[to.month - 1]} ${to.year}. ${MONTHS[from.month - 1]} will become empty. Continue?`}
        confirmLabel="Move Data"
        onConfirm={doMove}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
