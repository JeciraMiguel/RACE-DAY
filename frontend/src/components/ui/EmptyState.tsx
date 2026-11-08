import type { ReactNode } from 'react';
import { Flag, type LucideIcon } from 'lucide-react';
import styles from './EmptyState.module.css';

export function EmptyState({ icon: Icon = Flag, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <Icon className={styles.icon} size={32} strokeWidth={1.5} aria-hidden="true" />
      <h3>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
