import type { ElementType, HTMLAttributes } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Lifts on hover/focus: use for cards that are links. */
  interactive?: boolean;
}

export function Card({ as: Tag = 'div', interactive = false, className, ...rest }: CardProps) {
  return <Tag className={[styles.card, interactive ? styles.interactive : '', className].filter(Boolean).join(' ')} {...rest} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.body, className].filter(Boolean).join(' ')} {...rest} />;
}
