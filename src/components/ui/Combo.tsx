import { forwardRef, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // Screen-space position of the popup, measured from the trigger. The popup is
  // portalled to <body> so it escapes any parent stacking context / overflow.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // True once we've focused the search box for the CURRENT open session, so a
  // later re-measure of `pos` (scroll/resize) doesn't re-grab focus mid-typing.
  const focusedRef = useRef(false);
  // Direction (up/down) is decided ONCE per open and locked for the session.
  // Without this, as the filtered list shrinks the popup height changes, which
  // can flip `spaceBelow < POP_MAX` and make the popup jump up↔down mid-typing —
  // the flicker seen on shorter client screens. null = not yet decided.
  const openUpRef = useRef<boolean | null>(null);

  // Measure the trigger and place the popup below it — or ABOVE if there isn't
  // room below (common on phones when the field is low on screen). Width is
  // clamped to the viewport so it never overflows horizontally on mobile.
  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const POP_MAX = 300; // ~max-height + search box
    const spaceBelow = window.innerHeight - r.bottom;
    // Decide direction only the first time this open session; keep it locked
    // after that so the popup never oscillates up↔down while the user types.
    if (openUpRef.current === null) {
      openUpRef.current = spaceBelow < POP_MAX && r.top > spaceBelow;
    }
    const openUp = openUpRef.current;
    const width = Math.min(r.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const GAP = 6, MARGIN = 8;
    // Cap the popup height to the room actually available in the chosen
    // direction, so on short (Chromebook) screens it never overflows the top or
    // bottom edge. The inner list scrolls; min floor keeps it usable.
    const room = openUp ? (r.top - GAP - MARGIN) : (window.innerHeight - r.bottom - GAP - MARGIN);
    const maxHeight = Math.max(140, Math.min(280, Math.floor(room)));
    const next = openUp
      ? { bottom: window.innerHeight - r.top + GAP, left, width, maxHeight }
      : { top: r.bottom + GAP, left, width, maxHeight };
    // Only update state when the position ACTUALLY changed. Rounding to whole
    // pixels + a shallow compare prevents a re-render storm: focusing the input
    // can nudge the page by sub-pixels, which fires the scroll listener, which
    // would otherwise setPos a new object every time → flicker / reopen loop.
    setPos((prev) => {
      const same = prev
        && Math.round(prev.top ?? -1) === Math.round(next.top ?? -1)
        && Math.round(prev.bottom ?? -1) === Math.round(next.bottom ?? -1)
        && Math.round(prev.left) === Math.round(next.left)
        && Math.round(prev.width) === Math.round(next.width)
        && prev.maxHeight === next.maxHeight;
      return same ? prev : next;
    });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true); // capture: any scroll container
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

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

  // Focus the search box synchronously right after it mounts (before paint) so
  // no keystroke is dropped in the race between opening and focusing. The
  // caret is placed at the end so a pre-seeded first letter isn't overwritten.
  //
  // NOTE: depend on `pos` as well — the input is only rendered once `pos` is
  // measured (one render AFTER `open` flips true). Keying on `open` alone means
  // the input isn't mounted yet when this runs, so focus is silently skipped and
  // the user has to click the box. Re-running when `pos` becomes non-null (and
  // whenever `open` toggles) guarantees we focus the input the moment it exists.
  useLayoutEffect(() => {
    if (!open) { focusedRef.current = false; openUpRef.current = null; return; } // reset on close
    if (!pos || focusedRef.current) return;            // wait for mount; focus once
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    focusedRef.current = true;
  }, [open, pos]);
  useLayoutEffect(() => { setActive(0); }, [query, open]);

  // Keep the keyboard-highlighted option scrolled into view: when arrowing past
  // the visible area, the list auto-scrolls so the active row stays on screen.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('.kbd-active');
    if (list && el) {
      const top = el.offsetTop, bottom = top + el.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
  }, [active, open]);

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
    const last = rowCount - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, last)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive((a) => Math.min(a + 6, last)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive((a) => Math.max(a - 6, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
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
      {open && pos && createPortal(
        <>
          {/* Full-screen backdrop catches outside clicks; sits just below pop. */}
          <div className="combo-overlay" onMouseDown={() => setOpen(false)} />
          <div
            className="combo-pop glass"
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={searchRef}
              className="input combo-search"
              placeholder="Type to search or add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
            />
            <div className="combo-list" ref={listRef}>
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
        </>,
        document.body
      )}
    </div>
  );
});
