import { CalendarDays, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ManageEventCard } from '../../components/manage/EventCard';
import { Button, buttonClass, Card, EmptyState, Input, Pagination, SegmentedControl, Skeleton } from '../../components/ui';
import { useAuth } from '../../features/auth/useAuth';
import { api, ApiError } from '../../lib/api';
import { attentionItems } from '../../lib/manageInsights';
import type { EventStatus, Paged, RaceEvent, Stats } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './Dashboard.module.css';
import manage from './Manage.module.css';

const PAGE_SIZE = 9;
const STATUSES: EventStatus[] = ['Draft', 'Published', 'Completed', 'Cancelled'];

function CardsSkeleton() {
  return (
    <div className={styles.grid} aria-busy="true" aria-label="Loading events">
      {[0, 1, 2].map((i) => (
        <Card key={i} className={styles.skeletonCard}>
          <Skeleton height={130} radius={0} />
          <div className={styles.skeletonBody}><Skeleton width="70%" height={22} /><Skeleton width="50%" height={14} /><Skeleton height={8} /></div>
        </Card>
      ))}
    </div>
  );
}

export function Component() {
  usePageTitle('Manage events');
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as EventStatus) : '';
  const page = Math.max(Number(params.get('page')) || 1, 1);

  const [draft, setDraft] = useState(search);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (draft !== search) setParams((p) => { const n = new URLSearchParams(p); if (draft) n.set('q', draft); else n.delete('q'); n.delete('page'); return n; }, { replace: true });
    }, 300);
    return () => window.clearTimeout(id);
  }, [draft, search, setParams]);

  // Admins see every event; organizers only their own
  const mine = isAdmin ? undefined : true;

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: ({ signal }) => api<Stats>('/stats', { signal }), enabled: isAdmin });

  // Everything the organizer has (up to 100): feeds "needs attention" and the counts on the status filter
  const { data: everything } = useQuery({
    queryKey: ['manage-events', 'overview', { isAdmin }],
    queryFn: ({ signal }) => api<Paged<RaceEvent>>('/events', { query: { mine, pageSize: 100 }, signal }),
  });

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['manage-events', { search, status, page, isAdmin }],
    queryFn: ({ signal }) => api<Paged<RaceEvent>>('/events', { query: { search, status, page, pageSize: PAGE_SIZE, mine }, signal }),
    placeholderData: keepPreviousData,
  });

  const all = everything?.items ?? [];
  const complete = !!everything && everything.totalCount === everything.items.length;
  const counts = (s: EventStatus | '') => (complete ? (s ? all.filter((e) => e.status === s).length : all.length) : undefined);
  const attention = attentionItems(all);

  const setStatus = (value: string) => setParams((p) => { const n = new URLSearchParams(p); if (value) n.set('status', value); else n.delete('status'); n.delete('page'); return n; });

  return (
    <>
      {isAdmin && stats && (
        <section className={manage.stats} aria-label="Platform overview">
          <Card className={manage.stat}><span className={manage.statLabel}>Published events</span><span className={manage.statValue}>{stats.eventsByStatus.Published}</span></Card>
          <Card className={manage.stat}><span className={manage.statLabel}>Draft events</span><span className={manage.statValue}>{stats.eventsByStatus.Draft}</span></Card>
          <Card className={manage.stat}><span className={manage.statLabel}>Registrations</span><span className={manage.statValue}>{stats.confirmedRegistrations}</span></Card>
          <Card className={manage.stat}><span className={manage.statLabel}>Results recorded</span><span className={manage.statValue}>{stats.resultsRecorded}</span></Card>
          <Card className={manage.stat}><span className={manage.statLabel}>Users</span><span className={manage.statValue}>{stats.users}</span></Card>
        </section>
      )}

      {attention.length > 0 ? (
        <section className={styles.attention} aria-label="Needs your attention">
          {attention.map((item) => (
            <Card key={item.id} as="div" interactive className={`${styles[item.tone]}`}>
              <Link to={item.href} className={styles.item}>
                <span className={styles.count} aria-hidden="true">{item.count}</span>
                <span className={styles.itemText}>
                  <span className={styles.itemTitle}><span className="visually-hidden">{item.count} · </span>{item.title}</span>
                  <span className={styles.itemHint}>{item.hint}</span>
                </span>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </Link>
            </Card>
          ))}
        </section>
      ) : all.length > 0 ? (
        <p className={styles.caughtUp} role="status">✓ You are all caught up: nothing needs your attention right now.</p>
      ) : null}

      <div className={styles.filters}>
        <div className={styles.search}>
          <Input label="Search events" type="search" placeholder="Name or description" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <SegmentedControl
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={[{ value: '', label: 'All', count: counts('') }, ...STATUSES.map((s) => ({ value: s, label: s, count: counts(s) }))]}
        />
        <span className={manage.spacer} />
        <Link to="/manage/events/new" className={buttonClass()}>New event</Link>
      </div>

      {error ? (
        <EmptyState icon={TriangleAlert} title="We could not load the events" description={error instanceof ApiError ? error.detail : undefined} action={<Button onClick={() => void refetch()}>Try again</Button>} />
      ) : isPending ? (
        <CardsSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={search || status ? 'No events match your filters' : 'No events yet'}
          description={search || status ? 'Try clearing the search or the status filter.' : 'Create your first event, add categories and publish it.'}
          action={!search && !status ? <Link to="/manage/events/new" className={buttonClass()}>Create an event</Link> : undefined}
        />
      ) : (
        <div style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity var(--dur) var(--ease)' }}>
          <div className={styles.grid}>{data.items.map((event) => <ManageEventCard key={event.eventId} event={event} />)}</div>
          <Pagination page={data.page} pageCount={Math.ceil(data.totalCount / data.pageSize)} onPageChange={(next) => setParams((p) => { const n = new URLSearchParams(p); n.set('page', String(next)); return n; })} />
        </div>
      )}
    </>
  );
}
