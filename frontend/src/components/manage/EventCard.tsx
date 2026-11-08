import { Link } from 'react-router-dom';
import { eventCapacity } from '../../lib/manageInsights';
import { formatDateTime } from '../../lib/format';
import { eventStatusTone } from '../../lib/status';
import type { RaceEvent } from '../../lib/types';
import { Badge, buttonClass, Card, ProgressBar } from '../ui';
import styles from './EventCard.module.css';

/** An event as seen by its organizer: where it stands, how full it is, and the next useful step. */
export function ManageEventCard({ event, now = new Date() }: { event: RaceEvent; now?: Date }) {
  const capacity = eventCapacity(event);
  const started = new Date(event.eventDate) <= now;
  const full = capacity !== null && event.registeredCount >= capacity;

  return (
    <Card as="article" className={styles.card} interactive>
      <div className={styles.thumb}>
        {event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" /> : <div className={styles.placeholder} aria-hidden="true">▶</div>}
        <Badge tone={eventStatusTone[event.status]} className={styles.badge}>{event.status}</Badge>
      </div>

      <div className={styles.body}>
        <div>
          <h3 className={styles.title}><Link to={`/manage/events/${event.eventId}`}>{event.title}</Link></h3>
          <p className={styles.meta}>
            <time dateTime={event.eventDate}>{formatDateTime(event.eventDate)}</time> · {event.venueName}
          </p>
        </div>

        <div className={styles.progress}>
          <div className={styles.progressText}>
            <span>Registered</span>
            <span><strong>{event.registeredCount}</strong>{capacity !== null ? ` / ${capacity}` : ''}</span>
          </div>
          {capacity !== null && <ProgressBar value={event.registeredCount} max={capacity} label={`Registrations for ${event.title}: ${event.registeredCount} of ${capacity}`} tone={full ? 'warning' : 'accent'} />}
        </div>
      </div>

      <div className={styles.footer}>
        <Link to={`/manage/events/${event.eventId}`} className={buttonClass('secondary', 'sm')}>Manage</Link>
        {event.status !== 'Draft' && started && (
          <Link to={`/manage/events/${event.eventId}/results`} className={buttonClass('ghost', 'sm')}>Results</Link>
        )}
        {event.status !== 'Draft' && event.status !== 'Cancelled' && !started && (
          <Link to={`/manage/events/${event.eventId}/registrations`} className={buttonClass('ghost', 'sm')}>Registrations</Link>
        )}
        {event.status !== 'Draft' && (
          <Link to={`/events/${event.eventId}`} className={buttonClass('ghost', 'sm')} aria-label={`View the public page of ${event.title}`}>View</Link>
        )}
      </div>
    </Card>
  );
}
