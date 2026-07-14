import { useState } from 'react';
import { useAuth } from '@/store/authStore';
import { useData } from '@/store/dataStore';
import { Icon } from '../ui/Icon';
import { MONTHS } from '@/lib/utils';
import { exportReportPdf, exportReportExcel } from '@/lib/reportBuilder';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/store/toast';
import './topbar.css';

interface Props {
  onMenu: () => void;
  onSearch: () => void;
  onSmart: () => void;
}

export function Topbar({ onMenu, onSearch, onSmart }: Props) {
  const { mockMode } = useAuth();
  const { period, setPeriod, online, dataset, settings } = useData();
  const { lang, setLang } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  const years = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 4 + i);

  return (
    <header className="topbar no-print glass">
      <button className="btn btn-ghost btn-icon menu-btn" onClick={onMenu} aria-label="Menu">
        <Icon name="menu" size={20} />
      </button>

      <div className="period-picker" title={lang === 'ur' ? 'مہینہ اور سال منتخب کریں' : 'Select accounting month & year'}>
        <Icon name="calendar" size={16} className="faint" />
        <span className="period-label faint">{lang === 'ur' ? 'مہینہ' : 'Month'}</span>
        <select
          className="select bare"
          value={period.month}
          aria-label="Accounting month"
          onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <span className="period-label faint">{lang === 'ur' ? 'سال' : 'Year'}</span>
        <select
          className="select bare"
          value={period.year}
          aria-label="Accounting year"
          onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <button className="search-btn" onClick={onSearch}>
        <Icon name="search" size={16} className="faint" />
        <span>Search parties, reports…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="spacer" />

      <div className="segment lang-toggle" title="Language / زبان">
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        <button className={lang === 'ur' ? 'active' : ''} onClick={() => setLang('ur')}>اردو</button>
      </div>

      {!online && (
        <span className="badge badge-orange offline-pill" title="Offline — changes sync automatically">
          <Icon name="wifi-off" size={13} /> Offline
        </span>
      )}
      {mockMode && (
        <span className="badge badge-gray demo-pill" title="Running in local demo mode (no Firebase)">
          Demo
        </span>
      )}

      <button className="btn btn-green btn-sm smart-btn" onClick={onSmart} title="Smart Entry">
        <Icon name="sparkles" size={15} /> Smart Entry
      </button>

      {/* Full inline tools on wide screens */}
      <div className="tool-group">
        <button className="btn btn-ghost btn-icon" title="Print (Ctrl/Cmd+P)" onClick={() => window.print()}>
          <Icon name="print" size={17} />
        </button>
        <button className="btn btn-ghost btn-icon" title="Export PDF"
          onClick={() => { exportReportPdf(dataset(), settings, period, 'all'); toast.success('PDF exported'); }}>
          <Icon name="pdf" size={17} />
        </button>
        <button className="btn btn-ghost btn-icon" title="Export Excel"
          onClick={() => { exportReportExcel(dataset(), period); toast.success('Excel exported'); }}>
          <Icon name="excel" size={17} />
        </button>
        <button className="btn btn-ghost btn-icon" title="Refresh" onClick={() => window.location.reload()}>
          <Icon name="refresh" size={17} />
        </button>
      </div>

      {/* Compact overflow menu on small screens */}
      <div className="tool-more">
        <button className="btn btn-ghost btn-icon" title="More" onClick={() => setMoreOpen((v) => !v)}>
          <Icon name="more" size={18} />
        </button>
        {moreOpen && (
          <>
            <div className="more-overlay" onClick={() => setMoreOpen(false)} />
            <div className="more-menu glass">
              <button onClick={() => { setMoreOpen(false); window.print(); }}><Icon name="print" size={16} /> {lang === 'ur' ? 'پرنٹ' : 'Print'}</button>
              <button onClick={() => { setMoreOpen(false); exportReportPdf(dataset(), settings, period, 'all'); toast.success('PDF exported'); }}><Icon name="pdf" size={16} /> {lang === 'ur' ? 'پی ڈی ایف' : 'Export PDF'}</button>
              <button onClick={() => { setMoreOpen(false); exportReportExcel(dataset(), period); toast.success('Excel exported'); }}><Icon name="excel" size={16} /> {lang === 'ur' ? 'ایکسل' : 'Export Excel'}</button>
              <button onClick={() => { setMoreOpen(false); window.location.reload(); }}><Icon name="refresh" size={16} /> {lang === 'ur' ? 'ری فریش' : 'Refresh'}</button>
            </div>
          </>
        )}
      </div>

      <div className="user-menu">
        <div className="user-btn" title={settings.businessName || 'Owner'}>
          <span className="avatar">{(settings.businessName || 'B')[0].toUpperCase()}</span>
          <span className="user-name">{settings.businessName || 'Owner'}</span>
        </div>
      </div>
    </header>
  );
}
