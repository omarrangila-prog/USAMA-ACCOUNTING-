import { useEffect } from 'react';

export interface ShortcutMap {
  onPurchase?: () => void; // F2
  onSale?: () => void; // F3
  onCashReceived?: () => void; // F4
  onCashPaid?: () => void; // F5
  onLedger?: () => void; // F6
  onReports?: () => void; // F7
  onSearch?: () => void; // Ctrl/Cmd+K
  onSave?: () => void; // Ctrl/Cmd+S
  onPrint?: () => void; // Ctrl/Cmd+P
}

/** Global keyboard shortcuts. Ignores typing inside inputs for the F-keys' safety. */
export function useShortcuts(map: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') {
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
