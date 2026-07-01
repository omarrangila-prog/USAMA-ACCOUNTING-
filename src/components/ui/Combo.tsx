import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/utils';
import { toast } from '@/store/toast';
import './combo.css';

interface Option { id: string; label: string; sub?: string; }

export interface ComboHandle {
  focus: () => void;
  open: () => void;
}

interface Props {
  value: string;
  options: Option[];
  placeholder?: string;
  allowCreate?: boolean;
  onChange: (id: string) => void;
  onCreate?: (label: string) => Promise<string> | string;
  invalid?: boolean;
  /** Called after a value is picked/created (used to advance to the next field). */
  onDone?: () => void;
}

/**
 * Searchable select with inline create and full keyboard control:
 *  - Focus the trigger and press Enter / any letter / ↓ to open.
 *  - Type to filter, ↑/↓ to move, Enter to pick the highlighted row or create.
 *  - Esc closes. After a pick, onDone() fires to advance to the next field.
 */
export const Combo = forwardRef<ComboHandle, Props>(function Combo(
  { value, options, placeholder = 'Select…', allowCreate, onChange, onCreate, invalid, onDone },
  ref
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
    open: () => setOpen(true),
  }));

  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const exactExists = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const canCreate = !!(allowCreate && query.trim() && !exactExists);
  // Rows = filtered options, plus a virtual "create" row at the end.
  const rowCount = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 20); }, [open]);
  useEffect(() => { setActive(0); }, [query, open]);

  const pick = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
    // Return focus to trigger, then advance.
    triggerRef.current?.focus();
    onDone?.();
  };

  const create = async () => {
    if (!onCreate || !query.trim() || busy) return;
    setBusy(true);
    try {
      const id = await onCreate(query.trim());
      if (id) pick(id);
      else toast.error('Could not create — please try again.');
    } catch (err) {
      console.error('Combo create failed:', err);
      toast.error('Save failed. Check your connection / Firestore rules.');
    } finally {
      setBusy(false);
    }
  };

  const commitActive = () => {
    if (active < filtered.length) pick(filtered[active].id);
    else if (canCreate) create();
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
      // Start typing immediately.
      setQuery(e.key);
      setOpen(true);
    }
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rowCount - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); commitActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  return (
    <div className={cx('combo', invalid && 'combo-invalid')}>
      <button
        ref={triggerRef}
        type="button"
        className={cx('input combo-trigger', invalid && 'invalid')}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={selected ? '' : 'faint'}>{selected?.label ?? placeholder}</span>
        <span className="faint">▾</span>
      </button>
      {open && (
        <>
          <div className="combo-overlay" onClick={() => setOpen(false)} />
          <div className="combo-pop glass">
            <input
              ref={searchRef}
              className="input combo-search"
              placeholder="Type to search or add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
            />
            <div className="combo-list">
              {filtered.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  className={cx('combo-item', o.id === value && 'active', i === active && 'kbd-active')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.id)}
                >
                  <span>{o.label}</span>
                  {o.sub && <span className="faint" style={{ fontSize: 12 }}>{o.sub}</span>}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  className={cx('combo-item combo-create', active === filtered.length && 'kbd-active')}
                  onMouseEnter={() => setActive(filtered.length)}
                  onClick={create}
                  disabled={busy}
                >
                  {busy ? 'Adding…' : `+ Create “${query.trim()}”`}
                </button>
              )}
              {filtered.length === 0 && !canCreate && (
                <div className="faint" style={{ padding: '10px 12px' }}>No matches</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
