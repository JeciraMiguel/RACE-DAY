import { countdownParts } from '../lib/countdown';
import { useNow } from '../lib/useNow';
import styles from './Countdown.module.css';

/** Ticking countdown. Screen readers get one static sentence instead of a changing number. */
export function Countdown({ to }: { to: string }) {
  const now = useNow(1000);
  const parts = countdownParts(new Date(to), now);

  if (parts.done) return <p className={styles.done}>The race has started</p>;

  const units: [number, string][] = [
    [parts.days, 'Days'],
    [parts.hours, 'Hours'],
    [parts.minutes, 'Min'],
    [parts.seconds, 'Sec'],
  ];

  return (
    <div className={styles.countdown} role="timer" aria-label={`Starts in ${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes`}>
      {units.map(([value, label]) => (
        <div key={label} className={styles.unit} aria-hidden="true">
          <span className={styles.value}>{String(value).padStart(2, '0')}</span>
          <span className={styles.label}>{label}</span>
        </div>
      ))}
    </div>
  );
}
