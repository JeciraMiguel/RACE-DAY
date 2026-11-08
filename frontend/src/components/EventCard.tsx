import { Link } from 'react-router-dom';
import { formatDateTime, formatMoney } from '../lib/format';
import { availability } from '../lib/eventState';
import { eventStatusTone } from '../lib/status';
import type { RaceEvent } from '../lib/types';
import { Badge, Card } from './ui';
import styles from './EventCard.module.css';

function Meta({ event }: { event: RaceEvent }) {
  const parts: string[] = [];
  if (event.categoryCount > 0) parts.push(`${event.categoryCount} ${event.categoryCount === 1 ? 'distance' : 'distances'}`);
  if (event.minEntryFee != null) parts.push(event.minEntryFee === 0 ? 'Free' : `from ${formatMoney(event.minEntryFee)}`);
  return parts.length > 0 ? <p className={styles.meta}>{parts.join(' · ')}</p> : null;
}

export function EventCard({ event }: { event: RaceEvent }) {
  const spots = event.status === 'Published' ? availability(event.spotsLeft) : 'open';

  return (
    <Card as="article" interactive>
      <Link to={`/events/${event.eventId}`} className={styles.link}>
        <div className={styles.banner}>
          {event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" /> : <div className={styles.placeholder} aria-hidden="true">▶</div>}
          <div className={styles.badges}>
            {event.status !== 'Published' && <Badge tone={eventStatusTone[event.status]}>{event.status}</Badge>}
            {spots === 'full' && <Badge tone="danger">Full</Badge>}
            {spots === 'few' && <Badge tone="warning">{event.spotsLeft === 1 ? '1 spot left' : `${event.spotsLeft} spots left`}</Badge>}
          </div>
        </div>
        <div className={styles.body}>
          <time className={styles.date} dateTime={event.eventDate}>{formatDateTime(event.eventDate)}</time>
          <h3 className={styles.title}>{event.title}</h3>
          <p className={styles.venue}>📍 {event.venueName}</p>
          {event.description && <p className={styles.description}>{event.description}</p>}
          <Meta event={event} />
        </div>
      </Link>
    </Card>
  );
}
