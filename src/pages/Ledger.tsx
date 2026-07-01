import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Combo, type ComboHandle } from '@/components/ui/Combo';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { computeLedger, computePartyBalances, computeCashBook } from '@/lib/accounting';
import { buildStatementPdf, type StatementRow } from '@/lib/statementPdf';
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
  const [cashToDelete, setCashToDelete] = useState<string | null>(null);

  // Deep-links from shortcuts (?cash=received / ?cash=paid) open the cash modal.
  useEffect(() => {
    const c = params.get('cash');
    if (c === 'received' || c === 'paid') {
      setCashModal(c);
      params.delete('cash');
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

  const exportStatement = () => {
    if (!partyLabel) return;
    const doc = buildStatementPdf({
      settings,
      title: `${partyLabel} Statement`,
      fromDate: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
      toDate: statementRows.length ? statementRows[statementRows.length - 1].date : undefined,
      rows: statementRows,
    });
    doc.save(`statement-${partyLabel}-${monthName(period.month)}-${period.year}.pdf`);
    toast.success('Statement PDF exported');
  };

  // "Cash Book" first (includes expenses/income), then all parties.
  const partyOptions = [
    { id: CASHBOOK, label: 'Cash Book (all cash, expenses & income)', sub: 'Business cash flow' },
    ...data.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone })),
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
            <button className="btn" disabled={!partyId} onClick={exportStatement}>
              <Icon name="pdf" size={16} /> Statement PDF
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
          </div>

          {statementRows.length === 0 ? (
            <div className="empty">No entries this month.</div>
          ) : (
            <div className="table-wrap">
              <table className="grid stmt-grid">
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
                        <td>{formatDate(r.date)}</td>
                        <td>{r.tafseel}</td>
                        <td className="num mono">{r.debit ? formatNumber(r.debit) : '-'}</td>
                        <td className="num mono">{r.credit ? formatNumber(r.credit) : '-'}</td>
                        <td className={cx('num mono stmt-bal', r.balance >= 0 ? 'pos' : 'neg')}>
                          {formatNumber(Math.abs(r.balance))} {r.balance >= 0 ? '(+)' : '(-)'}
                        </td>
                        <td className="no-print">
                          {editable && (
                            <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete cash entry"
                              onClick={() => setCashToDelete(e!.refId)}>
                              <Icon name="trash" size={14} />
                            </button>
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
        onClose={() => setCashModal(null)}
      />
      <ConfirmDialog
        open={!!cashToDelete}
        title="Delete cash entry?"
        message="This removes the cash transaction and updates the party balance."
        confirmLabel="Delete" danger
        onConfirm={() => { if (cashToDelete) store.deleteRecord('cashTransactions', cashToDelete); setCashToDelete(null); }}
        onCancel={() => setCashToDelete(null)}
      />
    </div>
  );
}

function CashModal({
  direction, defaultParty, onClose,
}: { direction: CashDirection | null; defaultParty: string; onClose: () => void }) {
  const store = useData();
  const startDate = defaultDateForPeriod(store.period);
  const [partyId, setPartyId] = useState(defaultParty);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(startDate);
  const [busy, setBusy] = useState(false);
  const partyRef = useRef<ComboHandle>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (direction) {
      setPartyId(defaultParty);
      setAmount('');
      setDate(defaultDateForPeriod(store.period));
      // Focus party if none preselected, else amount.
      setTimeout(() => (defaultParty ? amountRef.current?.focus() : partyRef.current?.focus()), 40);
    }
  }, [direction, defaultParty]);

  const isReceived = direction === 'received';
  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));

  const submit = async () => {
    const amt = Number(amount) || 0;
    if (!partyId) { toast.error('Select a party.'); partyRef.current?.focus(); return; }
    if (amt <= 0) { toast.error('Enter a positive amount.'); amountRef.current?.focus(); return; }
    setBusy(true);
    try {
      const ok = await store.addCash({ date, partyId, direction: direction!, amount: amt });
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!direction}
      title={isReceived ? 'Cash Received' : 'Cash Paid'}
      subtitle={isReceived ? 'Money received from a party' : 'Money paid to a party'}
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
          <label>Party</label>
          <Combo
            ref={partyRef}
            value={partyId} options={partyOptions} placeholder="Select or create party" allowCreate
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
      </div>
    </Modal>
  );
}
