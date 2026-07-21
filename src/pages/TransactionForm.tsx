import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { Combo, type ComboHandle } from '@/components/ui/Combo';
import { Icon } from '@/components/ui/Icon';
import { formatMoney, periodOf, cx, defaultDateForPeriod } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { PaymentMode } from '@/types';

interface Props {
  kind: 'purchase' | 'sale';
  /** Render without the outer card chrome (used inside a modal). */
  embedded?: boolean;
  /** Fired after a successful save (e.g. to close a wrapping modal). */
  onSaved?: () => void;
  /** Pre-selected party (overrides the ?party= URL param when provided). */
  defaultParty?: string;
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
export function TransactionForm({ kind, embedded = false, onSaved, defaultParty }: Props) {
  const store = useData();
  const t = useT();
  const isSale = kind === 'sale';
  const period = store.period;

  // ?party= deep-link (from the Ledger "Add Transaction" chooser) pre-selects
  // the party so the user isn't asked to pick it again.
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(() => defaultDateForPeriod(period));
  const [partyId, setPartyId] = useState(defaultParty ?? params.get('party') ?? '');
  const [bondTypeId, setBondTypeId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Field refs for Enter-to-advance.
  const partyRef = useRef<ComboHandle>(null);
  const bondRef = useRef<ComboHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
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

  const partyOptions = store.parties.map((p) => ({ id: p.id, label: p.name, sub: p.phone }));
  const bondOptions = store.bondTypes.map((b) => ({ id: b.id, label: `Rs. ${b.name}`, sub: `face ${b.faceValue}` }));

  // Unlimited stock — never block a sale for insufficient stock. Party is
  // optional; only bond, qty and rate are required.
  const valid = bondTypeId && qty > 0 && rt > 0 && !monthLocked;

  // Focus the first field on mount for immediate keyboard entry.
  useEffect(() => { partyRef.current?.focus(); }, [kind]);

  // F1/F2 deep-link "?new=1": when the shortcut lands on an already-open Sale/
  // Purchase page (no remount), re-focus Party and clear the param so repeat
  // presses keep working.
  useEffect(() => {
    if (params.get('new') === '1') {
      setTimeout(() => partyRef.current?.focus(), 20);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params]);

  const submit = async () => {
    setTouched(true);
    if (!valid) {
      // Guide the user to the first missing field.
      if (!bondTypeId) bondRef.current?.focus();
      else if (qty <= 0) qtyRef.current?.focus();
      else if (rt <= 0) rateRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const ok = isSale
        ? await store.addSale({ date, partyId, bondTypeId, quantity: qty, rate: rt, receipt: 'cash', note: note || undefined })
        : await store.addPurchase({ date, partyId, bondTypeId, quantity: qty, rate: rt, payment: 'cash', note: note || undefined });
      if (ok) {
        // Reset the entry after a successful save: clear bond, qty, rate, mode
        // and note; keep only the party + date. Refocus the Bond field.
        setBondTypeId('');
        setQuantity('');
        setRate('');
        setNote('');
        setTouched(false);
        setTimeout(() => bondRef.current?.focus(), 20);
        onSaved?.();
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

  // Enter → next field (or submit on the last). Shift+Enter → previous field.
  const enterAdvance = (next?: () => void, prev?: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.shiftKey) { prev?.(); return; }
    if (next) next(); else submit();
  };

  return (
    <div className={cx(!embedded && 'card', 'entry-form')}>
      {!embedded && (
        <div className="section-title">
          <Icon name={isSale ? 'sale' : 'purchase'} size={16} />
          {isSale ? t('b.newSale') : t('b.newPurchase')}
          <span className="spacer" />
          <span className="faint kbd-hint">Enter · ⌘S</span>
        </div>
      )}

      <div className="form-grid">
        <div className="field">
          <label>{t('f.date')}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label>{t('f.party')} <span className="faint">(1 · {t('f.optional')})</span></label>
          <Combo
            ref={partyRef}
            value={partyId}
            options={partyOptions}
            placeholder="Optional — leave blank for cash"
            allowCreate
            onChange={setPartyId}
            onCreate={async (name) => (await store.addParty({ name, openingBalance: 0 })).id}
            onDone={() => bondRef.current?.open()}
          />
        </div>

        <div className="field">
          <label>{t('f.bond')} <span className="faint">(2)</span></label>
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
            <label>{t('f.quantity')} <span className="faint">(3)</span></label>
            <input
              ref={qtyRef}
              type="number" min="0" inputMode="numeric"
              className={cx('input', touched && qty <= 0 && 'invalid')}
              placeholder="0" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={enterAdvance(() => rateRef.current?.focus(), () => bondRef.current?.focus())}
            />
          </div>
          <div className="field">
            <label>{t('f.rate')} <span className="faint">(4)</span></label>
            <input
              ref={rateRef}
              type="number" min="0" inputMode="numeric"
              className={cx('input', touched && rt <= 0 && 'invalid')}
              placeholder="0" value={rate}
              onChange={(e) => setRate(e.target.value)}
              onKeyDown={enterAdvance(() => noteRef.current?.focus(), () => qtyRef.current?.focus())}
            />
          </div>
        </div>

        <div className="field">
          <label>{t('f.note')} <span className="faint">({t('f.optional')})</span></label>
          <input ref={noteRef} className="input" placeholder="Description / details" value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={enterAdvance(undefined, () => rateRef.current?.focus())} />
        </div>

        <div className={cx('amount-preview', isSale && 'green')}>
          <span className="amt-label">{t('f.amount')}</span>
          <span className="amt-value mono">{formatMoney(amount, cur)}</span>
        </div>

        <button
          ref={saveRef}
          className={isSale ? 'btn btn-green' : 'btn btn-primary'}
          onClick={submit}
          disabled={submitting || monthLocked}
        >
          <Icon name="save" size={16} /> {isSale ? t('b.addSale') : t('b.addPurchase')}
        </button>
      </div>
    </div>
  );
}
