import { useEffect } from 'react';

export interface ShortcutMap {
  onPurchase?: () => void; // F2
  onSale?: () => void; // F3
  onCashReceived?: () => void; // F4
  onCashPaid?: () => void; // F5
  onLedger?: () => void; // F6
  onReports?: () => void; // F7
  onSearch?: () => void; // Ctrl/Cmd+K or Ctrl/Cmd+F
  onSave?: () => void; // Ctrl/Cmd+S
  onPrint?: () => void; // Ctrl/Cmd+P
  onNew?: () => void; // Ctrl/Cmd+N — new transaction
}

/** Global keyboard shortcuts. Ignores typing inside inputs for the F-keys' safety. */
export function useShortcuts(map: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+K or Ctrl/Cmd+F → focus search / command palette.
      if (mod && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        map.onSearch?.();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        map.onSave?.();
        return;
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        map.onPrint?.();
        return;
      }
      // Ctrl/Cmd+N → new transaction. (Browsers open a new window on Ctrl+N, so
      // preventDefault is essential — it may still be intercepted by some
      // browsers before reaching us; F2/F3 remain the reliable "new" keys.)
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        map.onNew?.();
        return;
      }

      switch (e.key) {
        case 'F2': e.preventDefault(); map.onPurchase?.(); break;
        case 'F3': e.preventDefault(); map.onSale?.(); break;
        case 'F4': e.preventDefault(); map.onCashReceived?.(); break;
        case 'F5': e.preventDefault(); map.onCashPaid?.(); break;
        case 'F6': e.preventDefault(); map.onLedger?.(); break;
        case 'F7': e.preventDefault(); map.onReports?.(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [map]);
}
