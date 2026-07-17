import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '../CommandPalette';
import { useShortcuts } from '@/hooks/useShortcuts';
import { MISCONFIGURED_PROD } from '@/firebase/config';
import './appshell.css';

export function AppShell() {
  const nav = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false);      // desktop collapse
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Keyboard page scrolling (mouse-free): PageUp/Down, Home/End, and Arrow
  // Up/Down scroll the window — but ONLY when focus is on the page body, not
  // inside a form field, dropdown, or a scrollable table (those keep their own
  // key behaviour). This makes long reports fully navigable from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement as HTMLElement | null;
      const tag = a?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a?.isContentEditable;
      // Don't hijack keys while a dialog/dropdown is open or while typing.
      if (typing || document.querySelector('.combo-pop, .modal')) return;
      // The document (window) scrolls now that html/body use min-height.
      if (document.documentElement.scrollHeight <= window.innerHeight + 1) return;
      const page = Math.round(window.innerHeight * 0.9);
      switch (e.key) {
        case 'PageDown': window.scrollBy({ top: page, behavior: 'smooth' }); e.preventDefault(); break;
        case 'PageUp': window.scrollBy({ top: -page, behavior: 'smooth' }); e.preventDefault(); break;
        case 'Home': if (!e.ctrlKey) { window.scrollTo({ top: 0, behavior: 'smooth' }); e.preventDefault(); } break;
        case 'End': if (!e.ctrlKey) { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); e.preventDefault(); } break;
        case 'ArrowDown': window.scrollBy({ top: 60 }); e.preventDefault(); break;
        case 'ArrowUp': window.scrollBy({ top: -60 }); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The hamburger toggles the mobile drawer on small screens, and collapses
  // the docked sidebar on wide screens — so it always does something visible.
  const onMenu = () => {
    if (window.innerWidth <= 960) setSidebarOpen((v) => !v);
    else setCollapsed((v) => !v);
  };

  useShortcuts({
    onPurchase: () => nav('/purchase?new=1'),
    onSale: () => nav('/sale?new=1'),
    onCashReceived: () => nav('/?cash=received'),
    onCashPaid: () => nav('/?cash=paid'),
    onLedger: () => nav('/'),
    onReports: () => nav('/reports'),
    onSearch: () => setPaletteOpen(true),
    onPrint: () => window.print(),
    onSave: () => { /* pages auto-save on submit; surfaced as a no-op */ },
    onNew: () => nav('/purchase?new=1'), // Ctrl/Cmd+N → start a new transaction
  });

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="sidebar-scrim no-print" onClick={() => setSidebarOpen(false)} />}

      <div className="main-col">
        <Topbar
          onMenu={onMenu}
          onSearch={() => setPaletteOpen(true)}
        />
        {MISCONFIGURED_PROD && (
          <div className="config-warning no-print">
            ⚠️ Firebase is not configured on this deployment, so data cannot load or save.
            Set the <code>VITE_FIREBASE_*</code> environment variables in your hosting settings
            (Vercel → Settings → Environment Variables) and <strong>redeploy</strong>.
          </div>
        )}
        <main className="content">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
