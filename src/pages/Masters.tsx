import { useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { computePartyBalances, computeStock, partyTradeTotals, type DataSet } from '@/lib/accounting';
import { formatMoney, cx, normalizeDenomination } from '@/lib/utils';
import { toast } from '@/store/toast';
import './masters.css';

type Tab = 'parties' | 'bonds';

/** Direct create / edit / delete for Parties and Bond Types (no combo needed). */
export function Masters({ initialTab = 'parties' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div>
      <PageHeader
        title="Manage Data"
        subtitle="Add and edit your parties and bond types"
        actions={
          <div className="segment">
            <button className={cx(tab === 'parties' && 'active')} onClick={() => setTab('parties')}>Parties</button>
            <button className={cx(tab === 'bonds' && 'active')} onClick={() => setTab('bonds')}>Bond Types</button>
          </div>
        }
      />
      {tab === 'parties' ? <PartiesPanel /> : <BondsPanel />}
    </div>
  );
}

// --------------------------------------------------------------------------
// Bond Types
// --------------------------------------------------------------------------

const COMMON_DENOMS = ['100', '200', '750', '1500', '7500', '15000', '25000', '40000'];

function BondsPanel() {
  const { bondTypes, period, dataset, addBondType, updateBondType, deleteBondType } = useData();
  const [name, setName] = useState('');
  const [face, setFace] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);

  const data = dataset();

  const add = async () => {
    const nm = name.trim();
    if (!nm) { toast.error('Enter a denomination, e.g. 750.'); return; }
    const fv = Number(face.replace(/,/g, '')) || Number(nm.replace(/,/g, '')) || 0;
    try {
      await addBondType({ name: nm, faceValue: fv });
      setName(''); setFace('');
    } catch { /* toast already shown */ }
  };

  const hasDenom = (denom: string) =>
    bondTypes.some((b) => normalizeDenomination(b.name) === normalizeDenomination(denom));

  const quickAdd = async (denom: string) => {
    if (hasDenom(denom)) { toast.info(`Rs. ${denom} already exists.`); return; }
    try { await addBondType({ name: denom, faceValue: Number(denom) }); } catch { /* handled */ }
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await updateBondType(id, { name: editName.trim(), faceValue: Number(editName.replace(/,/g, '')) || 0 });
    setEditing(null);
  };

  return (
    <div className="masters-layout">
      <div className="card master-form">
        <div className="section-title"><Icon name="stock" size={16} /> New Bond Type</div>
        <div className="form-grid">
          <div className="field">
            <label>Denomination</label>
            <input
              className="input" placeholder="e.g. 750" value={name} inputMode="numeric"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
          </div>
          <div className="field">
            <label>Price (optional)</label>
            <input className="input" placeholder="Auto from denomination" value={face} inputMode="numeric"
              onChange={(e) => setFace(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <button className="btn btn-primary" onClick={add}><Icon name="plus" size={16} /> Add Bond Type</button>

          <div className="divider" />
          <label className="faint" style={{ fontSize: 12, fontWeight: 600 }}>Quick add common bonds</label>
          <div className="chip-row">
            {COMMON_DENOMS.map((d) => (
              <button key={d} className={cx('chip', hasDenom(d) && 'chip-done')} onClick={() => quickAdd(d)}>
                {hasDenom(d) ? '✓ ' : '+ '} Rs. {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title"><Icon name="stock" size={16} /> Bond Types · {bondTypes.length}</div>
        {bondTypes.length === 0 ? (
          <div className="empty">No bond types yet. Add 100, 200, 750, 1500… on the left.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Denomination</th><th className="num">Price</th><th className="num">In Stock</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {bondTypes.map((b) => {
                  const inStock = computeStockQty(data, b.id, period);
                  return (
                    <tr key={b.id}>
                      <td>
                        {editing === b.id ? (
                          <input className="input" style={{ height: 34 }} value={editName} autoFocus
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(b.id); if (e.key === 'Escape') setEditing(null); }} />
                        ) : (
                          <strong>Rs. {b.name}</strong>
                        )}
                      </td>
                      <td className="num mono">{b.faceValue.toLocaleString()}</td>
                      <td className="num mono">{inStock.toLocaleString()}</td>
                      <td className="no-print">
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {editing === b.id ? (
                            <>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => saveEdit(b.id)}><Icon name="check" size={15} /></button>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(null)}><Icon name="close" size={15} /></button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(b.id); setEditName(b.name); }} title="Edit"><Icon name="settings" size={15} /></button>
                              <button className="btn btn-ghost btn-icon btn-sm del-btn" onClick={() => setToDelete(b.id)} title="Delete"><Icon name="trash" size={15} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete bond type?"
        message="This removes the bond denomination. Bonds with transactions can't be deleted."
        confirmLabel="Delete" danger
        onConfirm={() => { if (toDelete) deleteBondType(toDelete); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Parties
// --------------------------------------------------------------------------

function PartiesPanel() {
  const { parties, period, dataset, settings, addParty, updateParty, deleteParty } = useData();
  const cur = settings.currency;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [opening, setOpening] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });

  const balances = computePartyBalances(dataset(), period);
  const balOf = (id: string) => balances.find((b) => b.partyId === id)?.balance ?? 0;
  const tradeOf = (id: string) => partyTradeTotals(dataset(), id, period);

  const add = async () => {
    if (!name.trim()) { toast.error('Enter a party name.'); return; }
    try {
      await addParty({ name: name.trim(), phone: phone.trim(), openingBalance: Number(opening.replace(/,/g, '')) || 0 });
      setName(''); setPhone(''); setOpening('');
    } catch { /* handled */ }
  };

  const saveEdit = async (id: string) => {
    if (!editForm.name.trim()) return;
    await updateParty(id, { name: editForm.name.trim(), phone: editForm.phone.trim() });
    setEditing(null);
  };

  return (
    <div className="masters-layout">
      <div className="card master-form">
        <div className="section-title"><Icon name="user" size={16} /> New Party</div>
        <div className="form-grid">
          <div className="field">
            <label>Party Name</label>
            <input className="input" placeholder="e.g. Ali Traders" value={name}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <div className="field">
            <label>Phone (optional)</label>
            <input className="input" placeholder="03xx-xxxxxxx" value={phone} inputMode="tel"
              onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <div className="field">
            <label>Opening Balance (optional)</label>
            <input className="input" placeholder="+ receivable / - payable" value={opening} inputMode="numeric"
              onChange={(e) => setOpening(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <span className="faint" style={{ fontSize: 11 }}>Positive = they owe you · Negative = you owe them</span>
          </div>
          <button className="btn btn-primary" onClick={add}><Icon name="plus" size={16} /> Add Party</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title"><Icon name="user" size={16} /> Parties · {parties.length}</div>
        {parties.length === 0 ? (
          <div className="empty">No parties yet. Add your first customer/supplier on the left.</div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Name</th><th>Phone</th><th className="num">Purchased</th><th className="num">Sold</th><th className="num">Balance</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {parties.map((p) => {
                  const bal = balOf(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        {editing === p.id ? (
                          <input className="input" style={{ height: 34 }} value={editForm.name} autoFocus
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        ) : <strong>{p.name}</strong>}
                      </td>
                      <td>
                        {editing === p.id ? (
                          <input className="input" style={{ height: 34 }} value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                        ) : <span className="muted">{p.phone || '—'}</span>}
                      </td>
                      <td className="num mono">{formatMoney(tradeOf(p.id).purchased, cur)}</td>
                      <td className="num mono">{formatMoney(tradeOf(p.id).sold, cur)}</td>
                      <td className={cx('num mono', bal > 0 ? 'pos' : bal < 0 ? 'neg' : '')}>
                        {formatMoney(Math.abs(bal), cur)} {bal > 0 ? 'Dr' : bal < 0 ? 'Cr' : ''}
                      </td>
                      <td className="no-print">
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {editing === p.id ? (
                            <>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => saveEdit(p.id)}><Icon name="check" size={15} /></button>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(null)}><Icon name="close" size={15} /></button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(p.id); setEditForm({ name: p.name, phone: p.phone ?? '' }); }} title="Edit"><Icon name="settings" size={15} /></button>
                              <button className="btn btn-ghost btn-icon btn-sm del-btn" onClick={() => setToDelete(p.id)} title="Delete"><Icon name="trash" size={15} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete party?"
        message="This removes the party. Parties with transactions can't be deleted."
        confirmLabel="Delete" danger
        onConfirm={() => { if (toDelete) deleteParty(toDelete); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
function computeStockQty(data: DataSet, bondId: string, period: { month: number; year: number }) {
  const line = computeStock(data, period).find((s) => s.bondTypeId === bondId);
  return line?.closingQty ?? 0;
}
