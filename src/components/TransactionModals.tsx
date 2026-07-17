import { useEffect, useRef, useState } from 'react';
import { useData } from '@/store/dataStore';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { Combo, type ComboHandle } from '@/components/ui/Combo';
import { TransactionForm } from '@/pages/TransactionForm';
import { defaultDateForPeriod } from '@/lib/utils';
import { toast } from '@/store/toast';
import type { CashDirection } from '@/types';

/**
 * Shared transaction-entry modals used by the Cash Book (the central screen).
 * These wrap the EXISTING write logic (store.addCash / addPartyAdjustment /
 * addPurchase / addSale) — no accounting changes. Extracted from the old Ledger
 * page so entry works without a dedicated page.
 */

/** Purchase / Sale entry in a modal (wraps the existing TransactionForm). */
export function TradeModal({
  kind, defaultParty = '', onClose,
}: { kind: 'purchase' | 'sale' | null; defaultParty?: string; onClose: () => void }) {
  return (
    <Modal
      open={!!kind}
      title={kind === 'sale' ? 'New Sale' : 'New Purchase'}
      subtitle={kind === 'sale' ? 'Sell bonds to a party or for cash' : 'Buy bonds from a party or for cash'}
      onClose={onClose}
      width={480}
    >
      {kind && <TransactionForm key={kind} kind={kind} embedded defaultParty={defaultParty} onSaved={onClose} />}
    </Modal>
  );
}

/** Cash Received / Paid entry (adds to / reduces Cash in Hand). */
export function CashModal({
  direction, defaultParty = '', editId, onClose,
}: { direction: CashDirection | null; defaultParty?: string; editId?: string | null; onClose: () => void }) {
  const store = useData();
  const [partyId, setPartyId] = useState(defaultParty);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(defaultDateForPeriod(store.period));
  const [busy, setBusy] = useState(false);
  const partyRef = useRef<ComboHandle>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!direction) return;
    if (editId) {
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

  const submit = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error('Enter a positive amount.'); amountRef.current?.focus(); return; }
    setBusy(true);
    try {
      const input = { date, partyId, direction: direction!, amount: amt, note: note || undefined };
      const ok = editId ? await store.updateCash(editId, input) : await store.addCash(input);
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  // Ctrl/Cmd+S saves the modal from any field (keyboard-first workflow).
  useEffect(() => {
    if (!direction) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      </div>
    </Modal>
  );
}

/** Manual Receivable (+) / Payable (−) entry — reuses addPartyAdjustment. */
export function AdjustmentModal({
  kind, defaultParty = '', editId, onClose,
}: { kind: 'receivable' | 'payable' | null; defaultParty?: string; editId?: string | null; onClose: () => void }) {
  const store = useData();
  const isRec = kind === 'receivable';
  const isEdit = !!editId;
  const [partyId, setPartyId] = useState(defaultParty);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(defaultDateForPeriod(store.period));
  const [busy, setBusy] = useState(false);
  const partyRef = useRef<ComboHandle>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!kind) return;
    if (editId) {
      const rec = (store.partyAdjustments ?? []).find((a) => a.id === editId);
      if (rec) {
        setPartyId(rec.partyId);
        setAmount(String(Math.abs(rec.amount)));
        setReason(rec.reason ?? '');
        setDate(rec.date);
      }
    } else {
      setPartyId(defaultParty); setAmount(''); setReason('');
      setDate(defaultDateForPeriod(store.period));
    }
    setTimeout(() => (partyId || defaultParty ? amtRef.current?.focus() : partyRef.current?.focus()), 40);
  }, [kind, defaultParty, editId]);

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));
  const amt = Number(amount) || 0;

  const submit = async () => {
    if (!partyId) { toast.error('Select a party.'); partyRef.current?.focus(); return; }
    if (amt <= 0) { toast.error('Enter a positive amount.'); amtRef.current?.focus(); return; }
    setBusy(true);
    try {
      const input = {
        date, partyId,
        amount: isRec ? Math.abs(amt) : -Math.abs(amt),
        reason: reason.trim() || (isRec ? 'Manual Receivable' : 'Manual Payable'),
      };
      const ok = editId
        ? await store.updatePartyAdjustment(editId, input)
        : await store.addPartyAdjustment(input);
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  // Ctrl/Cmd+S saves from any field.
  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal
      open={!!kind}
      title={`${isEdit ? 'Edit ' : 'Add '}${isRec ? 'Receivable' : 'Payable'}`}
      subtitle={isRec ? 'Record that a party owes you (no cash / bond involved)' : 'Record that you owe a party (no cash / bond involved)'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isRec ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy}>
            <Icon name="save" size={16} /> {isEdit ? 'Save Changes' : (isRec ? 'Add Receivable' : 'Add Payable')}
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
