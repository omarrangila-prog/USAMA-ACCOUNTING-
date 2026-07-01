import { useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';
import { useData } from '@/store/dataStore';
import { parseSmartEntry } from '@/lib/smartEntry';
import { todayISO, formatMoney } from '@/lib/utils';
import { toast } from '@/store/toast';
import type { SmartIntent } from '@/types';
import './smartentry.css';

const EXAMPLES = [
  'Bought 100 bond 10 qty at 17500 from Ali cash',
  'Sold 100 bond 5 qty at 17800 to Khan credit',
  'Received 50000 from Ali',
  'Paid 30000 to Khan',
];

export function SmartEntry({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useData();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const intent = useMemo<SmartIntent | null>(
    () => (text.trim() ? parseSmartEntry(text, store.parties, store.bondTypes) : null),
    [text, store.parties, store.bondTypes]
  );

  const preview = intent ? describeIntent(intent) : null;

  const submit = async () => {
    if (!intent) {
      toast.error("Couldn't understand that. Try one of the examples.");
      return;
    }
    setBusy(true);
    try {
      const date = todayISO();
      if (intent.kind === 'cash') {
        if (!intent.partyName || !intent.amount) {
          toast.error('Need a party and amount for cash entry.');
          return;
        }
        const party = await store.ensureParty(intent.partyName);
        const ok = await store.addCash({
          date, partyId: party.id, direction: intent.direction!, amount: intent.amount,
        });
        if (ok) reset();
        return;
      }

      // purchase / sale
      if (!intent.partyName) { toast.error('Which party? Add "from/to <name>".'); return; }
      if (!intent.bondTypeName) { toast.error('Which bond? e.g. "100 bond".'); return; }
      if (!intent.quantity) { toast.error('How many? add "<n> qty".'); return; }
      if (!intent.rate) { toast.error('At what rate? add "at <rate>".'); return; }

      const party = await store.ensureParty(intent.partyName);
      const bond = await store.ensureBondType(intent.bondTypeName);

      const ok =
        intent.kind === 'purchase'
          ? await store.addPurchase({
              date, partyId: party.id, bondTypeId: bond.id,
              quantity: intent.quantity, rate: intent.rate, payment: intent.mode ?? 'cash',
            })
          : await store.addSale({
              date, partyId: party.id, bondTypeId: bond.id,
              quantity: intent.quantity, rate: intent.rate, receipt: intent.mode ?? 'cash',
            });
      if (ok) reset();
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setText(''); };

  return (
    <Modal
      open={open}
      title="Smart Entry"
      subtitle="Type a transaction in plain words — it becomes a real entry."
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-green" onClick={submit} disabled={busy || !intent}>
            <Icon name="check" size={16} /> Record Entry
          </button>
        </>
      }
    >
      <div className="smart-input-wrap">
        <Icon name="sparkles" size={18} className="smart-spark" />
        <input
          autoFocus
          className="input smart-input"
          placeholder="e.g. Sold 100 bond 5 qty at 17800 to Khan credit"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>

      {preview ? (
        <div className={`smart-preview animate-in ${intent!.confidence >= 0.7 ? 'good' : 'low'}`}>
          <div className="smart-preview-head">
            <span className={`badge ${badgeFor(intent!.kind)}`}>{intent!.kind.toUpperCase()}</span>
            <span className="faint" style={{ fontSize: 12 }}>
              {(intent!.confidence * 100).toFixed(0)}% match
            </span>
          </div>
          <div className="smart-preview-body">{preview}</div>
        </div>
      ) : (
        <div className="smart-examples">
          <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>Try:</div>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="smart-example" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function describeIntent(i: SmartIntent): string {
  if (i.kind === 'cash') {
    return `Cash ${i.direction} ${i.amount ? formatMoney(i.amount) : '—'} ${i.direction === 'received' ? 'from' : 'to'} ${i.partyName ?? '(party?)'}`;
  }
  const amount = i.quantity && i.rate ? formatMoney(i.quantity * i.rate) : '—';
  const verb = i.kind === 'purchase' ? 'Buy' : 'Sell';
  return `${verb} ${i.quantity ?? '?'} × Rs.${i.bondTypeName ?? '?'} bond @ ${i.rate ?? '?'} = ${amount} · ${i.mode ?? 'cash'} · ${i.kind === 'purchase' ? 'from' : 'to'} ${i.partyName ?? '(party?)'}`;
}

function badgeFor(kind: SmartIntent['kind']): string {
  return kind === 'purchase' ? 'badge-blue' : kind === 'sale' ? 'badge-green' : 'badge-orange';
}
