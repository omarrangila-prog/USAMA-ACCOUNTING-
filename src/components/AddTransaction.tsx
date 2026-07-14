import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';
import { Combo } from './ui/Combo';
import { useData } from '@/store/dataStore';
import './addtransaction.css';

/**
 * Party-scoped "Add Transaction" chooser, used INSIDE the Ledger. Transactions
 * belong to a party, so the chooser knows the selected party (read-only) and
 * routes each type to the right existing form/modal — no accounting logic here.
 *
 * `kind` results:
 *   'received' | 'paid'                → open the Ledger cash modal
 *   'receivable' | 'payable'           → open the Ledger adjustment modal
 *   'purchase' | 'sale' | 'stock'      → navigate to that page's form
 */
export type TxnKind =
  | 'received' | 'paid' | 'receivable' | 'payable'
  | 'purchase' | 'sale' | 'stock';

interface Choice {
  id: TxnKind;
  emoji: string;
  label: string;
  desc: string;
}

// Normal trader workflow: a Sale to a party automatically becomes a receivable,
// a Purchase automatically becomes a payable — no separate cash step needed.
const PRIMARY: Choice[] = [
  { id: 'sale', emoji: '💰', label: 'Sale', desc: 'Sell bonds — party owes you (Receivable).' },
  { id: 'purchase', emoji: '🛒', label: 'Purchase', desc: 'Buy bonds — you owe the party (Payable).' },
  { id: 'receivable', emoji: '📈', label: 'Manual Receivable', desc: 'Money the party will pay you.' },
  { id: 'payable', emoji: '📉', label: 'Manual Payable', desc: 'Money you have to pay the party.' },
];

// Advanced / optional — only when the user actually wants to RECORD a payment
// or a non-party entry. Hidden behind a toggle so it doesn't clutter the flow.
const ADVANCED: Choice[] = [
  { id: 'received', emoji: '💵', label: 'Cash Received', desc: 'Record a payment received from this party.' },
  { id: 'paid', emoji: '💸', label: 'Cash Paid', desc: 'Record a payment made to this party.' },
  { id: 'stock', emoji: '📦', label: 'Stock Adjustment', desc: 'Opening, correction or damaged stock.' },
];

interface Props {
  open: boolean;
  /** Currently selected party in the Ledger (empty = none yet). */
  partyId: string;
  onClose: () => void;
  /** Fires for cash/adjustment types that open a Ledger modal. */
  onPick: (kind: TxnKind, partyId: string) => void;
}

export function AddTransactionModal({ open, partyId, onClose, onPick }: Props) {
  const store = useData();
  const [sel, setSel] = useState<TxnKind | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  // If the Ledger had no party selected, let the user pick one here.
  const [chosenParty, setChosenParty] = useState(partyId);
  const nav = useNavigate();

  const activeParty = partyId || chosenParty;
  const partyName = store.parties.find((p) => p.id === activeParty)?.name ?? '';
  const partyKnown = !!partyId;

  const reset = () => { setSel(null); setAdvOpen(false); setChosenParty(partyId); };

  const Tile = (c: Choice) => (
    <button
      key={c.id}
      type="button"
      className={`addtxn-tile${sel === c.id ? ' selected' : ''}`}
      onClick={() => setSel(c.id)}
      onDoubleClick={() => proceed(c.id)}
    >
      <span className="addtxn-emoji" aria-hidden>{c.emoji}</span>
      <span className="addtxn-text">
        <strong>{c.label}</strong>
        <span className="addtxn-hint">{c.desc}</span>
      </span>
      <span className="addtxn-radio" aria-hidden>{sel === c.id ? '●' : '○'}</span>
    </button>
  );

  const proceed = (kind?: TxnKind) => {
    const k = kind ?? sel;
    if (!k) return;
    // Page-form types just navigate; the party is carried where the form
    // supports it (?party=) so the user isn't asked again.
    const routes: Partial<Record<TxnKind, string>> = {
      purchase: `/purchase${activeParty ? `?party=${activeParty}` : ''}`,
      sale: `/sale${activeParty ? `?party=${activeParty}` : ''}`,
      stock: '/stock',
    };
    onClose();
    reset();
    if (routes[k]) { nav(routes[k]!); return; }
    onPick(k, activeParty); // cash / receivable / payable → Ledger modal
  };

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));

  return (
    <Modal
      open={open}
      title="Add Transaction"
      subtitle="Choose the transaction you want to record for this party."
      onClose={() => { onClose(); reset(); }}
      width={540}
      footer={
        <>
          <button className="btn" onClick={() => { onClose(); reset(); }}>Cancel</button>
          <button className="btn btn-primary" onClick={() => proceed()} disabled={!sel || !activeParty}>
            Continue <Icon name="chevron" size={16} />
          </button>
        </>
      }
    >
      {/* Party context — read-only when the Ledger already has one selected. */}
      <div className="addtxn-party">
        <span className="addtxn-party-label">Party</span>
        {partyKnown ? (
          <strong className="addtxn-party-name">{partyName || '—'}</strong>
        ) : (
          <div style={{ flex: 1, maxWidth: 280 }}>
            <Combo value={chosenParty} options={partyOptions} placeholder="Select a party" onChange={setChosenParty} />
          </div>
        )}
      </div>

      <div className="addtxn-grid">
        {PRIMARY.map((c) => Tile(c))}
      </div>

      {/* Cash Received / Paid live here — optional, only when the user actually
          wants to record a payment. Normal sale/purchase entries never need it. */}
      <button
        type="button"
        className="addtxn-advtoggle"
        onClick={() => setAdvOpen((v) => !v)}
        aria-expanded={advOpen}
      >
        <Icon name="chevron" size={14} className={advOpen ? 'rot' : ''} />
        {advOpen ? 'Hide advanced' : 'Record a payment / other (advanced)'}
      </button>
      {advOpen && (
        <div className="addtxn-grid" style={{ marginTop: 8 }}>
          {ADVANCED.map((c) => Tile(c))}
        </div>
      )}
    </Modal>
  );
}
