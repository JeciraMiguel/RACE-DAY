import { Fragment } from 'react';
import type { EventStatus } from '../../lib/types';
import styles from './EventStepper.module.css';

const STEPS: { status: EventStatus; label: string }[] = [
  { status: 'Draft', label: 'Draft' },
  { status: 'Published', label: 'Published' },
  { status: 'Completed', label: 'Completed' },
];

/** The life of an event in three steps; a cancelled event gets one clear marker instead. */
export function EventStepper({ status }: { status: EventStatus }) {
  if (status === 'Cancelled') return <p className={styles.cancelled}>✕ This event was cancelled</p>;

  const current = STEPS.findIndex((s) => s.status === status);

  return (
    <ol className={styles.steps} aria-label="Event progress">
      {STEPS.map((step, index) => {
        const state = index < current ? styles.done : index === current ? styles.current : '';
        return (
          <Fragment key={step.status}>
            {index > 0 && <li className={`${styles.line} ${index <= current ? styles.passed : ''}`} aria-hidden="true" />}
            <li className={`${styles.step} ${state}`} aria-current={index === current ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden="true">{index < current ? '✓' : index + 1}</span>
              {step.label}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
