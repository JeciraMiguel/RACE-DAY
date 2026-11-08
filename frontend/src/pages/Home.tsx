import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Countdown } from '../components/Countdown';
import { EventCard } from '../components/EventCard';
import { buttonClass, Card, Skeleton } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';
import { api } from '../lib/api';
import { formatDateTime, localNaiveNow } from '../lib/format';
import type { Paged, RaceEvent } from '../lib/types';
import { usePageTitle } from '../lib/usePageTitle';
import styles from './Home.module.css';

const STEPS = [
  { title: 'Find your race', text: 'Browse upcoming events, compare distances and see how many spots are left.' },
  { title: 'Register in seconds', text: 'Pick a category and get your race number straight away.' },
  { title: 'Follow the results', text: 'See the leaderboard the moment organizers record finish times.' },
];

function NextRace({ event }: { event: RaceEvent }) {
  return (
    <Card className={styles.next}>
      <span className={styles.nextLabel}>Next race</span>
      <div>
        <h2 className={styles.nextTitle}>{event.title}</h2>
        <p className={styles.nextMeta}>{formatDateTime(event.eventDate)} · 📍 {event.venueName}</p>
      </div>
      <Countdown to={event.eventDate} />
      <Link to={`/events/${event.eventId}`} className={buttonClass('primary', 'md', true)}>View event</Link>
    </Card>
  );
}

export function Component() {
  usePageTitle();
  const { status } = useAuth();
  const [from] = useState(() => localNaiveNow()); // fixed for the life of the page so the query key is stable

  const { data, isPending } = useQuery({
    queryKey: ['events', 'upcoming', 'home'],
    queryFn: ({ signal }) => api<Paged<RaceEvent>>('/events', { query: { status: 'Published', from, pageSize: 4 }, signal }),
  });

  const upcoming = data?.items ?? [];
  const next = upcoming[0];
  const more = upcoming.slice(1);

  return (
    <div className="container">
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Race day starts here</p>
          <h1 className={styles.headline}>Find your next <em>start line</em></h1>
          <p className={styles.lead}>Discover races, register for the distance that suits you and follow the results as they happen.</p>
          <div className={styles.cta}>
            <Link to="/events" className={buttonClass('primary', 'lg')}>Browse events</Link>
            {status === 'anonymous' && <Link to="/register" className={buttonClass('secondary', 'lg')}>Create an account</Link>}
          </div>
        </div>

        {isPending ? (
          <Card className={styles.next} aria-busy="true">
            <Skeleton width={90} height={12} />
            <Skeleton height={28} />
            <Skeleton height={70} />
            <Skeleton height={44} />
          </Card>
        ) : next ? (
          <NextRace event={next} />
        ) : null}
      </section>

      {more.length > 0 && (
        <section className={styles.section} aria-labelledby="more-heading">
          <div className={styles.sectionHead}>
            <h2 id="more-heading">Coming up</h2>
            <Link to="/events">See all events →</Link>
          </div>
          <div className={styles.grid}>
            {more.map((event) => <EventCard key={event.eventId} event={event} />)}
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="how-heading">
        <div className={styles.sectionHead}><h2 id="how-heading">How it works</h2></div>
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.title}>
              <Card className={styles.step}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {status === 'anonymous' && (
        <section className={styles.band}>
          <h2>Ready to race?</h2>
          <p>Create a free account to register for events, keep track of your race numbers and see your results.</p>
          <Link to="/register" className={buttonClass('primary', 'lg')}>Join RaceDay</Link>
        </section>
      )}
    </div>
  );
}
