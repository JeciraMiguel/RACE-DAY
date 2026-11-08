import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}

/** WAI-ARIA tabs: roving tabindex, arrow keys, Home and End. */
export function Tabs({ tabs, value, onChange, label }: TabsProps) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    onChange(tabs[target]!.id);
    refs.current[target]?.focus();
  }

  const active = tabs.find((tab) => tab.id === value) ?? tabs[0];

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[index] = el; }}
              id={`${base}-tab-${tab.id}`}
              role="tab"
              type="button"
              className={styles.tab}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div id={`${base}-panel-${active.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${active.id}`} className={styles.panel} tabIndex={0}>
          {active.content}
        </div>
      )}
    </div>
  );
}
