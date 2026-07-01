import { useMemo, useRef, useState, useEffect } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { computeExpenseNet } from '@/lib/accounting';
import { formatMoney, formatDate, defaultDateForPeriod, monthName, cx } from '@/lib/utils';
import type { Expense, ExpenseKind } from '@/types';
import './entry.css';

const COMMON_CATEGORIES = ['Rent', 'Salary', 'Utilities', 'Commission', 'Transport', 'Tea/Food', 'Misc'];

/** Expenses & Income for the selected month. Fully month-isolated + auto totals. */
export function Expenses() {
  const store = useData();
  const { period, expenses, settings, isMonthLocked } = store;
  const cur = settings.currency;
  const locked = isMonthLocked();

  const [kind, setKind] = useState<ExpenseKind>('expense');
  const [date, setDate] = useState(() => defaultDateForPeriod(period));
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const catRef = useRef<HTMLInputElement>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDate(defaultDateForPeriod(period)); }, [period.month, period.year]);

  const rows = useMemo(
    () => expenses
      .filter((e) => e.month === period.month && e.year === period.year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses, period]
  );
  const totals = useMemo(() => computeExpenseNet(store.dataset(), period), [store, period]);

  const resetForm = () => { setCategory(''); setAmount(''); setDesc(''); setEditId(null); };

  const submit = async () => {
    const amt = Number(amount) || 0;
    setBusy(true);
    try {
      const input = { date, kind, category, amount: amt, description: desc || undefined };
      const ok = editId ? await store.updateExpense(editId, input) : await store.addExpense(input);
      if (ok) { resetForm(); setTimeout(() => catRef.current?.focus(), 20); }
    } finally { setBusy(false); }
  };

  const startEdit = (e: Expense) => {
    setEditId(e.id); setKind(e.kind); setDate(e.date);
    setCategory(e.category); setAmount(String(e.amount)); setDesc(e.description ?? '');
    catRef.current?.focus();
  };

  return (
    <div>
      <PageHeader title="Expenses & Income" subtitle={`${monthName(period.month)} ${period.year}`} />

      <div className="entry-layout">
        <div className="card entry-form">
          <div className="section-title">
            <Icon name="wallet" size={16} /> {editId ? 'Edit Entry' : 'New Entry'}
          </div>
          {locked && <div className="locked-banner"><Icon name="lock" size={16} /> This month is closed.</div>}

          <div className="form-grid">
            <div className="field">
              <label>Type</label>
              <div className="segment">
                <button type="button" className={kind === 'expense' ? 'active' : ''} onClick={() => setKind('expense')}>Expense</button>
                <button type="button" className={kind === 'income' ? 'active' : ''} onClick={() => setKind('income')}>Income</button>
              </div>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Category</label>
              <input ref={catRef} className="input" placeholder="e.g. Rent, Salary" value={category}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && amtRef.current?.focus()} />
              <div className="chip-row" style={{ marginTop: 6 }}>
                {COMMON_CATEGORIES.map((c) => (
                  <button key={c} type="button" className="chip" onClick={() => setCategory(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Amount</label>
              <input ref={amtRef} type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </div>
            <div className="field">
              <label>Note (optional)</label>
              <input className="input" placeholder="Details" value={desc} onChange={(e) => setDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </div>
            <button className={kind === 'income' ? 'btn btn-green' : 'btn btn-primary'} onClick={submit} disabled={busy || locked}>
              <Icon name="save" size={16} /> {editId ? 'Save Changes' : `Add ${kind === 'income' ? 'Income' : 'Expense'}`}
            </button>
            {editId && <button className="btn" onClick={resetForm}>Cancel Edit</button>}
          </div>
        </div>

        <div className="card">
          <div className="section-title"><Icon name="wallet" size={16} /> Entries · {rows.length}</div>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <MiniStat label="Total Expense" value={formatMoney(totals.expense, cur)} accent="neg" />
            <MiniStat label="Total Income" value={formatMoney(totals.income, cur)} accent="pos" />
            <MiniStat label="Net" value={formatMoney(totals.net, cur)} accent={totals.net >= 0 ? 'pos' : 'neg'} />
          </div>
          {rows.length === 0 ? (
            <div className="empty">No expenses or income this month yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th className="num">Amount</th><th className="no-print"></th></tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.date)}</td>
                      <td><span className={`badge ${e.kind === 'income' ? 'badge-green' : 'badge-red'}`}>{e.kind}</span></td>
                      <td><strong>{e.category}</strong></td>
                      <td className="muted">{e.description || '—'}</td>
                      <td className={cx('num mono', e.kind === 'income' ? 'pos' : 'neg')}>{formatMoney(e.amount, cur)}</td>
                      <td className="no-print">
                        {!locked && (
                          <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => startEdit(e)}><Icon name="settings" size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete" onClick={() => setToDelete(e.id)}><Icon name="trash" size={15} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete entry?"
        message="This removes the expense/income and updates cash and profit."
        confirmLabel="Delete" danger
        onConfirm={() => { if (toDelete) store.deleteExpense(toDelete); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: 'pos' | 'neg' }) {
  return (
    <div className="card-tight" style={{ background: 'rgba(15,23,42,0.02)' }}>
      <div className="faint" style={{ fontSize: 11.5 }}>{label}</div>
      <div className={cx('mono', accent)} style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
