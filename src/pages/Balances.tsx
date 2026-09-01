import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Combo, type ComboHandle } from '@/components/ui/Combo';
import { computeReceivables, computePayables } from '@/lib/accounting';
import { previewCashEntry } from '@/lib/cashSafeguard';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney, formatDate, defaultDateForPeriod, cx } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';

export function Balances({ kind }: { kind: 'receivable' | 'payable' }) {
  const nav = useNavigate();
  const t = useT();
  const store = useData();
  const { period, dataset, settings } = store;
  const data = dataset();
  const cur = settings.currency;
  const isRec = kind === 'receivable';

  // Which party we're recording a payment for (null = closed).
  const [payFor, setPayFor] = useState<{ partyId: string; name: string; balance: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adjToEdit, setAdjToEdit] = useState<string | null>(null);
  const [adjToDelete, setAdjToDelete] = useState<string | null>(null);

  // F3 (Receivable) / F4 (Payable) deep-link "?new=1" opens the entry form from
  // anywhere in the app. Clear the param so a refresh doesn't reopen it.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') === '1') {
      setAddOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params]);

  const rows = useMemo(
    () => (isRec ? computeReceivables(data, period) : computePayables(data, period)),
    [data, period, isRec]
  );

  const partyLabel = (id: string) => data.parties.find((p) => p.id === id)?.name ?? '—';
  // Manual receivable/payable ENTRIES added this month for THIS side.
  //  - Exclude settlement records (auto-created by Receive/Pay). A receive
  //    settlement is negative and would otherwise leak onto the Payable log
  //    (and a pay settlement, positive, onto the Receivable log).
  //  - Skip orphans whose party was deleted (would render a blank row).
  const partyExists = (id: string) => data.parties.some((p) => p.id === id);
  const manualAdjustments = useMemo(
    () => (data.partyAdjustments ?? [])
      .filter((a) =>
        !a.settlement &&                       // genuine manual entries only
        partyExists(a.partyId) &&
        a.month === period.month && a.year === period.year &&
        (isRec ? a.amount > 0 : a.amount < 0))  // receivable=+, payable=-
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.partyAdjustments, data.parties, period, isRec]
  );
  const total = rows.reduce((a, r) => a + r.balance, 0);

  return (
    <div>
      <PageHeader
        title={isRec ? t('p.receivableTitle') : t('p.payableTitle')}
        subtitle={isRec ? 'Parties who owe you money — record a receipt here' : 'Parties you owe money to — record a payment here'}
        actions={
          <>
            <button className={isRec ? 'btn btn-green' : 'btn btn-danger'} onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> {isRec ? 'Add Receivable' : 'Add Payable'}
            </button>
            <button className="btn" onClick={() => { exportReportPdf(data, settings, period, kind); toast.success('PDF exported'); }}>
              <Icon name="pdf" size={16} /> Export PDF
            </button>
          </>
        }
      />
      <div className="card">
        <div className="section-title">
          <Icon name={isRec ? 'receivable' : 'payable'} size={16} />
          {isRec ? 'Receivables' : 'Payables'} · {rows.length}
          <span className="spacer" />
          <span className={`badge ${isRec ? 'badge-green' : 'badge-red'}`}>{formatMoney(total, cur)}</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">Nothing {isRec ? 'receivable' : 'payable'} this month.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr>
                  <th>Party</th>
                  <th className="num">Opening</th>
                  <th className="num">{isRec ? 'Receivable' : 'Payable'}</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partyId}>
                    <td data-label="Party"><strong>{r.name}</strong></td>
                    <td data-label="Opening" className="num mono">{formatMoney(Math.abs(r.opening), cur)}</td>
                    <td data-label={isRec ? 'Receivable' : 'Payable'} className={`num mono ${isRec ? 'pos' : 'neg'}`}><strong>{formatMoney(r.balance, cur)}</strong></td>
                    <td className="no-print actions-cell">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className={`btn btn-sm ${isRec ? 'btn-green' : 'btn-danger'}`} onClick={() => setPayFor(r)}>
                          <Icon name={isRec ? 'arrow-down' : 'arrow-up'} size={14} /> {isRec ? 'Receive' : 'Pay'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className={`num mono ${isRec ? 'pos' : 'neg'}`}>{formatMoney(total, cur)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {manualAdjustments.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">
            <Icon name="plus" size={16} /> Manual {isRec ? 'Receivable' : 'Payable'} Entries · {manualAdjustments.length}
          </div>
          <div className="table-wrap">
            <table className="grid stack-sm">
              <thead>
                <tr><th>Date</th><th>Party</th><th className="num">Amount</th><th>Reason</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {manualAdjustments.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Date">{formatDate(a.date)}</td>
                    <td data-label="Party"><strong>{partyLabel(a.partyId)}</strong></td>
                    <td data-label="Amount" className={cx('num mono', isRec ? 'pos' : 'neg')}>{formatMoney(Math.abs(a.amount), cur)}</td>
                    <td data-label="Reason" className="muted">{a.reason}</td>
                    <td className="no-print actions-cell">
                      <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => { setAdjToEdit(a.id); setAddOpen(true); }}>
                          <Icon name="settings" size={15} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete" onClick={() => setAdjToDelete(a.id)}>
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaymentModal
        kind={kind}
        target={payFor}
        onClose={() => setPayFor(null)}
      />
      <AddBalanceModal kind={kind} open={addOpen} editId={adjToEdit} onClose={() => { setAddOpen(false); setAdjToEdit(null); }} />
      <ConfirmDialog
        open={!!adjToDelete}
        title="Delete entry?"
        message="This removes the manual balance entry and recalculates the party's net balance."
        confirmLabel="Delete" danger
        onConfirm={() => { if (adjToDelete) store.deletePartyAdjustment(adjToDelete); setAdjToDelete(null); }}
        onCancel={() => setAdjToDelete(null)}
      />
    </div>
  );
}

/** Directly record a receivable (they owe you) or payable (you owe them). */
function AddBalanceModal({
  kind, open, editId, onClose,
}: { kind: 'receivable' | 'payable'; open: boolean; editId?: string | null; onClose: () => void }) {
  const store = useData();
  const cur = store.settings.currency;
  const isRec = kind === 'receivable';
  const isEdit = !!editId;
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(defaultDateForPeriod(store.period));
  const [busy, setBusy] = useState(false);
  // Keyboard-flow refs: Party (combo) → Amount → Reason → Save. The combo's
  // onDone advances to Amount; Enter on Amount → Reason; Enter on Reason → save.
  const partyRef = useRef<ComboHandle>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  // Focus the Party trigger, retrying across a few frames so it wins the race
  // against the modal/Combo mount and the field-reset re-render (no mouse, no
  // flicker). Shared by open-focus and the after-save "new blank" reset.
  // Focus the Party trigger exactly ONCE, on the next frame after the modal has
  // painted. A single focus() call — never a retry loop: repeatedly re-focusing
  // fought the Combo's own focus handling and bounced focus, which replayed
  // buffered keystrokes (typing "b" produced "bbb"). One clean call = start on
  // Party, no flicker, no duplicated characters.
  const focusParty = () => {
    setTimeout(() => partyRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const rec = (store.partyAdjustments ?? []).find((a) => a.id === editId);
      if (rec) {
        setPartyId(rec.partyId); setAmount(String(Math.abs(rec.amount)));
        setReason(rec.reason ?? ''); setDate(rec.date);
      }
    } else {
      setPartyId(''); setAmount(''); setReason(''); setDate(defaultDateForPeriod(store.period));
    }
  }, [open, editId]);

  // Auto-focus the Party field the moment the form opens (rapid keyboard entry
  // always starts on Party — Date keeps its sensible default and stays reachable
  // via Shift+Tab). Edit mode leaves focus alone so the user can review first.
  useEffect(() => {
    if (!open || editId) return;
    focusParty();
  }, [open, editId]);

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));
  const amt = Number(amount) || 0;

  // Clear the fields for the NEXT entry and return focus to Party — continuous
  // high-speed entry, exactly like a traditional accounting register.
  const resetForNext = () => {
    setPartyId(''); setAmount(''); setReason('');
    setDate(defaultDateForPeriod(store.period));
    focusParty();
  };

  const submit = async () => {
    if (!partyId) { toast.error('Select a party.'); partyRef.current?.focus(); return; }
    if (amt <= 0) { toast.error('Enter a positive amount.'); amountRef.current?.focus(); return; }
    setBusy(true);
    try {
      // +ve => receivable, -ve => payable
      const input = {
        date, partyId, amount: isRec ? Math.abs(amt) : -Math.abs(amt),
        reason: reason || (isRec ? 'Receivable' : 'Payable'),
      };
      const ok = editId
        ? await store.updatePartyAdjustment(editId, input)
        : await store.addPartyAdjustment(input);
      if (ok) {
        if (isEdit) { onClose(); }
        else {
          // Rapid entry: keep the form open, reset it, and jump back to Party.
          toast.success(isRec ? 'Receivable added' : 'Payable added');
          resetForNext();
        }
      }
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={`${isEdit ? 'Edit ' : 'Add '}${isRec ? 'Receivable' : 'Payable'}`}
      subtitle={isRec ? 'Record that a party owes you (no cash / bond involved)' : 'Record that you owe a party (no cash / bond involved)'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isRec ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy || !partyId || amt <= 0}>
            <Icon name="save" size={16} /> {isEdit ? 'Save Changes' : (isRec ? 'Add & New' : 'Add & New')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); partyRef.current?.focus(); } }} />
        </div>
        <div className="field">
          <label>Party</label>
          <Combo ref={partyRef} value={partyId} options={partyOptions} placeholder="Select or create party" allowCreate
            onChange={setPartyId}
            onCreate={async (name) => (await store.addParty({ name, openingBalance: 0 })).id}
            onDone={() => setTimeout(() => amountRef.current?.focus(), 0)} />
        </div>
        <div className="field">
          <label>{isRec ? 'Amount they owe you' : 'Amount you owe them'}</label>
          <input ref={amountRef} type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); reasonRef.current?.focus(); } }} />
        </div>
        <div className="field">
          <label>Reason / note</label>
          <input ref={reasonRef} className="input" placeholder="e.g. Old balance, loan, advance" value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        </div>
        <div className={cx('amount-preview', isRec && 'green')}>
          <span className="amt-label">{isRec ? 'Receivable' : 'Payable'}</span>
          <span className="amt-value mono">{formatMoney(amt, cur)}</span>
        </div>
      </div>
    </Modal>
  );
}

/** Record a cash receipt (receivable) or payment (payable) against a party. */
function PaymentModal({
  kind, target, onClose,
}: { kind: 'receivable' | 'payable'; target: { partyId: string; name: string; balance: number } | null; onClose: () => void }) {
  const store = useData();
  const cur = store.settings.currency;
  const isRec = kind === 'receivable';
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDateForPeriod(store.period));
  const [busy, setBusy] = useState(false);
  const amtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (target) {
      setAmount(String(Math.round(target.balance)));   // prefill full balance
      setDate(defaultDateForPeriod(store.period));
      setTimeout(() => amtRef.current?.select(), 60);
    }
  }, [target]);

  const amt = Number(amount) || 0;
  // target.balance is ABSOLUTE (from computeReceivables/computePayables); the
  // signed net is + on the receivable page, − on the payable page.
  const signedBalance = target ? (isRec ? target.balance : -target.balance) : 0;
  const preview = target && amt > 0
    ? previewCashEntry(signedBalance, isRec ? 'received' : 'paid', amt)
    : null;

  const submit = async () => {
    if (!target) return;
    if (amt <= 0) { toast.error('Enter a positive amount.'); return; }
    // Safeguard: over-settling flips the party to the opposite side (creates an
    // advance). Confirm first — never silent.
    if (preview?.createsAdvance && !window.confirm(preview.warning)) return;
    setBusy(true);
    try {
      // Settlement only — clears the party balance without touching cash again
      // (the cash was already counted when the receivable/payable was entered).
      // Receivable (+balance): receiving reduces it => -amt.
      // Payable (shown +, net -): paying reduces what we owe => +amt.
      const ok = await store.addPartyAdjustment({
        date,
        partyId: target.partyId,
        amount: isRec ? -Math.abs(amt) : Math.abs(amt),
        reason: isRec ? 'Received (settled)' : 'Paid (settled)',
        settlement: true,
      });
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!target}
      title={isRec ? `Receive from ${target?.name}` : `Pay ${target?.name}`}
      subtitle={isRec ? 'Cash received — reduces their receivable' : 'Cash paid — reduces your payable'}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isRec ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy}>
            <Icon name="save" size={16} /> {isRec ? 'Receive Cash' : 'Pay Cash'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Current balance</span>
          <strong className="mono">{formatMoney(target?.balance ?? 0, cur)}</strong>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{isRec ? 'Amount received' : 'Amount paid'}</label>
          <input ref={amtRef} type="number" min="0" inputMode="numeric" className="input" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        {preview && (
          <div className={cx('cash-preview', preview.createsAdvance && 'warn')}>
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
