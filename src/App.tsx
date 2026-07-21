

import { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/store/authStore';
import { useData } from '@/store/dataStore';
import { PinLock, isUnlocked } from '@/components/PinLock';
import { AppShell } from '@/components/layout/AppShell';
import { Toasts } from '@/components/ui/Toasts';
import { CashBook } from '@/pages/CashBook';
import { Purchase } from '@/pages/Purchase';
import { Sale } from '@/pages/Sale';
import { Stock } from '@/pages/Stock';
import { Balances } from '@/pages/Balances';
import { TrialBalance } from '@/pages/TrialBalance';
import { Reports } from '@/pages/Reports';
import { Masters } from '@/pages/Masters';

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
  const { user, init, refresh } = useAuth();
  const bind = useData((s) => s.bind);
  const unbind = useData((s) => s.unbind);
  const ready = useData((s) => s.ready);
  const [unlocked, setUnlocked] = useState(isUnlocked);

  useEffect(() => init(), [init]);

  // Bind data to the ACTIVE client's workspace. `user.uid` is the workspace id
  // chosen at login (PIN → client → workspace). When a different client logs in
  // this re-binds to their isolated data — one client's data never leaks into
  // another's because every read/write is scoped under users/{workspace}/….
  useEffect(() => {
    if (user) bind(user.uid);
    return () => unbind();
  }, [user, bind, unbind]);

  if (!user) return <Splash />;
  // PIN gate — the entered PIN selects the client workspace, then unlocks.
  // refresh() re-reads the just-chosen workspace so data binds to that client.
  if (!unlocked) return <PinLock onUnlock={() => { refresh(); setUnlocked(true); }} />;
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
          {/* Cash Book is the single working screen; Reports is the only other. */}
          <Route path="/" element={<CashBook />} />
          <Route path="/cashbook" element={<CashBook />} />
          <Route path="/reports" element={<Reports />} />
          {/* Kept reachable by URL (used by entry forms / deep-links), not in sidebar. */}
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/sale" element={<Sale />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/receivable" element={<Balances kind="receivable" />} />
          <Route path="/payable" element={<Balances kind="payable" />} />
          <Route path="/trial-balance" element={<TrialBalance />} />
          <Route path="/masters" element={<Masters />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
