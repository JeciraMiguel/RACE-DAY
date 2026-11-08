import type { HTMLAttributes } from 'react';
import type { Tone } from '../../lib/status';
import styles from './Badge.module.css';

export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={[styles.badge, tone !== 'neutral' ? styles[tone] : '', className].filter(Boolean).join(' ')} {...rest} />;
}
