import { NavLink } from 'react-router-dom';
import styles from './SubNav.module.css';

export interface SubNavItem {
  to: string;
  label: string;
  /** Match the path exactly (needed for index-like links such as /manage). */
  end?: boolean;
}

/** Section navigation used inside a page (My RaceDay, Manage, an event's admin tabs). */
export function SubNav({ items, label, variant = 'tabs' }: { items: SubNavItem[]; label: string; variant?: 'tabs' | 'pills' }) {
  return (
    <nav className={`${styles.nav} ${variant === 'pills' ? styles.pills : ''}`} aria-label={label}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={styles.link}>{item.label}</NavLink>
      ))}
    </nav>
  );
}
