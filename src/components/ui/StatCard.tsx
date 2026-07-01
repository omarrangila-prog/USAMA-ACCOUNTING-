import { Icon, type IconName } from './Icon';
import './statcard.css';

export type Accent = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray';

interface Props {
  label: string;
  value: string;
  icon: IconName;
  accent?: Accent;
  hint?: string;
  trend?: 'up' | 'down' | null;
  /** Makes the whole card a one-click shortcut to a page. */
  onClick?: () => void;
}

export function StatCard({ label, value, icon, accent = 'blue', hint, trend, onClick }: Props) {
  return (
    <div
      className={`stat-card card animate-in accent-${accent} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="stat-top">
        <span className="stat-icon">
          <Icon name={icon} size={18} strokeWidth={2} />
        </span>
        {trend && (
          <span className={`stat-trend ${trend === 'up' ? 'pos' : 'neg'}`}>
            <Icon name={trend === 'up' ? 'arrow-up' : 'arrow-down'} size={13} strokeWidth={2.4} />
          </span>
        )}
      </div>
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
