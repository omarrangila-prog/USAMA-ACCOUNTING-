import { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { formatMoney, cx } from '@/lib/utils';
import { toast } from '@/store/toast';
import './report-grid.css';

/**
 * Parties & Bond Types — the master lists.
 *
 * Lets the user FIX a name that was typed incorrectly. Renaming only changes the
 * label on the master record: every transaction references the party/bond by id,
 * so all purchases, sales, ledgers, balances and reports keep pointing at the
 * same record and NO figure changes. Deleting is offered only where the store
 * already allows it (a bond type with transactions is refused by the store).
 */
export function Masters() {
  const store = useData();
  const { parties, bondTypes, dataset, settings, period } = store;
  const data = dataset();
  const cur = settings.currency;

  const [tab, setTab] = useState<'parties' | 'bonds'>('parties');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ kind: 'party' | 'bond'; id: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [toDelete, setToDelete] = useState<{ kind: 'party' | 'bond'; id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the inline editor as soon as a row switches into edit mode.
  useEffect(() => {
    if (editing) setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 20);
  }, [editing]);

  const needle = q.trim().toLowerCase();

  // How many records reference each master row — shown so the user understands
  // what a rename affects (and why some bond types can't be deleted).
  const partyUse = useMemo(() => {
    const m: Record<string, number> = {};
    const bump = (id?: string) => { if (id) m[id] = (m[id] ?? 0) + 1; };
    data.purchases.forEach((p) => bump(p.partyId));
    data.sales.forEach((s) => bump(s.partyId));
    data.cash.forEach((c) => bump(c.partyId));
    (data.partyAdjustments ?? []).forEach((a) => bump(a.partyId));
    return m;
  }, [data.purchases, data.sales, data.cash, data.partyAdjustments]);

  const bondUse = useMemo(() => {
    const m: Record<string, number> = {};
    const bump = (id?: string) => { if (id) m[id] = (m[id] ?? 0) + 1; };
    data.purchases.forEach((p) => bump(p.bondTypeId));
    data.sales.forEach((s) => bump(s.bondTypeId));
    (data.stockAdjustments ?? []).forEach((a) => bump(a.bondTypeId));
    return m;
  }, [data.purchases, data.sales, data.stockAdjustments]);

  const shownParties = useMemo(
    () => parties
      .filter((p) => !needle || p.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [parties, needle]
  );

  // Bond types read best in denomination order (750, 1500, 15000 …).
  const shownBonds = useMemo(
    () => bondTypes
      .filter((b) => !needle || b.name.toLowerCase().includes(needle))
      .sort((a, b) => (Number(String(a.name).replace(/[^0-9.]/g, '')) || 0) - (Number(String(b.name).replace(/[^0-9.]/g, '')) || 0)),
    [bondTypes, needle]
  );

  const startEdit = (kind: 'party' | 'bond', id: string, current: string) => {
    setEditing({ kind, id });
    setDraft(current);
  };

  const cancelEdit = () => { setEditing(null); setDraft(''); };

  const saveEdit = async () => {
    if (!editing) return;
    const name = draft.trim();
    if (!name) { toast.error('Name cannot be empty.'); inputRef.current?.focus(); return; }
    if (editing.kind === 'party') {
      const clash = parties.find((p) => p.id !== editing.id && p.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) { toast.error(`A party named "${clash.name}" already exists.`); return; }
      await store.updateParty(editing.id, { name });
    } else {
      const clash = bondTypes.find((b) => b.id !== editing.id && b.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) { toast.error(`Bond type "${clash.name}" already exists.`); return; }
      // Keep faceValue in step with a corrected denomination label.
      const faceValue = Number(name.replace(/[^0-9.]/g, '')) || 0;
      await store.updateBondType(editing.id, { name, faceValue });
    }
    cancelEdit();
  };

  const onEditKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  const doDelete = async () => {
    const d = toDelete;
    setToDelete(null);
    if (!d) return;
    if (d.kind === 'party') await store.deleteParty(d.id);
    else await store.deleteBondType(d.id);
  };

  const isEditing = (kind: 'party' | 'bond', id: string) =>
    editing?.kind === kind && editing.id === id;

  return (
    <div>
      <PageHeader
        title="Parties & Bond Types"
        subtitle="Master lists — fix a misspelled name here and it updates everywhere"
      />

      <div className="card">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="segment">
            <button className={cx(tab === 'parties' && 'active')} onClick={() => { setTab('parties'); cancelEdit(); }}>
              Parties · {parties.length}
            </button>
            <button className={cx(tab === 'bonds' && 'active')} onClick={() => { setTab('bonds'); cancelEdit(); }}>
              Bond Types · {bondTypes.length}
            </button>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder={tab === 'parties' ? 'Search parties…' : 'Search bond types…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search master list"
          />
        </div>

        {tab === 'parties' ? (
          shownParties.length === 0 ? (
            <div className="empty">{parties.length === 0 ? 'No parties yet.' : 'No parties match your search.'}</div>
          ) : (
            <div className="table-wrap">
              <table className="rpt-grid">
                <thead>
                  <tr>
                    <th className="l">Party Name</th>
                    <th className="l">Phone</th>
                    <th className="r">Opening Balance</th>
                    <th className="r">Used In</th>
                    <th className="no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {shownParties.map((p) => (
                    <tr key={p.id}>
                      <td className="l">
                        {isEditing('party', p.id) ? (
                          <input
                            ref={inputRef}
                            className="input"
                            style={{ height: 30, fontSize: 13 }}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={onEditKey}
                            aria-label="Party name"
                          />
                        ) : (
                          <strong>{p.name}</strong>
                        )}
                      </td>
                      <td className="l muted">{p.phone || '—'}</td>
                      <td className="r mono">{formatMoney(p.openingBalance ?? 0, cur)}</td>
                      <td className="r mono faint">{partyUse[p.id] ?? 0}</td>
                      <td className="no-print actions-cell">
                        <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                          {isEditing('party', p.id) ? (
                            <>
                              <button className="btn btn-sm btn-primary" onClick={saveEdit}>
                                <Icon name="check" size={14} /> Save
                              </button>
                              <button className="btn btn-sm" onClick={cancelEdit}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-icon btn-sm" title="Rename party"
                                onClick={() => startEdit('party', p.id, p.name)}>
                                <Icon name="settings" size={15} />
                              </button>
                              <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete party"
                                onClick={() => setToDelete({ kind: 'party', id: p.id, name: p.name })}>
                                <Icon name="trash" size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : shownBonds.length === 0 ? (
          <div className="empty">{bondTypes.length === 0 ? 'No bond types yet.' : 'No bond types match your search.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="rpt-grid">
              <thead>
                <tr>
                  <th className="l">Bond Type</th>
                  <th className="r">Face Value</th>
                  <th className="r">Used In</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {shownBonds.map((b) => (
                  <tr key={b.id}>
                    <td className="l">
                      {isEditing('bond', b.id) ? (
                        <input
                          ref={inputRef}
                          className="input"
                          style={{ height: 30, fontSize: 13 }}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={onEditKey}
                          aria-label="Bond type name"
                        />
                      ) : (
                        <strong>Rs. {b.name}</strong>
                      )}
                    </td>
                    <td className="r mono">{b.faceValue || '—'}</td>
                    <td className="r mono faint">{bondUse[b.id] ?? 0}</td>
                    <td className="no-print actions-cell">
                      <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                        {isEditing('bond', b.id) ? (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={saveEdit}>
                              <Icon name="check" size={14} /> Save
                            </button>
                            <button className="btn btn-sm" onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Rename bond type"
                              onClick={() => startEdit('bond', b.id, b.name)}>
                              <Icon name="settings" size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm del-btn" title="Delete bond type"
                              onClick={() => setToDelete({ kind: 'bond', id: b.id, name: b.name })}>
                              <Icon name="trash" size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
          Renaming only corrects the label. Every transaction links to the record by
          id, so ledgers, balances, stock and reports keep their exact figures.
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete?.kind === 'party' ? 'Delete party?' : 'Delete bond type?'}
        message={
          toDelete?.kind === 'party'
            ? `"${toDelete?.name}" will be removed from the party list. Existing transactions are kept and will show as Cash / — instead. No amounts change.`
            : `"${toDelete?.name}" will be removed. A bond type that already has purchases or sales cannot be deleted.`
        }
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
