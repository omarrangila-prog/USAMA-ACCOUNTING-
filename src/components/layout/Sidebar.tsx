import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { useData } from '@/store/dataStore';
import { useT } from '@/lib/i18n';
import './sidebar.css';

interface NavItem { to: string; tkey: string; icon: IconName; shortcut?: string; }

const items: NavItem[] = [
  { to: '/', tkey: 'nav.cashbook', icon: 'wallet' },
  { to: '/masters', tkey: 'nav.masters', icon: 'user' },
  { to: '/reports', tkey: 'nav.reports', icon: 'reports', shortcut: 'F7' },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const settings = useData((s) => s.settings);
  const t = useT();
  return (
    <aside className={`sidebar no-print ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">{(settings.businessName || 'B')[0].toUpperCase()}</div>
        <div className="col" style={{ lineHeight: 1.15 }}>
          <strong style={{ fontSize: 15 }}>{settings.businessName || 'Bond Ledger'}</strong>
          <span className="faint" style={{ fontSize: 11.5 }}>Bond Ledger</span>
        </div>
      </div>

      <nav className="nav">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon"><Icon name={it.icon} size={18} /></span>
            <span className="nav-label">{t(it.tkey)}</span>
            {it.shortcut && <span className="nav-key">{it.shortcut}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="tip glass card-tight">
          <Icon name="wallet" size={15} />
          <span>Record everything from the Cash Book — one screen.</span>
        </div>
      </div>
    </aside>
  );
}
