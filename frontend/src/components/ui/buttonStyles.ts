import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Class names for anything that should look like a button, e.g. a router <Link>. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false): string {
  return [
    styles.button,
    variant !== 'primary' ? styles[variant] : '',
    size !== 'md' ? styles[size] : '',
    block ? styles.block : '',
  ]
    .filter(Boolean)
    .join(' ');
}
