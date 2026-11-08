import type { CSSProperties } from 'react';
import { initials } from '../../lib/format';
import styles from './Avatar.module.css';

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const style = { '--size': `${size}px` } as CSSProperties;
  if (src) return <img src={src} alt="" className={styles.avatar} style={style} />;
  return <span className={styles.avatar} style={style} aria-hidden="true">{initials(name)}</span>;
}
