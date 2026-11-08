import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export function Skeleton({ width = '100%', height = 16, radius = 6 }: { width?: number | string; height?: number | string; radius?: number }) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className={styles.skeleton} style={style} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}
