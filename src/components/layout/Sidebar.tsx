import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { useData } from '@/store/dataStore';
import './sidebar.css';

interface NavItem { to: string; label: string; icon: IconName; shortcut?: string; }

const items: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/purchase', label: 'Purchase', icon: 'purchase', shortcut: 'F2' },
  { to: '/sale', label: 'Sale', icon: 'sale', shortcut: 'F3' },
  { to: '/expenses', label: 'Expenses', icon: 'wallet' },
  { to: '/stock', label: 'Stock', icon: 'stock' },
  { to: '/parties', label: 'Parties', icon: 'user' },
  { to: '/bond-types', label: 'Bond Types', icon: 'wallet' },
  { to: '/receivable', label: 'Receivable', icon: 'receivable' },
  { to: '/payable', label: 'Payable', icon: 'payable' },
  { to: '/ledger', label: 'Ledger', icon: 'ledger', shortcut: 'F6' },
  { to: '/trial-balance', label: 'Trial Balance', icon: 'trial' },
  { to: '/reports', label: 'Reports', icon: 'reports', shortcut: 'F7' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const settings = useData((s) => s.settings);
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
            <span className="nav-label">{it.label}</span>
            {it.shortcut && <span className="nav-key">{it.shortcut}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="tip glass card-tight">
          <Icon name="sparkles" size={15} />
          <span>Type naturally in Smart Entry to record faster.</span>
        </div>
      </div>
    </aside>
  );
}
