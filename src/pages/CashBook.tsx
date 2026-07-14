import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { AddTransactionModal, type TxnKind } from '@/components/AddTransaction';
import {
  computeTransactionBook,
  computeCashInHand,
  type TxnBookRow,
  type TxnBookType,
} from '@/lib/accounting';
import { formatMoney, formatNumber, formatDate, monthName, defaultDateForPeriod, cx } from '@/lib/utils';
import { toast } from '@/store/toast';
import './statement.css';

/**
 * Cash Book — the central, unified transaction screen. It is a pure projection
 * over the EXISTING Firebase collections (computeTransactionBook): every
 * Purchase, Sale, Cash Receipt/Payment, Expense and Adjustment already written
 * to Firestore shows up here automatically, with a running physical-cash
 * balance. "New Transaction" reuses the existing forms/modals — no new write
 * logic, no schema or collection changes.
 */
export function CashBook() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;

  const [addTxn, setAddTxn] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [filter, setFilter] = useState<TxnBookType | 'all'>('all');

  // "?new=1" opens the chooser straight away (used by the global + button / nav).
  useEffect(() => {
    if (params.get('new') === '1') {
      setAddTxn(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params]);

  const rows = useMemo(() => computeTransactionBook(data, period), [data, period]);
  const openingCash = 0; // running column starts at 0; period cash is self-contained
  const cashInHand = useMemo(() => computeCashInHand(data, period), [data, period]);

  // Running physical-cash balance (only cash-affecting rows move it).
  const withRunning = useMemo(() => {
    let run = openingCash;
    return rows.map((r) => {
      run += r.cashDelta;
      return { row: r, running: run };
    });
  }, [rows]);

  const shown = filter === 'all' ? withRunning : withRunning.filter((x) => x.row.type === filter);

  const totalIn = rows.reduce((a, r) => a + (r.cashDelta > 0 ? r.cashDelta : 0), 0);
  const totalOut = rows.reduce((a, r) => a + (r.cashDelta < 0 ? -r.cashDelta : 0), 0);

  /** Route each chosen transaction type to the EXISTING form/modal. */
  const handleAddTxn = (kind: TxnKind, partyId: string) => {
    const q = partyId ? `?party=${partyId}` : '';
    switch (kind) {
      case 'purchase': nav(`/purchase${q}`); break;
      case 'sale': nav(`/sale${q}`); break;
      case 'stock': nav('/stock'); break;
      // Cash + adjustment reuse the Ledger's existing modals via deep-link.
      case 'received': nav(`/ledger?party=${partyId}&cash=received`); break;
      case 'paid': nav(`/ledger?party=${partyId}&cash=paid`); break;
      case 'receivable': nav(`/ledger?party=${partyId}&add=receivable`); break;
      case 'payable': nav(`/ledger?party=${partyId}&add=payable`); break;
    }
  };

  const typeClass = (t: TxnBookType) =>
    t === 'Sale' || t === 'Receipt' || t === 'Income' ? 'pos'
    : t === 'Purchase' || t === 'Payment' || t === 'Expense' ? 'neg'
    : '';

  const FILTERS: (TxnBookType | 'all')[] = ['all', 'Purchase', 'Sale', 'Receipt', 'Payment', 'Expense', 'Adjustment'];

  return (
    <div>
      <PageHeader
        title="Cash Book"
        subtitle={`${monthName(period.month)} ${period.year} · every transaction in one place`}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setAddTxn(true)}>
              <Icon name="plus" size={16} /> New Transaction
            </button>
            <button className="btn" onClick={() => setExpenseModal(true)}>
              <Icon name="wallet" size={16} /> Expense / Income
            </button>
          </>
        }
      />

      <div className="card statement-card">
        <div className="stmt-title">Cash Book</div>
        <div className="stmt-summary">
          <div className="stmt-sum-item">
            <span className="stmt-sum-label">Cash In</span>
            <span className="stmt-sum-value pos">{formatMoney(totalIn, cur)}</span>
          </div>
          <div className="stmt-sum-item">
            <span className="stmt-sum-label">Cash Out</span>
            <span className="stmt-sum-value neg">{formatMoney(totalOut, cur)}</span>
          </div>
          <div className="stmt-sum-item">
            <span className="stmt-sum-label">Cash in Hand</span>
            <span className={cx('stmt-sum-value', cashInHand >= 0 ? 'pos' : 'neg')}>
              {formatMoney(cashInHand, cur)}
            </span>
          </div>
          <div className="stmt-sum-item">
            <span className="stmt-sum-label">Transactions</span>
            <span className="stmt-sum-value">{formatNumber(rows.length)}</span>
          </div>
        </div>

        <div className="cashbook-filters no-print">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={cx('chip', filter === f && 'chip-done')}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            No transactions yet this month. Click <strong>New Transaction</strong> to record a purchase,
            sale, receipt, payment or adjustment — it will appear here instantly.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid stmt-grid stack-sm">
              <thead>
                <tr>
                  <th>Date</th><th>Voucher #</th><th>Type</th><th>Party</th><th>Details</th>
                  <th className="num">Qty</th><th className="num">Rate</th>
                  <th className="num">Amount</th><th className="num">Cash Balance</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ row: r, running }) => (
                  <tr key={r.id}>
                    <td data-label="Date">{formatDate(r.date)}</td>
                    <td data-label="Voucher #" className="mono">{r.voucher}</td>
                    <td data-label="Type"><span className={typeClass(r.type)}>{r.type}</span></td>
                    <td data-label="Party">{r.partyName}</td>
                    <td data-label="Details">{r.description}</td>
                    <td data-label="Qty" className="num mono">{r.qty ? formatNumber(r.qty) : '-'}</td>
                    <td data-label="Rate" className="num mono">{r.rate ? formatNumber(r.rate) : '-'}</td>
                    <td data-label="Amount" className={cx('num mono', typeClass(r.type))}>
                      {formatMoney(r.amount, cur)}
                    </td>
                    <td data-label="Cash Balance" className={cx('num mono stmt-bal', running >= 0 ? 'pos' : 'neg')}>
                      {r.cashDelta === 0 ? '—' : formatMoney(running, cur)}
                    </td>
                    <td className="no-print actions-cell">
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Open in ledger"
                        onClick={() => r.partyId && nav(`/ledger?party=${r.partyId}`)}
                        disabled={!r.partyId}
                      >
                        <Icon name="ledger" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile floating action button. */}
      <button className="ledger-fab no-print" onClick={() => setAddTxn(true)} aria-label="New Transaction">
        <Icon name="plus" size={18} /> Add
      </button>

      <AddTransactionModal
        open={addTxn}
        partyId=""
        onClose={() => setAddTxn(false)}
        onPick={handleAddTxn}
      />
      <ExpenseModal open={expenseModal} onClose={() => setExpenseModal(false)} />
    </div>
  );
}

/**
 * Inline Expense / Income entry — the Expense page was removed, but the write
 * logic (store.addExpense) and engine are intact. This just calls the EXISTING
 * addExpense; the row then appears in the Cash Book automatically.
 */
function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useData();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDateForPeriod(store.period));
  const [busy, setBusy] = useState(false);
  const amtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind('expense'); setCategory(''); setAmount(''); setDescription('');
    setDate(defaultDateForPeriod(store.period));
    setTimeout(() => amtRef.current?.focus(), 40);
  }, [open]);

  const submit = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error('Enter a positive amount.'); amtRef.current?.focus(); return; }
    setBusy(true);
    try {
      const ok = await store.addExpense({
        date, kind, amount: amt,
        category: category.trim() || (kind === 'income' ? 'Other Income' : 'General'),
        description: description.trim() || undefined,
      });
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  const isIncome = kind === 'income';
  return (
    <Modal
      open={open}
      title="Expense / Income"
      subtitle="Records to the existing expense account — appears in the Cash Book & reports."
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isIncome ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy}>
            <Icon name="save" size={16} /> Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Type</label>
          <div className="segment">
            <button className={cx(!isIncome && 'active')} onClick={() => setKind('expense')}>Expense</button>
            <button className={cx(isIncome && 'active')} onClick={() => setKind('income')}>Income</button>
          </div>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <input className="input" placeholder={isIncome ? 'e.g. Commission' : 'e.g. Rent, Salary'} value={category}
            onChange={(e) => setCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>Amount</label>
          <input ref={amtRef} type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>Description <span className="faint">(optional)</span></label>
          <input className="input" placeholder="Details / note" value={description}
            onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>
    </Modal>
  );
}
