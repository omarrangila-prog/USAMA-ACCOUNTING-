import { useState } from 'react';
import { useData } from '@/store/dataStore';
import { Icon } from '@/components/ui/Icon';
import { formatMoney } from '@/lib/utils';
import { toast } from '@/store/toast';
import './openingwizard.css';

type NameAmt = { name: string; amount: string };
type StockRow = { bondTypeName: string; qty: string; value: string };
type BankRow = { name: string; balance: string };

const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0;

/**
 * Opening Balance Import Wizard. Captures today's business position (cash,
 * stock, receivables, payables, banks) and saves it as ONE opening snapshot —
 * no fake historical transactions. Profit starts from the migration date.
 */
export function OpeningWizard() {
  const store = useData();
  const cur = store.settings.currency;
  const alreadyImported = !!store.opening;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const today = new Date();
  const [asOf] = useState({ month: today.getMonth() + 1, year: today.getFullYear() });

  const [cash, setCash] = useState('');
  const [stock, setStock] = useState<StockRow[]>([{ bondTypeName: '', qty: '', value: '' }]);
  const [recv, setRecv] = useState<NameAmt[]>([{ name: '', amount: '' }]);
  const [pay, setPay] = useState<NameAmt[]>([{ name: '', amount: '' }]);
  const [banks, setBanks] = useState<BankRow[]>([{ name: '', balance: '' }]);

  const totCash = num(cash);
  const totStock = stock.reduce((a, s) => a + num(s.value), 0);
  const totRecv = recv.reduce((a, r) => a + num(r.amount), 0);
  const totPay = pay.reduce((a, p) => a + num(p.amount), 0);
  const totBank = banks.reduce((a, b) => a + num(b.balance), 0);

  const reset = () => {
    setStep(1); setCash('');
    setStock([{ bondTypeName: '', qty: '', value: '' }]);
    setRecv([{ name: '', amount: '' }]); setPay([{ name: '', amount: '' }]);
    setBanks([{ name: '', balance: '' }]);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const ok = await store.saveOpeningWizard({
        asOf, openingCash: totCash,
        stock: stock.filter((s) => s.bondTypeName.trim()).map((s) => ({ bondTypeName: s.bondTypeName, qty: num(s.qty), value: num(s.value) })),
        receivables: recv.filter((r) => r.name.trim()).map((r) => ({ name: r.name, amount: num(r.amount) })),
        payables: pay.filter((p) => p.name.trim()).map((p) => ({ name: p.name, amount: num(p.amount) })),
        banks: banks.filter((b) => b.name.trim()).map((b) => ({ name: b.name, balance: num(b.balance) })),
      });
      if (ok) { setOpen(false); reset(); }
    } finally { setBusy(false); }
  };

  // Generic add/remove/update for row lists.
  const rowList = <T,>(rows: T[], set: (r: T[]) => void, blank: T) => ({
    add: () => set([...rows, blank]),
    del: (i: number) => set(rows.length > 1 ? rows.filter((_, x) => x !== i) : rows),
    upd: (i: number, patch: Partial<T>) => set(rows.map((r, x) => (x === i ? { ...r, ...patch } : r))),
  });

  if (!open) {
    return (
      <div className="card">
        <div className="section-title"><Icon name="reports" size={16} /> Opening Balance Import</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Migrating a running business? Import today's position (cash, stock,
          receivables, payables, banks) once — no need to re-enter old history.
          Profit starts from today.
        </div>
        {alreadyImported ? (
          <div className="faint" style={{ fontSize: 13 }}>
            <Icon name="check" size={14} /> Opening balances already imported. Reset data to re-import.
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={16} /> Start Import Wizard
          </button>
        )}
      </div>
    );
  }

  const steps = ['Cash', 'Stock', 'Receivables', 'Payables', 'Banks', 'Expenses', 'Review'];

  return (
    <div className="card ow">
      <div className="section-title">
        <Icon name="reports" size={16} /> Opening Balance Wizard
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); reset(); }}>Close</button>
      </div>

      <div className="ow-steps">
        {steps.map((s, i) => (
          <div key={s} className={`ow-step${step === i + 1 ? ' active' : ''}${step > i + 1 ? ' done' : ''}`}>
            <span className="ow-step-n">{step > i + 1 ? '✓' : i + 1}</span>{s}
          </div>
        ))}
      </div>

      <div className="ow-body">
        {step === 1 && (
          <div className="ow-pane">
            <h4>Opening Cash in Hand</h4>
            <p className="muted">How much physical cash do you have today?</p>
            <input className="input" inputMode="numeric" placeholder="0" value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
        )}

        {step === 2 && (
          <div className="ow-pane">
            <h4>Opening Stock</h4>
            <p className="muted">Bond, current quantity and total value.</p>
            {stock.map((s, i) => {
              const rl = rowList(stock, setStock, { bondTypeName: '', qty: '', value: '' });
              return (
                <div className="ow-row" key={i}>
                  <input className="input" placeholder="Bond (e.g. 100)" value={s.bondTypeName} onChange={(e) => rl.upd(i, { bondTypeName: e.target.value })} />
                  <input className="input" inputMode="numeric" placeholder="Qty" value={s.qty} onChange={(e) => rl.upd(i, { qty: e.target.value })} />
                  <input className="input" inputMode="numeric" placeholder="Value" value={s.value} onChange={(e) => rl.upd(i, { value: e.target.value })} />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => rl.del(i)}><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
            <button className="btn btn-sm" onClick={() => setStock([...stock, { bondTypeName: '', qty: '', value: '' }])}><Icon name="plus" size={14} /> Add bond</button>
          </div>
        )}

        {step === 3 && (
          <PartyStep title="Receivables" hint="Customers who owe you money." rows={recv} setRows={setRecv} />
        )}
        {step === 4 && (
          <PartyStep title="Payables" hint="Suppliers you owe money to." rows={pay} setRows={setPay} />
        )}

        {step === 5 && (
          <div className="ow-pane">
            <h4>Bank Balances</h4>
            <p className="muted">Bank / file accounts and their balances.</p>
            {banks.map((b, i) => {
              const rl = rowList(banks, setBanks, { name: '', balance: '' });
              return (
                <div className="ow-row" key={i}>
                  <input className="input" placeholder="Bank / account name" value={b.name} onChange={(e) => rl.upd(i, { name: e.target.value })} />
                  <input className="input" inputMode="numeric" placeholder="Balance" value={b.balance} onChange={(e) => rl.upd(i, { balance: e.target.value })} />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => rl.del(i)}><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
            <button className="btn btn-sm" onClick={() => setBanks([...banks, { name: '', balance: '' }])}><Icon name="plus" size={14} /> Add bank</button>
          </div>
        )}

        {step === 6 && (
          <div className="ow-pane">
            <h4>Opening Expenses <span className="faint">(optional)</span></h4>
            <p className="muted">
              Unpaid opening expenses can be recorded as normal expense entries
              after import. This step is optional — click Next to skip.
            </p>
          </div>
        )}

        {step === 7 && (
          <div className="ow-pane">
            <h4>Review — Opening Position</h4>
            <div className="ow-review">
              <Row label="Cash in Hand" value={formatMoney(totCash, cur)} />
              <Row label="Stock Value" value={formatMoney(totStock, cur)} />
              <Row label="Receivable (to receive)" value={formatMoney(totRecv, cur)} pos />
              <Row label="Payable (to pay)" value={formatMoney(totPay, cur)} neg />
              <Row label="Bank Balances" value={formatMoney(totBank, cur)} />
            </div>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
              These are saved as opening balances (one snapshot). No historical
              transactions are created. Profit &amp; loss starts from today.
            </p>
          </div>
        )}
      </div>

      <div className="ow-nav">
        <button className="btn" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>Back</button>
        <span className="spacer" />
        {step < 7 ? (
          <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Next <Icon name="chevron" size={15} /></button>
        ) : (
          <button className="btn btn-primary" onClick={finish} disabled={busy}>
            <Icon name="check" size={16} /> {busy ? 'Saving…' : 'Finish & Save Opening Balances'}
          </button>
        )}
      </div>
    </div>
  );
}

function PartyStep({ title, hint, rows, setRows }: { title: string; hint: string; rows: NameAmt[]; setRows: (r: NameAmt[]) => void }) {
  const upd = (i: number, patch: Partial<NameAmt>) => setRows(rows.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const del = (i: number) => setRows(rows.length > 1 ? rows.filter((_, x) => x !== i) : rows);
  return (
    <div className="ow-pane">
      <h4>{title}</h4>
      <p className="muted">{hint}</p>
      {rows.map((r, i) => (
        <div className="ow-row" key={i}>
          <input className="input" placeholder="Party name" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Outstanding amount" value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => del(i)}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => setRows([...rows, { name: '', amount: '' }])}><Icon name="plus" size={14} /> Add party</button>
    </div>
  );
}

function Row({ label, value, pos, neg }: { label: string; value: string; pos?: boolean; neg?: boolean }) {
  return (
    <div className="ow-review-row">
      <span className="muted">{label}</span>
      <strong className={`mono${pos ? ' pos' : neg ? ' neg' : ''}`}>{value}</strong>
    </div>
  );
}
