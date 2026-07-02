import { useState } from 'react';
import { useData } from '@/store/dataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ExcelMigration } from './ExcelMigration';
import { MoveMonth } from './MoveMonth';
import { buildSeed } from '@/lib/seed';
import { useT } from '@/lib/i18n';
import { toast } from '@/store/toast';
import './settings.css';

export function Settings() {
  const store = useData();
  const t = useT();
  const s = store.settings;

  const [form, setForm] = useState({
    businessName: s.businessName, ownerName: s.ownerName,
    phone: s.phone ?? '', address: s.address ?? '', currency: s.currency,
  });
  const [seedConfirm, setSeedConfirm] = useState(false);
  const [resetText, setResetText] = useState('');
  const [keepMasters, setKeepMasters] = useState(true);
  const [resetting, setResetting] = useState(false);

  const saveInfo = async () => {
    await store.updateSettings(form);
    toast.success('Business details saved');
  };

  const loadSample = async () => {
    setSeedConfirm(false);
    await store.importBulk(buildSeed());
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await store.resetAllData({ keepMasters });
      setResetText('');
    } finally { setResetting(false); }
  };

  return (
    <div>
      <PageHeader title={t('p.settingsTitle')} subtitle="Business profile, data & migration" />

      <div className="settings-grid">
        {/* Business profile */}
        <div className="card">
          <div className="section-title"><Icon name="user" size={16} /> Business Profile</div>
          <div className="form-grid">
            <div className="field">
              <label>Business Name</label>
              <input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
            <div className="form-row2">
              <div className="field">
                <label>Owner Name</label>
                <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Address</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field">
              <label>Currency</label>
              <input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={saveInfo}><Icon name="save" size={16} /> Save Details</button>
          </div>
        </div>

        {/* Data overview + sample */}
        <div className="card">
          <div className="section-title"><Icon name="stock" size={16} /> Data Overview</div>
          <div className="data-stats">
            <DataStat label="Parties" value={store.parties.length} />
            <DataStat label="Bond Types" value={store.bondTypes.length} />
            <DataStat label="Purchases" value={store.purchases.length} />
            <DataStat label="Sales" value={store.sales.length} />
            <DataStat label="Cash Entries" value={store.cash.length} />
            <DataStat label="Bank Files" value={store.fileAccounts.length} />
            <DataStat label="Closed Months" value={store.closings.length} />
            <DataStat label="Opening Set" value={store.opening ? 1 : 0} />
          </div>
          <div className="divider" />
          <div className="col" style={{ gap: 10 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              New here? Load sample data to explore the software instantly.
            </div>
            <button className="btn btn-green" onClick={() => setSeedConfirm(true)}>
              <Icon name="sparkles" size={16} /> Load Sample Data
            </button>
          </div>
        </div>
      </div>

      {/* Move records between months (e.g. fix wrong-month entries) */}
      <MoveMonth />

      {/* One-time Excel migration — only here, never on the dashboard */}
      <ExcelMigration />

      <div className="card">
        <div className="section-title"><Icon name="refresh" size={16} /> Sync Status</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {store.online
            ? 'Online — changes sync in real time.'
            : 'Offline — changes saved locally and sync automatically when reconnected.'}
        </div>
      </div>

      {/* Danger zone — permanent data reset */}
      <div className="card danger-zone">
        <div className="section-title" style={{ color: 'var(--red)' }}>
          <Icon name="warning" size={16} /> Danger Zone — Reset All Data
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          This permanently deletes <strong>all transactions</strong> (purchases, sales, cash, expenses),
          closings, opening balances and bank files across <strong>every month</strong>. This cannot be undone.
        </p>
        <label className="reset-check">
          <input type="checkbox" checked={keepMasters} onChange={(e) => setKeepMasters(e.target.checked)} />
          Keep my parties &amp; bond types (only delete transactions)
        </label>
        <div className="field" style={{ maxWidth: 320, marginTop: 12 }}>
          <label>Type <strong>DELETE</strong> to confirm</label>
          <input className="input" placeholder="DELETE" value={resetText}
            onChange={(e) => setResetText(e.target.value)} />
        </div>
        <button
          className="btn btn-danger"
          style={{ marginTop: 12 }}
          disabled={resetText !== 'DELETE' || resetting}
          onClick={doReset}
        >
          <Icon name="trash" size={16} /> {resetting ? 'Deleting…' : 'Permanently Delete All Data'}
        </button>
      </div>

      <ConfirmDialog
        open={seedConfirm}
        title="Load sample data?"
        message="This adds example parties, bonds and transactions for the current month so you can explore. You can delete them later."
        confirmLabel="Load Sample"
        onConfirm={loadSample}
        onCancel={() => setSeedConfirm(false)}
      />
    </div>
  );
}

function DataStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="data-stat">
      <span className="mono" style={{ fontSize: 20, fontWeight: 750 }}>{value}</span>
      <span className="faint" style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}
