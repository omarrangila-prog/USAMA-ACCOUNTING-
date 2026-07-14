import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Combo } from '@/components/ui/Combo';
import { TradeModal, CashModal } from '@/components/TransactionModals';
import { EditTransactionModal } from '@/pages/EditTransactionModal';
import type { CashDirection, Purchase, Sale } from '@/types';
import {
  computeTransactionBook,
  computeCashBookSummary,
  computeBondMovement,
  computeLedger,
  partyTradeTotals,
  type TxnBookType,
  type TxnBookRow,
} from '@/lib/accounting';
import { formatMoney, formatNumber, formatDate, monthName, defaultDateForPeriod, cx } from '@/lib/utils';
import { toast } from '@/store/toast';
import './statement.css';
import './cashbook.css';

/**
 * Cash Book — the central, unified transaction screen. It is a pure projection
 * over the EXISTING Firebase collections (computeTransactionBook): every
 * Purchase, Sale, Cash Receipt/Payment, Expense and Adjustment already written
 * to Firestore shows up here automatically, with a running physical-cash
 * balance. "New Transaction" reuses the existing forms/modals — no new write
 * logic, no schema or collection changes.
 */
/** Signed cash effect of a row under the CLIENT formula:
 *  Cash in Hand = (Sales − Purchases) + (Received − Paid).
 *  Only those four types move cash; Adjustment / Expense / Income do not. */
function cashSign(type: TxnBookType, amount: number): number {
  switch (type) {
    case 'Sale': case 'Receipt': return amount;
    case 'Purchase': case 'Payment': return -amount;
    default: return 0; // Adjustment, Expense, Income
  }
}

/** Map a party-ledger entry to the minimal row shape edit/delete need. */
function ledgerEntryToRow(e: { refType: string; refId: string }): Pick<TxnBookRow, 'collection' | 'refId' | 'type'> | null {
  switch (e.refType) {
    case 'purchase': return { collection: 'purchases', refId: e.refId, type: 'Purchase' };
    case 'sale': return { collection: 'sales', refId: e.refId, type: 'Sale' };
    case 'cash': return { collection: 'cashTransactions', refId: e.refId, type: 'Receipt' };
    case 'adjustment': return { collection: 'partyAdjustments', refId: e.refId, type: 'Adjustment' };
    default: return null; // opening / closing — not editable
  }
}

export function CashBook() {
  const [params, setParams] = useSearchParams();
  const store = useData();
  const { period, dataset, settings } = store;
  const data = dataset();
  const cur = settings.currency;

  const [expenseModal, setExpenseModal] = useState(false);
  const [tradeModal, setTradeModal] = useState<'purchase' | 'sale' | null>(null);
  const [cashModal, setCashModal] = useState<CashDirection | null>(null);
  const [selParty, setSelParty] = useState('');   // person selector for the 4 buttons
  const [viewParty, setViewParty] = useState(params.get('party') ?? ''); // view ONE party's ledger
  const [filter, setFilter] = useState<TxnBookType | 'all'>('all');
  // Edit / delete a single transaction row.
  const [editCashId, setEditCashId] = useState<string | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<{ kind: 'purchase' | 'sale'; rec: Purchase | Sale | null } | null>(null);
  const [toDelete, setToDelete] = useState<Pick<TxnBookRow, 'collection' | 'refId'> | null>(null);

  // Deep-links: "?cash=received|paid" opens the cash modal directly (keyboard
  // shortcuts). Entries made from ANY page still appear here automatically.
  useEffect(() => {
    const c = params.get('cash');
    if (c === 'received' || c === 'paid') {
      setCashModal(c);
      params.delete('cash');
      setParams(params, { replace: true });
    }
  }, [params]);

  const rows = useMemo(() => computeTransactionBook(data, period), [data, period]);
  const sum = useMemo(() => computeCashBookSummary(data, period), [data, period]);
  const movement = useMemo(() => computeBondMovement(data, period), [data, period]);

  // Running cash balance under the client formula (Sale +, Purchase −,
  // Received +, Paid −; adjustments/expense don't move cash).
  const withRunning = useMemo(() => {
    let run = 0;
    return rows.map((r) => {
      const delta = cashSign(r.type, r.amount);
      run += delta;
      return { row: r, running: run, delta };
    });
  }, [rows]);

  const shown = filter === 'all' ? withRunning : withRunning.filter((x) => x.row.type === filter);

  const partyOptions = data.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));

  // Per-party ledger view (when a party is picked in the "View party" dropdown).
  // Running balance is RECEIVABLE (+) / PAYABLE (−) — same as the party ledger:
  // opening + cash + manual adjustments; sale/purchase are reference (memo) only.
  const partyLedger = useMemo(() => {
    if (!viewParty) return null;
    const entries = computeLedger(data, viewParty, period);
    let run = 0;
    const rows = entries.map((e) => {
      run += e.debit - e.credit;              // debit => receivable, credit => payable
      return { entry: e, running: run };
    });
    const trade = partyTradeTotals(data, viewParty, period);
    const name = data.parties.find((p) => p.id === viewParty)?.name ?? '';
    return { rows, trade, name, balance: run };
  }, [viewParty, data, period]);

  const typeClass = (t: TxnBookType) =>
    t === 'Sale' || t === 'Receipt' || t === 'Income' ? 'pos'
    : t === 'Purchase' || t === 'Payment' || t === 'Expense' ? 'neg'
    : '';

  const FILTERS: (TxnBookType | 'all')[] = ['all', 'Purchase', 'Sale', 'Receipt', 'Payment', 'Expense'];

  /** Open the right edit modal for a transaction row (by its collection). */
  const startEdit = (r: Pick<TxnBookRow, 'collection' | 'refId'>) => {
    switch (r.collection) {
      case 'cashTransactions': {
        const dir = data.cash.find((c) => c.id === r.refId)?.direction ?? 'received';
        setEditCashId(r.refId); setCashModal(dir);
        break;
      }
      case 'expenses': setEditExpenseId(r.refId); setExpenseModal(true); break;
      case 'purchases': setEditRecord({ kind: 'purchase', rec: data.purchases.find((p) => p.id === r.refId) ?? null }); break;
      case 'sales': setEditRecord({ kind: 'sale', rec: data.sales.find((s) => s.id === r.refId) ?? null }); break;
    }
  };

  /** Delete a transaction row via the matching store method. */
  const doDelete = async () => {
    const r = toDelete;
    setToDelete(null);
    if (!r) return;
    if (r.collection === 'purchases' || r.collection === 'sales' || r.collection === 'cashTransactions') {
      await store.deleteRecord(r.collection, r.refId);
    } else if (r.collection === 'expenses') {
      await store.deleteExpense(r.refId);
    } else if (r.collection === 'partyAdjustments') {
      await store.deletePartyAdjustment(r.refId);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cash Book"
        subtitle={`${monthName(period.month)} ${period.year} · every transaction in one place`}
        actions={
          <button className="btn" onClick={() => setExpenseModal(true)}>
            <Icon name="wallet" size={16} /> Expense / Income
          </button>
        }
      />

      {/* Summary cards — everything the old Dashboard showed, on this one page. */}
      <div className="cb-cards">
        <div className={cx('cb-card hero', sum.cashInHand >= 0 ? 'pos' : 'neg')}>
          <span className="cb-card-label">Cash in Hand</span>
          <span className="cb-card-value">{formatMoney(sum.cashInHand, cur)}</span>
          <span className="cb-card-sub">(Sales − Purchase) + (Received − Paid)</span>
        </div>
        <div className="cb-card">
          <span className="cb-card-label">{sum.profit >= 0 ? 'Profit' : 'Loss'}</span>
          <span className={cx('cb-card-value', sum.profit >= 0 ? 'pos' : 'neg')}>{formatMoney(Math.abs(sum.profit), cur)}</span>
          <span className="cb-card-sub">Sales − Cost of Sales</span>
        </div>
        <div className="cb-card">
          <span className="cb-card-label">Total Sales</span>
          <span className="cb-card-value">{formatMoney(sum.totalSales, cur)}</span>
        </div>
        <div className="cb-card">
          <span className="cb-card-label">Total Purchases</span>
          <span className="cb-card-value">{formatMoney(sum.totalPurchases, cur)}</span>
        </div>
      </div>

      {/* Entry box: pick a person, then one of 4 buttons opens a fill-in form. */}
      <div className="card cb-entry">
        <div className="cb-entry-title"><Icon name="plus" size={16} /> New Entry</div>
        <div className="cb-entry-row">
          <div className="field cb-entry-party">
            <label>Person / Party <span className="faint">(optional for Sale/Purchase)</span></label>
            <Combo
              value={selParty}
              options={partyOptions}
              placeholder="Select or create a party"
              allowCreate
              onChange={setSelParty}
            />
          </div>
          <div className="cb-entry-buttons">
            <button className="btn btn-green" onClick={() => setTradeModal('sale')}>
              <Icon name="sale" size={16} /> Sale
            </button>
            <button className="btn btn-primary" onClick={() => setTradeModal('purchase')}>
              <Icon name="purchase" size={16} /> Purchase
            </button>
            <button className="btn btn-green" onClick={() => setCashModal('received')}>
              <Icon name="arrow-down" size={16} /> Cash Receivable
            </button>
            <button className="btn btn-danger" onClick={() => setCashModal('paid')}>
              <Icon name="arrow-up" size={16} /> Cash Payable
            </button>
          </div>
        </div>
      </div>

      <div className="card statement-card">
        <div className="cb-txn-head">
          <div className="stmt-title" style={{ margin: 0 }}>
            {partyLedger ? `${partyLedger.name} — Ledger` : `Transactions · ${formatNumber(sum.txnCount)}`}
          </div>
          {/* Dropdown to view ONE party's ledger (transactions + running balance). */}
          <div className="cb-viewparty no-print">
            <label className="faint">View party</label>
            <Combo
              value={viewParty}
              options={[{ id: '', label: 'All parties (Cash Book)' }, ...partyOptions]}
              placeholder="All parties"
              onChange={setViewParty}
            />
          </div>
        </div>

        {partyLedger ? (
          /* ---- Per-party ledger view: receivable/payable running balance ---- */
          <>
            <div className="stmt-summary">
              <div className="stmt-sum-item">
                <span className="stmt-sum-label">Total Purchased</span>
                <span className="stmt-sum-value">{formatMoney(partyLedger.trade.purchased, cur)}</span>
              </div>
              <div className="stmt-sum-item">
                <span className="stmt-sum-label">Total Sold</span>
                <span className="stmt-sum-value">{formatMoney(partyLedger.trade.sold, cur)}</span>
              </div>
              {/* Sign is applied automatically: Receivable is +, Payable is −. */}
              <div className="stmt-sum-item">
                <span className="stmt-sum-label">Receivable</span>
                <span className="stmt-sum-value pos">
                  {partyLedger.balance > 0 ? `+${formatMoney(partyLedger.balance, cur)}` : formatMoney(0, cur)}
                </span>
              </div>
              <div className="stmt-sum-item">
                <span className="stmt-sum-label">Payable</span>
                <span className="stmt-sum-value neg">
                  {partyLedger.balance < 0 ? `−${formatMoney(Math.abs(partyLedger.balance), cur)}` : formatMoney(0, cur)}
                </span>
              </div>
              <div className="stmt-sum-item">
                <span className="stmt-sum-label">Status</span>
                <span className={cx('stmt-sum-value', partyLedger.balance > 0 ? 'pos' : partyLedger.balance < 0 ? 'neg' : '')}>
                  {partyLedger.balance > 0 ? 'Receivable' : partyLedger.balance < 0 ? 'Payable' : 'Settled'}
                </span>
              </div>
            </div>
            {partyLedger.rows.length === 0 ? (
              <div className="empty">No transactions for this party this month.</div>
            ) : (
              <div className="table-wrap">
                <table className="grid stmt-grid stack-sm">
                  <thead>
                    <tr>
                      <th>Date</th><th>Details</th>
                      <th className="num">Debit (+)</th><th className="num">Credit (−)</th><th className="num">Receivable / Payable</th>
                      <th className="no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyLedger.rows.map(({ entry: e, running }) => {
                      const row = ledgerEntryToRow(e);
                      return (
                      <tr key={e.id}>
                        <td data-label="Date">{formatDate(e.date)}</td>
                        <td data-label="Details">
                          {e.memo
                            ? <>{e.description} — {formatMoney(e.memo, cur)} <span className="faint">(reference)</span></>
                            : e.description}
                        </td>
                        <td data-label="Debit (+)" className="num mono">
                          {e.debit ? formatMoney(e.debit, cur) : e.memo ? <span className="faint">ref</span> : '—'}
                        </td>
                        <td data-label="Credit (−)" className="num mono">
                          {e.credit ? formatMoney(e.credit, cur) : e.memo ? <span className="faint">ref</span> : '—'}
                        </td>
                        <td data-label="Receivable / Payable" className={cx('num mono stmt-bal', running > 0 ? 'pos' : running < 0 ? 'neg' : '')}>
                          {running === 0 ? formatMoney(0, cur)
                            : running > 0 ? `+${formatMoney(running, cur)} Receivable`
                            : `−${formatMoney(Math.abs(running), cur)} Payable`}
                        </td>
                        <td className="no-print actions-cell">
                          {row && (
                            <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => startEdit(row)}>
                                <Icon name="settings" size={14} />
                              </button>
                              <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete" onClick={() => setToDelete(row)}>
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          /* ---- Full Cash Book view (all parties) ---- */
          <>
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
                No transactions yet this month. Pick a person and press <strong>Sale</strong>, <strong>Purchase</strong>,
                <strong> Received</strong> or <strong>Paid</strong> above — it will appear here instantly.
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
                    {shown.map(({ row: r, running, delta }) => (
                      <tr key={r.id}>
                        <td data-label="Date">{formatDate(r.date)}</td>
                        <td data-label="Voucher #" className="mono">{r.voucher}</td>
                        <td data-label="Type"><span className={typeClass(r.type)}>{r.type}</span></td>
                        <td data-label="Party">{r.partyName}</td>
                        <td data-label="Details">{r.description}</td>
                        <td data-label="Qty" className="num mono">{r.qty ? formatNumber(r.qty) : '-'}</td>
                        <td data-label="Rate" className="num mono">{r.rate ? formatNumber(r.rate) : '-'}</td>
                        <td data-label="Amount" className={cx('num mono', typeClass(r.type))}>
                          {delta > 0 ? '+' : delta < 0 ? '−' : ''}{formatMoney(r.amount, cur)}
                        </td>
                        <td data-label="Cash Balance" className={cx('num mono stmt-bal', running >= 0 ? 'pos' : 'neg')}>
                          {delta === 0 ? '—' : formatMoney(running, cur)}
                        </td>
                        <td className="no-print actions-cell">
                          <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => startEdit(r)}>
                              <Icon name="settings" size={14} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete" onClick={() => setToDelete(r)}>
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <TradeModal kind={tradeModal} defaultParty={selParty} onClose={() => setTradeModal(null)} />
      <CashModal direction={cashModal} defaultParty={selParty} editId={editCashId} onClose={() => { setCashModal(null); setEditCashId(null); }} />
      <EditTransactionModal
        kind={editRecord?.kind ?? 'purchase'}
        record={editRecord?.rec ?? null}
        onClose={() => setEditRecord(null)}
      />
      <ExpenseModal open={expenseModal} editId={editExpenseId} onClose={() => { setExpenseModal(false); setEditExpenseId(null); }} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this transaction?"
        message="This permanently removes the transaction and updates all balances."
        confirmLabel="Delete" danger
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

/**
 * Inline Expense / Income entry — the Expense page was removed, but the write
 * logic (store.addExpense) and engine are intact. This just calls the EXISTING
 * addExpense; the row then appears in the Cash Book automatically.
 */
function ExpenseModal({ open, editId, onClose }: { open: boolean; editId?: string | null; onClose: () => void }) {
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
    const rec = editId ? (store.expenses ?? []).find((e) => e.id === editId) : null;
    if (rec) {
      setKind(rec.kind); setCategory(rec.category); setAmount(String(rec.amount));
      setDescription(rec.description ?? ''); setDate(rec.date);
    } else {
      setKind('expense'); setCategory(''); setAmount(''); setDescription('');
      setDate(defaultDateForPeriod(store.period));
    }
    setTimeout(() => amtRef.current?.focus(), 40);
  }, [open, editId]);

  const submit = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error('Enter a positive amount.'); amtRef.current?.focus(); return; }
    setBusy(true);
    try {
      const input = {
        date, kind, amount: amt,
        category: category.trim() || (kind === 'income' ? 'Other Income' : 'General'),
        description: description.trim() || undefined,
      };
      const ok = editId ? await store.updateExpense(editId, input) : await store.addExpense(input);
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
