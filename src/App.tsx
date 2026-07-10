

import { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/store/authStore';
import { useData } from '@/store/dataStore';
import { PinLock, isUnlocked } from '@/components/PinLock';
import { AppShell } from '@/components/layout/AppShell';
import { Toasts } from '@/components/ui/Toasts';
import { Dashboard } from '@/pages/Dashboard';
import { Masters } from '@/pages/Masters';
import { Expenses } from '@/pages/Expenses';
import { Purchase } from '@/pages/Purchase';
import { Sale } from '@/pages/Sale';
import { Stock } from '@/pages/Stock';
import { Balances } from '@/pages/Balances';
import { Ledger } from '@/pages/Ledger';
import { CashBook } from '@/pages/CashBook';
import { TrialBalance } from '@/pages/TrialBalance';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';

function Splash() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        <div className="brand-mark" style={{ width: 52, height: 52, fontSize: 24 }}>B</div>
        <div className="muted">Loading Bond Ledger OS…</div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, init } = useAuth();
  const bind = useData((s) => s.bind);
  const unbind = useData((s) => s.unbind);
  const ready = useData((s) => s.ready);
  const [unlocked, setUnlocked] = useState(isUnlocked);

  useEffect(() => init(), [init]);

  // Single fixed workspace — bind data once on mount.
  useEffect(() => {
    if (user) bind(user.uid);
    return () => unbind();
  }, [user, bind, unbind]);

  if (!user) return <Splash />;
  // 4-digit PIN gate — must unlock before the app is shown (per session).
  if (!unlocked) return <PinLock onUnlock={() => setUnlocked(true)} />;
  // Don't render the app (and its derived dashboard/report totals) until the
  // Firestore snapshots have loaded — prevents flicker / stale partial values.
  if (!ready) return <Splash />;

  // Electron loads over file://, where BrowserRouter paths don't resolve —
  // use HashRouter there. Web/Vercel keeps clean BrowserRouter URLs.
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

  return (
    <Router>
      <Toasts />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/parties" element={<Masters initialTab="parties" />} />
          <Route path="/bond-types" element={<Masters initialTab="bonds" />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/sale" element={<Sale />} />
          <Route path="/cashbook" element={<CashBook />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/receivable" element={<Balances kind="receivable" />} />
          <Route path="/payable" element={<Balances kind="payable" />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/trial-balance" element={<TrialBalance />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
