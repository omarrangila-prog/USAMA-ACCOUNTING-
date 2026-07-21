import { useEffect, useRef, useState } from 'react';

interface Options<T> {
  /** The rows currently shown, in display order. */
  rows: T[];
  /** Edit the selected row (Ctrl/Cmd+E or Enter). */
  onEdit?: (row: T) => void;
  /** Delete the selected row (Delete/Backspace) — should open a confirm. */
  onDelete?: (row: T) => void;
  /** Disable all row keys (e.g. the month is locked). */
  disabled?: boolean;
}

/**
 * Keyboard control for a record table, DOS-accounting style:
 *
 *   ↑ / ↓        move the selection up / down a row
 *   Home / End   first / last row
 *   Ctrl/Cmd+E   edit the selected row
 *   Enter        edit the selected row
 *   Delete       delete the selected row (opens the confirm dialog)
 *
 * The keys are ignored while typing in a field or while a modal/dropdown is
 * open, so the entry form and popups keep their own keyboard behaviour. Nothing
 * here changes any data directly — it only calls the edit/delete callbacks the
 * page already uses, so accounting logic is untouched.
 *
 * Returns the selected index and a setter (for click-to-select highlighting).
 */
export function useTableKeys<T>({ rows, onEdit, onDelete, disabled }: Options<T>) {
  const [selected, setSelected] = useState(-1);
  // Keep a live handle on rows/handlers without re-subscribing the listener.
  const ref = useRef({ rows, onEdit, onDelete, disabled, selected });
  ref.current = { rows, onEdit, onDelete, disabled, selected };

  // Clamp selection when the row set shrinks (after a delete / month change).
  useEffect(() => {
    setSelected((s) => (s >= rows.length ? rows.length - 1 : s));
  }, [rows.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = ref.current;
      if (c.disabled || c.rows.length === 0) return;
      const a = document.activeElement as HTMLElement | null;
      const tag = a?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a?.isContentEditable;
      // Don't hijack keys while typing or while a dialog / dropdown is open.
      if (typing || document.querySelector('.modal, .combo-pop')) return;

      const last = c.rows.length - 1;
      const cur = c.selected;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelected((s) => Math.min(s < 0 ? 0 : s + 1, last));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelected((s) => Math.max(s <= 0 ? 0 : s - 1, 0));
          break;
        case 'Home':
          e.preventDefault(); setSelected(0); break;
        case 'End':
          e.preventDefault(); setSelected(last); break;
        case 'Enter':
          if (cur >= 0 && c.onEdit) { e.preventDefault(); c.onEdit(c.rows[cur]); }
          break;
        case 'e': case 'E':
          if ((e.ctrlKey || e.metaKey) && cur >= 0 && c.onEdit) {
            e.preventDefault(); c.onEdit(c.rows[cur]);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (cur >= 0 && c.onDelete) { e.preventDefault(); c.onDelete(c.rows[cur]); }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Scroll the selected row into view as the selection moves.
  useEffect(() => {
    if (selected < 0) return;
    document.querySelector('tr.row-selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return { selected, setSelected };
}
