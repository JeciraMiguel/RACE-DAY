import type { CSSProperties } from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  value: number;
  max: number;
  /** Read by screen readers, e.g. "Registrations: 120 of 200". */
  label: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}

export function ProgressBar({ value, max, label, tone = 'accent' }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
      <div className={`${styles.fill} ${tone !== 'accent' ? styles[tone] : ''}`} style={{ '--pct': `${pct}%` } as CSSProperties} />
    </div>
  );
}
