import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/store/dataStore';
import { Combo, type ComboHandle } from '@/components/ui/Combo';
import { Icon } from '@/components/ui/Icon';
import { availableStock } from '@/lib/accounting';
import { formatMoney, formatNumber, periodOf, cx, defaultDateForPeriod } from '@/lib/utils';
import type { PaymentMode } from '@/types';

interface Props {
  kind: 'purchase' | 'sale';
}

/**
 * Inline entry form for purchases & sales.
 *
 * Fully keyboard-driven: pressing Enter advances Party → Bond → Qty → Rate →
 * Cash/Credit → Save. After saving it keeps the party & date and clears the
 * qty/rate, refocusing quantity for fast repeat entry.
 *
 * New entries default their date to the month currently selected in the top bar
 * (not today), so working "inside a month" needs no date changes.
 */
export function TransactionForm({ kind }: Props) {
  const store = useData();
  const isSale = kind === 'sale';
  const period = store.period;

  const [date, setDate] = useState(() => defaultDateForPeriod(period));
  const [partyId, setPartyId] = useState('');
  const [bondTypeId, setBondTypeId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Field refs for Enter-to-advance.
  const partyRef = useRef<ComboHandle>(null);
  const bondRef = useRef<ComboHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  const cur = store.settings.currency;
  const qty = Number(quantity) || 0;
  const rt = Number(rate) || 0;
  const amount = qty * rt;

  // The entry belongs to the date's period; keep date synced when the top-bar
  // month changes and the user hasn't manually overridden it this session.
  const entryPeriod = periodOf(date);
  const monthLocked = store.isMonthLocked(entryPeriod);

  // When the selected top-bar period changes, move the default date with it.
  useEffect(() => {
    setDate(defaultDateForPeriod(period));
  }, [period.month, period.year]);

  const stock = useMemo(
    () => (bondTypeId ? availableStock(store.dataset(), bondTypeId, entryPeriod) : 0),
    [bondTypeId, store, date]
  );
  const oversell = isSale && qty > stock;

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));
  const bondOptions = store.bondTypes.map((b) => ({ id: b.id, label: `Rs. ${b.name}`, sub: `face ${b.faceValue}` }));

  const valid = partyId && bondTypeId && qty > 0 && rt > 0 && !oversell && !monthLocked;

  // Focus the first field on mount for immediate keyboard entry.
  useEffect(() => { partyRef.current?.focus(); }, [kind]);

  const submit = async () => {
    setTouched(true);
    if (!valid) {
      // Guide the user to the first missing field.
      if (!partyId) partyRef.current?.focus();
      else if (!bondTypeId) bondRef.current?.focus();
      else if (qty <= 0) qtyRef.current?.focus();
      else if (rt <= 0) rateRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const ok = isSale
        ? await store.addSale({ date, partyId, bondTypeId, quantity: qty, rate: rt, receipt: mode })
        : await store.addPurchase({ date, partyId, bondTypeId, quantity: qty, rate: rt, payment: mode });
      if (ok) {
        // Keep party + date, clear qty/rate, refocus quantity for the next bond.
        setQuantity('');
        setRate('');
        setTouched(false);
        setTimeout(() => qtyRef.current?.focus(), 20);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Ctrl/Cmd+S also saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const enterAdvance = (next?: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (next) next();
      else submit();
    }
  };

  return (
    <div className="card entry-form">
      <div className="section-title">
        <Icon name={isSale ? 'sale' : 'purchase'} size={16} />
        New {isSale ? 'Sale' : 'Purchase'}
        <span className="spacer" />
        <span className="faint kbd-hint">Press Enter to move · ⌘S to save</span>
      </div>

      {monthLocked && (
        <div className="locked-banner">
          <Icon name="lock" size={16} /> This month is closed. Switch to an open month to add entries.
        </div>
      )}

      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label>Party <span className="faint">(1)</span></label>
          <Combo
            ref={partyRef}
            value={partyId}
            options={partyOptions}
            placeholder="Type name or create"
            allowCreate
            invalid={touched && !partyId}
            onChange={setPartyId}
            onCreate={async (name) => (await store.addParty({ name, openingBalance: 0 })).id}
            onDone={() => bondRef.current?.open()}
          />
        </div>

        <div className="field">
          <label>Bond Type <span className="faint">(2)</span></label>
          <Combo
            ref={bondRef}
            value={bondTypeId}
            options={bondOptions}
            placeholder="Type denomination or create"
            allowCreate
            invalid={touched && !bondTypeId}
            onChange={setBondTypeId}
            onCreate={async (name) => (await store.ensureBondType(name)).id}
            onDone={() => qtyRef.current?.focus()}
          />
        </div>

        <div className="form-row2">
          <div className="field">
            <label>Quantity <span className="faint">(3)</span></label>
            <input
              ref={qtyRef}
              type="number" min="0" inputMode="numeric"
              className={cx('input', touched && qty <= 0 && 'invalid')}
              placeholder="0" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={enterAdvance(() => rateRef.current?.focus())}
            />
          </div>
          <div className="field">
            <label>Rate <span className="faint">(4)</span></label>
            <input
              ref={rateRef}
              type="number" min="0" inputMode="numeric"
              className={cx('input', touched && rt <= 0 && 'invalid')}
              placeholder="0" value={rate}
              onChange={(e) => setRate(e.target.value)}
              onKeyDown={enterAdvance(() => modeRef.current?.focus())}
            />
          </div>
        </div>

        {isSale && bondTypeId && (
          <div className={cx('stock-hint', oversell ? 'warn' : 'ok')}>
            <Icon name={oversell ? 'warning' : 'check'} size={14} />
            {oversell
              ? `Only ${formatNumber(stock)} in stock — can't sell ${formatNumber(qty)}.`
              : `Available stock: ${formatNumber(stock)} bonds.`}
          </div>
        )}

        <div className="field">
          <label>{isSale ? 'Receipt' : 'Payment'} <span className="faint">(5 · ←/→ or Enter)</span></label>
          <div className="segment">
            <button
              ref={modeRef}
              type="button"
              className={mode === 'cash' ? 'active' : ''}
              onClick={() => setMode('cash')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setMode('credit');
                else if (e.key === 'ArrowLeft') setMode('cash');
                else if (e.key === 'Enter') { e.preventDefault(); saveRef.current?.focus(); saveRef.current?.click(); }
              }}
            >Cash</button>
            <button
              type="button"
              className={mode === 'credit' ? 'active' : ''}
              onClick={() => setMode('credit')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setMode('credit');
                else if (e.key === 'ArrowLeft') setMode('cash');
                else if (e.key === 'Enter') { e.preventDefault(); submit(); }
              }}
            >Credit</button>
          </div>
        </div>

        <div className={cx('amount-preview', isSale && 'green')}>
          <span className="amt-label">Amount</span>
          <span className="amt-value mono">{formatMoney(amount, cur)}</span>
        </div>

        <button
          ref={saveRef}
          className={isSale ? 'btn btn-green' : 'btn btn-primary'}
          onClick={submit}
          disabled={submitting || monthLocked}
        >
          <Icon name="save" size={16} /> Save {isSale ? 'Sale' : 'Purchase'}
          <span className="faint" style={{ fontSize: 11, opacity: 0.7 }}>⌘S</span>
        </button>
      </div>
    </div>
  );
}
