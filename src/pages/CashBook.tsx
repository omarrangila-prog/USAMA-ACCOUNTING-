import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Combo } from '@/components/ui/Combo';
import { TradeModal, CashModal, AdjustmentModal } from '@/components/TransactionModals';
import type { CashDirection } from '@/types';
import {
  computeTransactionBook,
  computeCashBookSummary,
  computeBondMovement,
  type TxnBookType,
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

export function CashBook() {
  const [params, setParams] = useSearchParams();
  const { period, dataset, settings } = useData();
  const data = dataset();
  const cur = settings.currency;

  const [expenseModal, setExpenseModal] = useState(false);
  const [tradeModal, setTradeModal] = useState<'purchase' | 'sale' | null>(null);
  const [cashModal, setCashModal] = useState<CashDirection | null>(null);
  const [adjModal, setAdjModal] = useState<'receivable' | 'payable' | null>(null);
  const [selParty, setSelParty] = useState('');   // person selector for the 4 buttons
  const [filter, setFilter] = useState<TxnBookType | 'all'>('all');

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

  const typeClass = (t: TxnBookType) =>
    t === 'Sale' || t === 'Receipt' || t === 'Income' ? 'pos'
    : t === 'Purchase' || t === 'Payment' || t === 'Expense' ? 'neg'
    : '';

  const FILTERS: (TxnBookType | 'all')[] = ['all', 'Purchase', 'Sale', 'Receipt', 'Payment', 'Adjustment', 'Expense'];

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
          <span className="cb-card-label">Receivable</span>
          <span className="cb-card-value pos">{formatMoney(sum.receivable, cur)}</span>
          <span className="cb-card-sub">Party owes you</span>
        </div>
        <div className="cb-card">
          <span className="cb-card-label">Payable</span>
          <span className="cb-card-value neg">{formatMoney(sum.payable, cur)}</span>
          <span className="cb-card-sub">You owe party</span>
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
            <button className="btn btn-green" onClick={() => { if (needParty()) setAdjModal('receivable'); }}>
              <Icon name="receivable" size={16} /> Receivable
            </button>
            <button className="btn btn-danger" onClick={() => { if (needParty()) setAdjModal('payable'); }}>
              <Icon name="payable" size={16} /> Payable
            </button>
          </div>
        </div>
      </div>

      <div className="card statement-card">
        <div className="stmt-title">Transactions · {formatNumber(sum.txnCount)}</div>

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
            <strong> Receivable</strong> or <strong>Payable</strong> above — it will appear here instantly.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid stmt-grid stack-sm">
              <thead>
                <tr>
                  <th>Date</th><th>Voucher #</th><th>Type</th><th>Party</th><th>Details</th>
                  <th className="num">Qty</th><th className="num">Rate</th>
                  <th className="num">Amount</th><th className="num">Cash Balance</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TradeModal kind={tradeModal} defaultParty={selParty} onClose={() => setTradeModal(null)} />
      <CashModal direction={cashModal} defaultParty={selParty} onClose={() => setCashModal(null)} />
      <AdjustmentModal kind={adjModal} defaultParty={selParty} onClose={() => setAdjModal(null)} />
      <ExpenseModal open={expenseModal} onClose={() => setExpenseModal(false)} />
    </div>
  );

  /** Receivable/Payable require a party; warn if none picked. */
  function needParty(): boolean {
    if (!selParty) { toast.error('Select a person/party first for Receivable / Payable.'); return false; }
    return true;
  }
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
