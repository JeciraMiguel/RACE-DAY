import type { CSSProperties } from 'react';
import styles from './Spinner.module.css';

export function Spinner({ size = 28, label = 'Loading', center = false }: { size?: number; label?: string; center?: boolean }) {
  const spinner = <span className={styles.spinner} style={{ '--size': `${size}px` } as CSSProperties} role="status" aria-label={label} />;
  return center ? <div className={styles.center}>{spinner}</div> : spinner;
}
