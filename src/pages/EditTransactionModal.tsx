import { useEffect, useState } from 'react';
import { useData } from '@/store/dataStore';
import { Modal } from '@/components/ui/Modal';
import { Combo } from '@/components/ui/Combo';
import { Icon } from '@/components/ui/Icon';
import { formatMoney, cx } from '@/lib/utils';
import type { Purchase, Sale, PaymentMode } from '@/types';

/** Edit an existing Purchase or Sale (every field editable). */
export function EditTransactionModal({
  kind, record, onClose,
}: {
  kind: 'purchase' | 'sale';
  record: Purchase | Sale | null;
  onClose: () => void;
}) {
  const store = useData();
  const isSale = kind === 'sale';
  const cur = store.settings.currency;

  const [date, setDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [bondTypeId, setBondTypeId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!record) return;
    setDate(record.date);
    setPartyId(record.partyId);
    setBondTypeId(record.bondTypeId);
    setQuantity(String(record.quantity));
    setRate(String(record.rate));
    setMode(isSale ? (record as Sale).receipt : (record as Purchase).payment);
  }, [record, isSale]);

  const qty = Number(quantity) || 0;
  const rt = Number(rate) || 0;
  const amount = qty * rt;

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));
  const bondOptions = store.bondTypes.map((b) => ({ id: b.id, label: `Rs. ${b.name}`, sub: `face ${b.faceValue}` }));

  const save = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const ok = isSale
        ? await store.updateSale(record.id, { date, partyId, bondTypeId, quantity: qty, rate: rt, receipt: mode })
        : await store.updatePurchase(record.id, { date, partyId, bondTypeId, quantity: qty, rate: rt, payment: mode });
      if (ok) onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!record}
      title={`Edit ${isSale ? 'Sale' : 'Purchase'}`}
      subtitle="Change any field and save"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={isSale ? 'btn btn-green' : 'btn btn-primary'} onClick={save} disabled={busy}>
            <Icon name="save" size={16} /> Save Changes
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
          <Combo value={partyId} options={partyOptions} placeholder="Party" allowCreate onChange={setPartyId}
            onCreate={async (name) => (await store.addParty({ name, openingBalance: 0 })).id} />
        </div>
        <div className="field">
          <label>Bond Type</label>
          <Combo value={bondTypeId} options={bondOptions} placeholder="Bond" allowCreate onChange={setBondTypeId}
            onCreate={async (name) => (await store.ensureBondType(name)).id} />
        </div>
        <div className="form-row2">
          <div className="field">
            <label>Quantity</label>
            <input type="number" min="0" inputMode="numeric" className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field">
            <label>Rate</label>
            <input type="number" min="0" inputMode="numeric" className="input" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>{isSale ? 'Receipt' : 'Payment'}</label>
          <div className="segment">
            <button type="button" className={mode === 'cash' ? 'active' : ''} onClick={() => setMode('cash')}>Cash</button>
            <button type="button" className={mode === 'credit' ? 'active' : ''} onClick={() => setMode('credit')}>Credit</button>
          </div>
        </div>
        <div className={cx('amount-preview', isSale && 'green')}>
          <span className="amt-label">Amount</span>
          <span className="amt-value mono">{formatMoney(amount, cur)}</span>
        </div>
      </div>
    </Modal>
  );
}
