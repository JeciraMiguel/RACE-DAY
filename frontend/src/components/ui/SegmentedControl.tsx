import { useId } from 'react';
import type { ReactNode } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Small number shown next to the label (e.g. how many items match). */
  count?: number;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: 'md' | 'lg';
}

/**
 * A row of mutually exclusive choices that are all visible, built on real radio inputs so the
 * browser provides the arrow-key behaviour and screen readers announce "n of m".
 */
export function SegmentedControl<T extends string>({ label, value, onChange, options, size = 'md' }: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`${styles.group} ${size === 'lg' ? styles.large : ''}`}>
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input type="radio" name={name} value={option.value} checked={option.value === value} disabled={option.disabled} onChange={() => onChange(option.value)} />
          <span className={styles.text}>
            {option.label}
            {/* the space keeps the accessible name readable: "Draft 2", not "Draft2" */}
            {option.count !== undefined && <>{' '}<span className={styles.count}>{option.count}</span></>}
          </span>
        </label>
      ))}
    </div>
  );
}
