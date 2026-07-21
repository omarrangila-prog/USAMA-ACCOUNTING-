import { useEffect, useRef } from 'react';

export interface ShortcutMap {
  onSale?: () => void;         // F1 — open Sale form
  onPurchase?: () => void;     // F2 — open Purchase form
  onReceivable?: () => void;   // F3 — open Receivable form
  onPayable?: () => void;      // F4 — open Payable form
  onLedger?: () => void;       // F6 — party ledger (kept; no conflict)
  onReports?: () => void;      // F7 — reports (kept; no conflict)
  onSearch?: () => void;       // Ctrl/Cmd+K or Ctrl/Cmd+F
  onSave?: () => void;         // Ctrl/Cmd+S
  onPrint?: () => void;        // Ctrl/Cmd+P
  onNew?: () => void;          // Ctrl/Cmd+N — new transaction
}

/**
 * Global keyboard shortcuts, DOS-accounting style. The four transaction forms
 * are on dedicated function keys so an accountant can jump to any of them from
 * anywhere without the mouse:
 *
 *   F1 → Sale   F2 → Purchase   F3 → Receivable   F4 → Payable
 *
 * Safety:
 *  - `preventDefault()` stops the browser's own F-key actions (F1 Help, etc.).
 *  - A key-repeat guard (`e.repeat` + a pressed-set) makes sure a held key fires
 *    the action exactly once, never twice from OS auto-repeat.
 *  - The listener subscribes ONCE and reads handlers live from a ref, so it is
 *    never re-added on re-render — no duplicate listeners, no double-fire.
 */
export function useShortcuts(map: ShortcutMap) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    const held = new Set<string>();

    const handler = (e: KeyboardEvent) => {
      const m = mapRef.current;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
        e.preventDefault(); m.onSearch?.(); return;
      }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); m.onSave?.(); return; }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); m.onPrint?.(); return; }
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); m.onNew?.(); return; }

      // Function-key form shortcuts. Guard against OS/browser auto-repeat so a
      // held key opens a form only once.
      const fnActions: Record<string, (() => void) | undefined> = {
        F1: m.onSale,
        F2: m.onPurchase,
        F3: m.onReceivable,
        F4: m.onPayable,
        F6: m.onLedger,
        F7: m.onReports,
      };
      if (e.key in fnActions) {
        e.preventDefault();          // block browser Help / find / etc.
        if (e.repeat || held.has(e.key)) return; // fire once per physical press
        held.add(e.key);
        fnActions[e.key]?.();
      }
    };

    const onUp = (e: KeyboardEvent) => { held.delete(e.key); };

    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', onUp);
    };
  }, []);
}
