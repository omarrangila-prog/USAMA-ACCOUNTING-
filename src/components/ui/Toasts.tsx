import { useToast, type ToastKind } from '@/store/toast';
import { Icon, type IconName } from './Icon';
import './toasts.css';

const iconFor: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'close',
  info: 'info',
  warning: 'warning',
};

export function Toasts() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="toast-stack no-print">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">
            <Icon name={iconFor[t.kind]} size={15} strokeWidth={2.4} />
          </span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
