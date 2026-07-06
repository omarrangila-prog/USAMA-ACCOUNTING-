import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/Modal';
import { Icon, type IconName } from './ui/Icon';
import './addtransaction.css';

/**
 * Global "+ Add Transaction" entry point. One button opens a chooser; picking a
 * type routes to the right form. Cash + manual receivable/payable open a modal
 * on the Ledger via query params; the rest have inline forms on their own pages.
 */
interface Choice {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  accent: string;
  to: string;
}

const CHOICES: Choice[] = [
  { id: 'received', label: 'Cash Received', hint: 'Money received into cash', icon: 'arrow-down', accent: 'var(--green)', to: '/ledger?cash=received' },
  { id: 'paid', label: 'Cash Paid', hint: 'Money paid out of cash', icon: 'arrow-up', accent: 'var(--red)', to: '/ledger?cash=paid' },
  { id: 'receivable', label: 'Manual Receivable', hint: 'A party owes you (no cash yet)', icon: 'receivable', accent: 'var(--green)', to: '/ledger?add=receivable' },
  { id: 'payable', label: 'Manual Payable', hint: 'You owe a party (no cash yet)', icon: 'payable', accent: 'var(--red)', to: '/ledger?add=payable' },
  { id: 'purchase', label: 'Purchase', hint: 'Buy bonds', icon: 'purchase', accent: 'var(--blue)', to: '/purchase' },
  { id: 'sale', label: 'Sale', hint: 'Sell bonds', icon: 'sale', accent: 'var(--green)', to: '/sale' },
  { id: 'stock', label: 'Stock Adjustment', hint: 'Opening / correction / damage', icon: 'stock', accent: 'var(--purple)', to: '/stock' },
  { id: 'expense', label: 'Expense / Income', hint: 'Rent, salary, commission…', icon: 'wallet', accent: 'var(--orange)', to: '/expenses' },
];

export function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const nav = useNavigate();

  const go = () => {
    const choice = CHOICES.find((c) => c.id === sel);
    if (!choice) return;
    setOpen(false);
    setSel(null);
    nav(choice.to);
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Add Transaction
      </button>
      <Modal
        open={open}
        title="Add Transaction"
        subtitle="Choose what you want to record"
        onClose={() => { setOpen(false); setSel(null); }}
        width={520}
        footer={
          <>
            <button className="btn" onClick={() => { setOpen(false); setSel(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={go} disabled={!sel}>
              Continue <Icon name="chevron" size={16} />
            </button>
          </>
        }
      >
        <div className="addtxn-grid">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`addtxn-tile${sel === c.id ? ' selected' : ''}`}
              onClick={() => setSel(c.id)}
              onDoubleClick={go}
            >
              <span className="addtxn-icon" style={{ background: c.accent }}>
                <Icon name={c.icon} size={18} />
              </span>
              <span className="addtxn-text">
                <strong>{c.label}</strong>
                <span className="addtxn-hint">{c.hint}</span>
              </span>
              <span className="addtxn-radio" aria-hidden>{sel === c.id ? '●' : '○'}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
