import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { EventCard } from '../components/EventCard';
import { Button, Card, EmptyState, Input, PageHeader, Pagination, Select, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { localNaiveNow } from '../lib/format';
import type { Paged, RaceEvent } from '../lib/types';
import { usePageTitle } from '../lib/usePageTitle';
import styles from './Events.module.css';

const PAGE_SIZE = 9;

type When = 'upcoming' | 'past' | 'all';
const WHEN_LABEL: Record<When, string> = { upcoming: 'Upcoming', past: 'Past', all: 'All' };

function EventsSkeleton() {
  return (
    <div className={styles.grid} aria-busy="true" aria-label="Loading events">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className={styles.skeletonCard}>
          <Skeleton height={160} radius={0} />
          <div className={styles.skeletonBody}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="80%" height={22} />
            <Skeleton width="55%" height={14} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function Component() {
  usePageTitle('Events');
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const whenParam = params.get('when');
  const when: When = whenParam === 'past' || whenParam === 'all' ? whenParam : 'upcoming';
  const [now] = useState(() => localNaiveNow());
  const page = Math.max(Number(params.get('page')) || 1, 1);

  // The URL is the source of truth; the input debounces what it writes there
  const [draft, setDraft] = useState(search);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (draft !== search) setParams((p) => { const next = new URLSearchParams(p); if (draft) next.set('q', draft); else next.delete('q'); next.delete('page'); return next; }, { replace: true });
    }, 300);
    return () => window.clearTimeout(id);
  }, [draft, search, setParams]);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['events', { search, page, when }],
    queryFn: ({ signal }) =>
      api<Paged<RaceEvent>>('/events', {
        query: {
          search,
          page,
          pageSize: PAGE_SIZE,
          from: when === 'upcoming' ? now : undefined,
          to: when === 'past' ? now : undefined,
          newestFirst: when === 'past' ? true : undefined,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const pageCount = data ? Math.ceil(data.totalCount / data.pageSize) : 0;

  return (
    <div className="container">
      <PageHeader title="Events" subtitle="Find a race, pick a distance and get on the start list." />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input label="Search events" type="search" placeholder="Name or description" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <div className={styles.when}>
          <Select
            label="When"
            value={when}
            onChange={(e) => setParams((p) => { const next = new URLSearchParams(p); if (e.target.value === 'upcoming') next.delete('when'); else next.set('when', e.target.value); next.delete('page'); return next; })}
          >
            {(Object.keys(WHEN_LABEL) as When[]).map((key) => <option key={key} value={key}>{WHEN_LABEL[key]}</option>)}
          </Select>
        </div>
        {data && <p className={styles.count} aria-live="polite">{data.totalCount} {data.totalCount === 1 ? 'event' : 'events'}</p>}
      </div>

      {error ? (
        <EmptyState
          icon={TriangleAlert}
          title="We could not load the events"
          description={error instanceof ApiError ? error.detail : 'Something went wrong.'}
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      ) : isPending ? (
        <EventsSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={search ? 'No events match your search' : 'No events yet'}
          description={search ? 'Try a different name or clear the search.' : when === 'past' ? 'There are no past events to show.' : 'Check back soon: new races are added regularly.'}
          action={search ? <Button variant="secondary" onClick={() => setDraft('')}>Clear search</Button> : undefined}
        />
      ) : (
        <>
          <div className={`${styles.grid} ${isFetching ? styles.fading : ''}`}>
            {data.items.map((event) => <EventCard key={event.eventId} event={event} />)}
          </div>
          <Pagination
            page={data.page}
            pageCount={pageCount}
            onPageChange={(next) => setParams((p) => { const n = new URLSearchParams(p); n.set('page', String(next)); return n; })}
          />
        </>
      )}
    </div>
  );
}
