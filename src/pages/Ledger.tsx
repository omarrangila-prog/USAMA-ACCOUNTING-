import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Combo, type ComboHandle } from '@/components/ui/Combo';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { computeLedger, computePartyBalances, computeCashBook, partyDropdownOptions } from '@/lib/accounting';
import { buildStatementPdf, type StatementRow } from '@/lib/statementPdf';
import { PdfPreview } from '@/components/ui/PdfPreview';
import { usePrintConfirm } from '@/components/ui/PrintConfirm';
import { previewCashEntry } from '@/lib/cashSafeguard';
import { formatMoney, formatNumber, formatDate, defaultDateForPeriod, monthName, cx } from '@/lib/utils';
import { toast } from '@/store/toast';
import type { CashDirection } from '@/types';
import './statement.css';

export function Ledger() {
  const [params, setParams] = useSearchParams();
  const store = useData();
  const { period, dataset, settings } = store;
  const data = dataset();
  const cur = settings.currency;

  const [partyId, setPartyId] = useState(params.get('party') ?? '');
  const [cashModal, setCashModal] = useState<CashDirection | null>(null);
  const [cashEditId, setCashEditId] = useState<string | null>(null);
  const [cashToDelete, setCashToDelete] = useState<string | null>(null);
  const [adjModal, setAdjModal] = useState<'receivable' | 'payable' | null>(null);
  const [preview, setPreview] = useState(false);
  const printConfirm = usePrintConfirm();

  // Open the cash modal in edit mode for an existing cash entry.
  const editCash = (refId: string) => {
    const rec = store.cash.find((c) => c.id === refId);
    if (!rec) return;
    setCashEditId(refId);
    setCashModal(rec.direction);
  };

  // Deep-links: ?cash=received|paid opens the cash modal; ?add=receivable|payable
  // opens the manual adjustment modal (used by the global "+ Add Transaction").
  useEffect(() => {
    const c = params.get('cash');
    if (c === 'received' || c === 'paid') {
      setCashModal(c);
      params.delete('cash');
      setParams(params, { replace: true });
    }
    const a = params.get('add');
    if (a === 'receivable' || a === 'payable') {
      setAdjModal(a);
      params.delete('add');
      setParams(params, { replace: true });
    }
    const p = params.get('party');
    if (p) setPartyId(p);
  }, [params]);

  useEffect(() => {
    if (!partyId && data.parties.length) setPartyId(data.parties[0].id);
  }, [data.parties, partyId]);

  const CASHBOOK = '__cashbook__';
  const isCashBook = partyId === CASHBOOK;

  const entries = useMemo(
    () => (partyId && !isCashBook ? computeLedger(data, partyId, period) : []),
    [data, partyId, period, isCashBook]
  );
  const balances = useMemo(() => computePartyBalances(data, period), [data, period]);
  const bal = balances.find((b) => b.partyId === partyId);
  const partyObj = data.parties.find((p) => p.id === partyId);
  const partyLabel = isCashBook ? 'Cash Book' : partyObj?.name;

  // Statement rows with running balance.
  // Party ledger uses Debit(-)/Credit(+); Cash Book uses inflow(credit)/outflow(debit).
  const statementRows = useMemo<StatementRow[]>(() => {
    let run = 0;
    if (isCashBook) {
      return computeCashBook(data, period).map((l) => {
        run += l.inflow - l.outflow;
        return { date: l.date, tafseel: l.description, debit: l.outflow, credit: l.inflow, balance: run };
      });
    }
    return entries.map((e) => {
      run += e.debit - e.credit;
      return { date: e.date, tafseel: e.description, debit: e.debit, credit: e.credit, balance: run };
    });
  }, [entries, isCashBook, data, period]);

  const totalDebit = statementRows.reduce((a, r) => a + r.debit, 0);
  const totalCredit = statementRows.reduce((a, r) => a + r.credit, 0);
  const netBal = statementRows.length ? statementRows[statementRows.length - 1].balance : 0;

  const makeStatementDoc = () => buildStatementPdf({
    settings,
    title: `${partyLabel} Statement`,
    fromDate: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
    toDate: statementRows.length ? statementRows[statementRows.length - 1].date : undefined,
    rows: statementRows,
  });
  const stmtFileName = `statement-${partyLabel}-${monthName(period.month)}-${period.year}.pdf`;

  const exportStatement = () => {
    if (!partyLabel) return;
    makeStatementDoc().save(stmtFileName);
    toast.success('Statement PDF exported');
  };

  /** One-click print: open the native dialog directly on the statement PDF. */
  const printStatement = () => {
    if (!partyId) return;
    printConfirm.print({ makeDoc: makeStatementDoc, fileName: stmtFileName });
  };

  // Party dropdown ALWAYS lists every party from the master Parties collection
  // (independent of transactions/month/filters), sorted A→Z case-insensitively,
  // each showing its current net balance + Receivable/Payable status.
  const statusSub = (o: { balance: number; status: string }) =>
    o.status === 'Settled' ? formatMoney(0, cur) : `${o.status} ${formatMoney(Math.abs(o.balance), cur)}`;
  // "Cash Book" first (includes expenses/income), then all parties A→Z.
  const partyOptions = [
    { id: CASHBOOK, label: 'Cash Book (all cash, expenses & income)', sub: 'Business cash flow' },
    ...partyDropdownOptions(data, period).map((o) => ({ id: o.id, label: o.name, sub: statusSub(o) })),
  ];

  return (
    <div>
      <PageHeader
        title="Ledger & Cash Book"
        subtitle="Party statements + full business cash book (with expenses & income)"
        actions={
          <>
            <button className="btn btn-green" onClick={() => setCashModal('received')}>
              <Icon name="arrow-down" size={16} /> Cash Received <span className="faint" style={{ fontSize: 11 }}>F4</span>
            </button>
            <button className="btn btn-danger" onClick={() => setCashModal('paid')}>
              <Icon name="arrow-up" size={16} /> Cash Paid <span className="faint" style={{ fontSize: 11 }}>F5</span>
            </button>
            <button className="btn" onClick={() => setAdjModal('receivable')}>
              <Icon name="receivable" size={16} /> Add Receivable
            </button>
            <button className="btn" onClick={() => setAdjModal('payable')}>
              <Icon name="payable" size={16} /> Add Payable
            </button>
            <button className="btn btn-primary" disabled={!partyId} onClick={() => setPreview(true)}>
              <Icon name="search" size={16} /> Preview
            </button>
            <button className="btn" disabled={!partyId} onClick={printStatement}>
              <Icon name="print" size={16} /> Print
            </button>
            <button className="btn" disabled={!partyId} onClick={exportStatement}>
              <Icon name="pdf" size={16} /> Download
            </button>
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ maxWidth: 340 }}>
          <label>Select Party</label>
          <Combo value={partyId} options={partyOptions} placeholder="Choose party" onChange={setPartyId} />
        </div>
      </div>

      {partyId && (
        <div className="card statement-card">
          {/* Easy-Khata style header: name + summary strip */}
          <div className="stmt-title">{partyLabel} Statement</div>
          <div className="stmt-summary">
            <div className="stmt-sum-item">
              <span className="stmt-sum-label">Total Debit</span>
              <span className="stmt-sum-value">{formatMoney(totalDebit, cur)}</span>
            </div>
            <div className="stmt-sum-item">
              <span className="stmt-sum-label">Total Credit</span>
              <span className="stmt-sum-value">{formatMoney(totalCredit, cur)}</span>
            </div>
            <div className="stmt-sum-item">
              <span className="stmt-sum-label">Net Balance</span>
              <span className={cx('stmt-sum-value', netBal >= 0 ? 'pos' : 'neg')}>
                {formatMoney(Math.abs(netBal), cur)} {netBal >= 0 ? '(+)' : '(-)'}
              </span>
            </div>
            {!isCashBook && (
              <div className="stmt-sum-item">
                <span className="stmt-sum-label">Status</span>
                <span className={cx('stmt-sum-value', netBal > 0 ? 'pos' : netBal < 0 ? 'neg' : '')}>
                  {netBal > 0 ? 'Receivable' : netBal < 0 ? 'Payable' : 'Settled'}
                </span>
              </div>
            )}
          </div>

          {statementRows.length === 0 ? (
            <div className="empty">No transactions found for this party.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid stmt-grid stack-sm">
                <thead>
                  <tr>
                    <th>Date</th><th>Tafseel</th>
                    <th className="num">Debit (-)</th><th className="num">Credit (+)</th><th className="num">Balance</th>
                    <th className="no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows.map((r, i) => {
                    const e = isCashBook ? undefined : entries[i];
                    const editable = !!e && e.refType === 'cash';
                    return (
                      <tr key={e?.id ?? `cb-${i}`}>
                        <td data-label="Date">{formatDate(r.date)}</td>
                        <td data-label="Tafseel">{r.tafseel}</td>
                        <td data-label="Debit (-)" className="num mono">{r.debit ? formatNumber(r.debit) : '-'}</td>
                        <td data-label="Credit (+)" className="num mono">{r.credit ? formatNumber(r.credit) : '-'}</td>
                        <td data-label="Balance" className={cx('num mono stmt-bal', r.balance >= 0 ? 'pos' : 'neg')}>
                          {formatNumber(Math.abs(r.balance))} {r.balance >= 0 ? '(+)' : '(-)'}
                        </td>
                        <td className="no-print actions-cell">
                          {editable && (
                            <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-icon btn-sm" title="Edit cash entry"
                                onClick={() => editCash(e!.refId)}>
                                <Icon name="settings" size={14} />
                              </button>
                              <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete cash entry"
                                onClick={() => setCashToDelete(e!.refId)}>
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {!partyId && <div className="card"><div className="empty">Select a party to view their statement.</div></div>}

      <CashModal
        direction={cashModal}
        defaultParty={partyId}
        editId={cashEditId}
        onClose={() => { setCashModal(null); setCashEditId(null); }}
      />
      <AdjustmentModal
        kind={adjModal}
        defaultParty={partyId && partyId !== CASHBOOK ? partyId : ''}
        onClose={() => setAdjModal(null)}
      />
      <ConfirmDialog
        open={!!cashToDelete}
        title="Delete cash entry?"
        message="This removes the cash transaction and updates the party balance."
        confirmLabel="Delete" danger
        onConfirm={() => { if (cashToDelete) store.deleteRecord('cashTransactions', cashToDelete); setCashToDelete(null); }}
        onCancel={() => setCashToDelete(null)}
      />
      <PdfPreview
        makeDoc={preview && partyId ? makeStatementDoc : null}
        title={`${partyLabel} Statement`}
        fileName={stmtFileName}
        onClose={() => setPreview(false)}
      />
      {printConfirm.dialog}
    </div>
  );
}

function CashModal({
  direction, defaultParty, editId, onClose,
}: { direction: CashDirection | null; defaultParty: string; editId?: string | null; onClose: () => void }) {
  const store = useData();
  const startDate = defaultDateForPeriod(store.period);
  const [partyId, setPartyId] = useState(defaultParty);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(startDate);
  const [busy, setBusy] = useState(false);
  const partyRef = useRef<ComboHandle>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!direction) return;
    if (editId) {
      // Editing an existing cash entry — prefill from it.
      const rec = store.cash.find((c) => c.id === editId);
      if (rec) {
        setPartyId(rec.partyId); setAmount(String(rec.amount));
        setNote(rec.note ?? ''); setDate(rec.date);
      }
    } else {
      setPartyId(defaultParty); setAmount(''); setNote('');
      setDate(defaultDateForPeriod(store.period));
    }
    setTimeout(() => amountRef.current?.focus(), 40);
  }, [direction, defaultParty, editId]);

  const isReceived = direction === 'received';
  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));

  // Live before/after balance preview + advance-warning for the selected party.
  const amt = Number(amount) || 0;
  const partyBalance = partyId
    ? computePartyBalances(store.dataset(), store.period).find((b) => b.partyId === partyId)?.balance ?? 0
    : 0;
  const preview = partyId && amt > 0 && direction
    ? previewCashEntry(partyBalance, direction, amt)
    : null;

  const submit = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error('Enter a positive amount.'); amountRef.current?.focus(); return; }
    // Safeguard: if this entry would create an advance (flip receivable↔payable),
    // confirm first — never silently create one.
    if (preview?.createsAdvance && !window.confirm(preview.warning)) return;
    setBusy(true);
    try {
      const input = { date, partyId, direction: direction!, amount: amt, note: note || undefined };
      const ok = editId ? await store.updateCash(editId, input) : await store.addCash(input);
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!direction}
      title={`${editId ? 'Edit ' : ''}${isReceived ? 'Cash Received' : 'Cash Paid'}`}
      subtitle={isReceived ? 'Money received (adds to cash in hand)' : 'Money paid (reduces cash in hand)'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isReceived ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy}>
            <Icon name="save" size={16} /> Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Party <span className="faint">(optional)</span></label>
          <Combo
            ref={partyRef}
            value={partyId} options={partyOptions} placeholder="Optional — blank = cash in hand" allowCreate
            onChange={setPartyId}
            onCreate={async (name) => (await store.addParty({ name, openingBalance: 0 })).id}
            onDone={() => amountRef.current?.focus()}
          />
        </div>
        <div className="field">
          <label>Amount</label>
          <input ref={amountRef} type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>Description <span className="faint">(optional)</span></label>
          <input className="input" placeholder="Details / note" value={note}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        {preview && (
          <div className={cx('cash-preview', preview.createsAdvance && 'warn')}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="faint">Current Balance</span><strong>{preview.beforeLabel}</strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="faint">After This Entry</span><strong>{preview.afterLabel}</strong>
            </div>
            {preview.createsAdvance && (
              <div className="cash-preview-note">⚠ Creates an advance — you'll be asked to confirm.</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Add a manual Receivable (+amount) or Payable (−amount) straight from the
 * Ledger. Reuses the existing addPartyAdjustment logic — no accounting changes.
 * It appears in the party ledger, nets per-party, and flows to every report.
 */
function AdjustmentModal({
  kind, defaultParty, onClose,
}: { kind: 'receivable' | 'payable' | null; defaultParty: string; onClose: () => void }) {
  const store = useData();
  const isRec = kind === 'receivable';
  const [partyId, setPartyId] = useState(defaultParty);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(defaultDateForPeriod(store.period));
  const [busy, setBusy] = useState(false);
  const partyRef = useRef<ComboHandle>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!kind) return;
    setPartyId(defaultParty); setAmount(''); setReason('');
    setDate(defaultDateForPeriod(store.period));
    setTimeout(() => (defaultParty ? amtRef.current?.focus() : partyRef.current?.focus()), 40);
  }, [kind, defaultParty]);

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));
  const amt = Number(amount) || 0;

  const submit = async () => {
    if (!partyId) { toast.error('Select a party.'); partyRef.current?.focus(); return; }
    if (amt <= 0) { toast.error('Enter a positive amount.'); amtRef.current?.focus(); return; }
    setBusy(true);
    try {
      // +amount => receivable, −amount => payable. Same logic as the
      // Receivable/Payable pages — nets per party automatically.
      const ok = await store.addPartyAdjustment({
        date, partyId,
        amount: isRec ? Math.abs(amt) : -Math.abs(amt),
        reason: reason.trim() || (isRec ? 'Manual Receivable' : 'Manual Payable'),
      });
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!kind}
      title={isRec ? 'Add Receivable' : 'Add Payable'}
      subtitle={isRec ? 'Record that a party owes you (no cash / bond involved)' : 'Record that you owe a party (no cash / bond involved)'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isRec ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy}>
            <Icon name="save" size={16} /> {isRec ? 'Add Receivable' : 'Add Payable'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Party</label>
          <Combo
            ref={partyRef}
            value={partyId} options={partyOptions} placeholder="Select or create party" allowCreate
            onChange={setPartyId}
            onCreate={async (name) => (await store.addParty({ name, openingBalance: 0 })).id}
            onDone={() => amtRef.current?.focus()}
          />
        </div>
        <div className="field">
          <label>Amount</label>
          <input ref={amtRef} type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>Description / Reason <span className="faint">(optional)</span></label>
          <input className="input" placeholder="e.g. Old balance, loan, advance" value={reason}
            onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>
    </Modal>
  );
}
