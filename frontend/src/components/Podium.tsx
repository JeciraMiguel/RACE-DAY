import { formatDuration } from '../lib/format';
import type { ResultRow } from '../lib/types';
import styles from './Podium.module.css';

export const MEDALS = ['🥇', '🥈', '🥉'] as const;

// Visual order on wide screens: silver, gold, bronze
const DISPLAY_ORDER: Record<number, number> = { 2: 0, 1: 1, 3: 2 };
const PLACE_CLASS: Record<number, string> = { 1: styles.first, 2: styles.second, 3: styles.third };
const MAX_SHOWN = 6;

/**
 * Everyone ranked 1-3 (ties share a place, so there can be more than three).
 * Renders nothing when nobody has finished.
 */
export function Podium({ finishers }: { finishers: ResultRow[] }) {
  const byRank = finishers
    .filter((r): r is ResultRow & { rank: number } => r.rank != null && r.rank >= 1 && r.rank <= 3)
    .sort((a, b) => a.rank - b.rank || a.raceNumber - b.raceNumber)
    .slice(0, MAX_SHOWN);

  if (byRank.length === 0) return null;

  // The classic 2nd - 1st - 3rd arrangement only works with exactly one runner per place;
  // with ties the places are simply listed in order
  const classic = byRank.length === 3 && byRank.every((r, i) => r.rank === i + 1);
  const medalists = classic ? [...byRank].sort((a, b) => DISPLAY_ORDER[a.rank]! - DISPLAY_ORDER[b.rank]!) : byRank;

  return (
    <ol className={styles.podium} aria-label="Podium">
      {medalists.map((row) => (
        <li key={row.resultId} className={`${styles.place} ${PLACE_CLASS[row.rank]}`}>
          <span className={styles.medal} aria-hidden="true">{MEDALS[row.rank - 1]}</span>
          <span className="visually-hidden">Position {row.rank}:</span>
          <span className={styles.name}>{row.participantName}</span>
          <span className={styles.time}>{row.finishTime ? formatDuration(row.finishTime) : '—'}</span>
          <span className={styles.bib}>Bib #{row.raceNumber}</span>
        </li>
      ))}
    </ol>
  );
}
