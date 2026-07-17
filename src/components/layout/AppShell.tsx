import { useState } from 'react';
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
