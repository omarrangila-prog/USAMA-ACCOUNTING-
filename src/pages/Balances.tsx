import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { computeReceivables, computePayables } from '@/lib/accounting';
import { exportReportPdf } from '@/lib/reportBuilder';
import { formatMoney, defaultDateForPeriod } from '@/lib/utils';
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

  const rows = useMemo(
    () => (isRec ? computeReceivables(data, period) : computePayables(data, period)),
    [data, period, isRec]
  );
  const total = rows.reduce((a, r) => a + r.balance, 0);

  return (
    <div>
      <PageHeader
        title={isRec ? t('p.receivableTitle') : t('p.payableTitle')}
        subtitle={isRec ? 'Parties who owe you money — record a receipt here' : 'Parties you owe money to — record a payment here'}
        actions={
          <button className="btn" onClick={() => { exportReportPdf(data, settings, period, kind); toast.success('PDF exported'); }}>
            <Icon name="pdf" size={16} /> Export PDF
          </button>
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
                        <button className="btn btn-ghost btn-sm" onClick={() => nav(`/ledger?party=${r.partyId}`)}>
                          <Icon name="ledger" size={14} /> Ledger
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

      <PaymentModal
        kind={kind}
        target={payFor}
        onClose={() => setPayFor(null)}
      />
    </div>
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
  const remaining = target ? target.balance - amt : 0;

  const submit = async () => {
    if (!target) return;
    if (amt <= 0) { toast.error('Enter a positive amount.'); return; }
    setBusy(true);
    try {
      const ok = await store.addCash({
        date,
        partyId: target.partyId,
        direction: isRec ? 'received' : 'paid',
        amount: amt,
        note: isRec ? 'Cash received' : 'Cash paid',
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
          <span className="faint" style={{ fontSize: 11.5 }}>
            After this: {formatMoney(Math.max(remaining, 0), cur)} {remaining > 0.5 ? 'still ' + (isRec ? 'receivable' : 'payable') : 'settled'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
