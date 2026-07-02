import { useEffect, useState } from 'react';
import { useData } from '@/store/dataStore';
import { Modal } from '@/components/ui/Modal';
import { Combo } from '@/components/ui/Combo';
import { Icon } from '@/components/ui/Icon';
import { availableStock } from '@/lib/accounting';
import { formatMoney, formatNumber, defaultDateForPeriod, cx } from '@/lib/utils';

type Mode = 'add' | 'remove';
const REASONS_ADD = ['Opening stock', 'Found extra (count)', 'Correction'];
const REASONS_REMOVE = ['Damaged / lost', 'Short (count)', 'Correction'];

/**
 * Manually set opening stock or make a +/- adjustment for a bond, without a
 * purchase/sale. Feeds stock quantity, weighted-average cost and value.
 */
export function AdjustStock({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useData();
  const cur = store.settings.currency;

  const [mode, setMode] = useState<Mode>('add');
  const [date, setDate] = useState(() => defaultDateForPeriod(store.period));
  const [bondTypeId, setBondTypeId] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('Opening stock');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDateForPeriod(store.period));
      setMode('add'); setBondTypeId(''); setQty(''); setCost(''); setReason('Opening stock');
    }
  }, [open]);

  const bondOptions = store.bondTypes.map((b) => ({ id: b.id, label: `Rs. ${b.name}`, sub: `face ${b.faceValue}` }));
  const available = bondTypeId ? availableStock(store.dataset(), bondTypeId, store.period) : 0;

  const n = Number(qty) || 0;
  const c = Number(cost) || 0;
  const value = n * (mode === 'add' ? c : 0);

  const submit = async () => {
    setBusy(true);
    try {
      const ok = await store.addStockAdjustment({
        date, bondTypeId,
        quantity: mode === 'add' ? Math.abs(n) : -Math.abs(n),
        unitCost: c,
        reason,
      });
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title="Adjust Stock"
      subtitle="Set opening stock or correct the count — no purchase/sale created"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={mode === 'add' ? 'btn btn-green' : 'btn btn-danger'} onClick={submit} disabled={busy || !bondTypeId || n <= 0}>
            <Icon name="save" size={16} /> {mode === 'add' ? 'Add Stock' : 'Remove Stock'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Type of adjustment</label>
          <div className="segment">
            <button type="button" className={mode === 'add' ? 'active' : ''} onClick={() => { setMode('add'); setReason('Opening stock'); }}>Add (+)</button>
            <button type="button" className={mode === 'remove' ? 'active' : ''} onClick={() => { setMode('remove'); setReason('Damaged / lost'); }}>Remove (−)</button>
          </div>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Bond Type</label>
          <Combo value={bondTypeId} options={bondOptions} placeholder="Select or create bond" allowCreate
            onChange={setBondTypeId}
            onCreate={async (name) => (await store.ensureBondType(name)).id} />
          {bondTypeId && (
            <span className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
              Currently in stock: {formatNumber(available)} bonds
            </span>
          )}
        </div>
        <div className="form-row2">
          <div className="field">
            <label>Quantity</label>
            <input type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={qty}
              onChange={(e) => setQty(e.target.value)} />
          </div>
          {mode === 'add' && (
            <div className="field">
              <label>Cost per bond</label>
              <input type="number" min="0" inputMode="numeric" className="input" placeholder="0" value={cost}
                onChange={(e) => setCost(e.target.value)} />
            </div>
          )}
        </div>
        <div className="field">
          <label>Reason</label>
          <input className="input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="chip-row" style={{ marginTop: 6 }}>
            {(mode === 'add' ? REASONS_ADD : REASONS_REMOVE).map((r) => (
              <button key={r} type="button" className="chip" onClick={() => setReason(r)}>{r}</button>
            ))}
          </div>
        </div>
        {mode === 'add' && (
          <div className="amount-preview green">
            <span className="amt-label">Stock value added</span>
            <span className="amt-value mono">{formatMoney(value, cur)}</span>
          </div>
        )}
        {mode === 'remove' && bondTypeId && n > available && (
          <div className="warn-box"><Icon name="warning" size={14} /> Only {formatNumber(available)} in stock — can't remove {formatNumber(n)}.</div>
        )}
      </div>
    </Modal>
  );
}
