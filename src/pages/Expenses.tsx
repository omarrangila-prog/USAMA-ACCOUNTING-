import { useMemo, useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { computeExpenseNet } from '@/lib/accounting';
import { formatMoney, formatDate, monthName, defaultDateForPeriod, cx } from '@/lib/utils';
import type { Expense } from '@/types';

/**
 * Expense Ledger — the proper home for money spent.
 *
 * An expense recorded here reduces PROFIT and nothing else: it never moves Cash
 * in Hand and never becomes a party payable. That's the difference from paying
 * a party, which is what an "Exp" party ends up doing — draining cash and
 * leaving a payable behind.
 *
 * Like Profit, it starts fresh every month.
 */
export function Expenses() {
  const store = useData();
  const { period, settings } = store;
  const data = store.dataset();
  const cur = settings.currency;

  const [open, setOpen] = useState<'expense' | 'income' | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  const rows = useMemo(
    () => (data.expenses ?? [])
      .filter((e) => e.month === period.month && e.year === period.year)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [data.expenses, period]
  );
  const net = useMemo(() => computeExpenseNet(data, period), [data, period]);

  return (
    <div>
      <PageHeader
        title="Expense Ledger"
        subtitle={`${monthName(period.month)} ${period.year} · comes off Profit, never off Cash in Hand`}
        actions={
          <>
            <button className="btn btn-danger" onClick={() => { setEditing(null); setOpen('expense'); }}>
              <Icon name="arrow-up" size={16} /> Add Expense
            </button>
            <button className="btn btn-green" onClick={() => { setEditing(null); setOpen('income'); }}>
              <Icon name="arrow-down" size={16} /> Add Other Income
            </button>
          </>
        }
      />

      <div className="cb-cards" style={{ marginBottom: 18 }}>
        <div className="cb-card neg">
          <span className="cb-card-label">Total Expense</span>
          <span className="cb-card-value">{formatMoney(net.expense, cur)}</span>
          <span className="cb-card-sub">Deducted from Profit</span>
        </div>
        <div className="cb-card pos">
          <span className="cb-card-label">Other Income</span>
          <span className="cb-card-value">{formatMoney(net.income, cur)}</span>
          <span className="cb-card-sub">Added to Profit</span>
        </div>
        <div className={cx('cb-card', net.net >= 0 ? 'pos' : 'neg')}>
          <span className="cb-card-label">Net Effect on Profit</span>
          <span className="cb-card-value">{formatMoney(net.net, cur)}</span>
          <span className="cb-card-sub">Income − Expense</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title"><Icon name="wallet" size={16} /> Entries · {rows.length}</div>
        {rows.length === 0 ? (
          <div className="empty">
            Nothing recorded for {monthName(period.month)} {period.year}. Use <strong>Add Expense</strong> above —
            it comes off Profit and leaves Cash in Hand and Payables untouched.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Category</th><th>Note</th>
                  <th className="num">Amount</th><th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Date">{formatDate(e.date)}</td>
                    <td data-label="Type">
                      <span className={cx('badge', e.kind === 'income' ? 'badge-green' : 'badge-red')}>
                        {e.kind === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </td>
                    <td data-label="Category"><strong>{e.category}</strong></td>
                    <td data-label="Note" className="faint">{e.description ?? ''}</td>
                    <td data-label="Amount" className={cx('num mono', e.kind === 'income' ? 'pos' : 'neg')}>
                      {formatMoney(e.amount, cur)}
                    </td>
                    <td className="no-print actions-cell">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit"
                          onClick={() => { setEditing(e); setOpen(e.kind); }}>
                          <Icon name="settings" size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Delete"
                          onClick={() => setToDelete(e)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}><strong>Total {rows.length === 1 ? 'entry' : 'entries'}</strong></td>
                  <td className={cx('num mono', net.net >= 0 ? 'pos' : 'neg')}>
                    <strong>{formatMoney(net.net, cur)}</strong>
                  </td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <ExpenseModal
        kind={open}
        editing={editing}
        onClose={() => { setOpen(null); setEditing(null); }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this entry?"
        message={`${toDelete?.category ?? ''} · ${formatMoney(toDelete?.amount ?? 0, cur)}. Profit returns to its figure before this entry. Cash in Hand is not affected either way.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => { const e = toDelete; setToDelete(null); if (e) await store.deleteExpense(e.id); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ExpenseModal({ kind, editing, onClose }: {
  kind: 'expense' | 'income' | null; editing: Expense | null; onClose: () => void;
}) {
  const store = useData();
  const isIncome = kind === 'income';
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seed once per open, so typing isn't overwritten on re-render.
  const openKey = kind ? `${kind}:${editing?.id ?? 'new'}` : null;
  if (openKey && seeded !== openKey) {
    setSeeded(openKey);
    setDate(editing?.date ?? defaultDateForPeriod(store.period));
    setCategory(editing?.category ?? '');
    setAmount(editing ? String(editing.amount) : '');
    setDescription(editing?.description ?? '');
  }
  if (!kind && seeded !== null) setSeeded(null);
  if (!kind) return null;

  const amt = Number(amount) || 0;
  const submit = async () => {
    setBusy(true);
    try {
      const input = { date, kind, category, amount: amt, description: description.trim() || undefined };
      const ok = editing
        ? await store.updateExpense(editing.id, input)
        : await store.addExpense(input);
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      title={`${editing ? 'Edit' : 'Add'} ${isIncome ? 'Other Income' : 'Expense'}`}
      subtitle={isIncome ? 'Adds to Profit. Does not touch Cash in Hand.' : 'Comes off Profit. Does not touch Cash in Hand or Payables.'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={isIncome ? 'btn btn-green' : 'btn btn-danger'}
            onClick={submit}
            disabled={busy || amt <= 0 || !category.trim()}
          >
            <Icon name="save" size={16} /> {editing ? 'Save' : isIncome ? 'Add Income' : 'Add Expense'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Category</label>
        <input className="input" value={category} placeholder="Rent, Salary, Tea, Bills…"
          onChange={(e) => setCategory(e.target.value)} autoFocus />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Amount</label>
        <input type="number" min="0" inputMode="numeric" className="input" value={amount}
          placeholder="0" onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Note <span className="faint">(optional)</span></label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}
