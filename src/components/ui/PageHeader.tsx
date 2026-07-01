import type { ReactNode } from 'react';
import { useData } from '@/store/dataStore';
import { monthName } from '@/lib/utils';

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  const period = useData((s) => s.period);
  return (
    <div className="page-head animate-in">
      <div>
        <div className="page-title">{title}</div>
        <div className="page-sub">
          {subtitle ?? `${monthName(period.month)} ${period.year}`}
        </div>
      </div>
      {actions && <div className="page-head-actions no-print">{actions}</div>}
    </div>
  );
}
