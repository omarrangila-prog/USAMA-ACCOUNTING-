import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SmartEntry } from '../SmartEntry';
import { CommandPalette } from '../CommandPalette';
import { useShortcuts } from '@/hooks/useShortcuts';
import { MISCONFIGURED_PROD } from '@/firebase/config';
import './appshell.css';

export function AppShell() {
  const nav = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useShortcuts({
    onPurchase: () => nav('/purchase?new=1'),
    onSale: () => nav('/sale?new=1'),
    onCashReceived: () => nav('/ledger?cash=received'),
    onCashPaid: () => nav('/ledger?cash=paid'),
    onLedger: () => nav('/ledger'),
    onReports: () => nav('/reports'),
    onSearch: () => setPaletteOpen(true),
    onPrint: () => window.print(),
    onSave: () => { /* pages auto-save on submit; surfaced as a no-op */ },
  });

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="sidebar-scrim no-print" onClick={() => setSidebarOpen(false)} />}

      <div className="main-col">
        <Topbar
          onMenu={() => setSidebarOpen((v) => !v)}
          onSearch={() => setPaletteOpen(true)}
          onSmart={() => setSmartOpen(true)}
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

      <SmartEntry open={smartOpen} onClose={() => setSmartOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSmart={() => setSmartOpen(true)} />
    </div>
  );
}
