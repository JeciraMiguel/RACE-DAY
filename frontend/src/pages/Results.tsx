import { ClipboardList, Compass, SearchX, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MEDALS, Podium } from '../components/Podium';
import { Badge, DataTable, EmptyState, Input, PageHeader, Skeleton, Tabs, buttonClass, type Column } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { hasStarted } from '../lib/eventState';
import { durationToMs, formatDuration, formatGap } from '../lib/format';
import { resultStatusTone } from '../lib/status';
import type { EventDetail, ResultRow } from '../lib/types';
import { usePageTitle } from '../lib/usePageTitle';
import styles from './Results.module.css';

const LIVE_REFRESH_MS = 30_000;

function matches(row: ResultRow, term: string): boolean {
  if (!term) return true;
  const needle = term.trim().toLowerCase().replace(/^#/, '');
  return row.participantName.toLowerCase().includes(needle) || String(row.raceNumber) === needle;
}

/** Finishers by rank, then DNF/DNS/DSQ by bib. */
function sortRows(rows: ResultRow[]): ResultRow[] {
  return [...rows].sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank || a.raceNumber - b.raceNumber;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;
    return a.raceNumber - b.raceNumber;
  });
}

function CategoryResults({ rows, search }: { rows: ResultRow[]; search: string }) {
  const sorted = useMemo(() => sortRows(rows), [rows]);
  const finishers = sorted.filter((r) => r.status === 'Finished' && r.rank != null);
  const leaderMs = finishers[0]?.finishTime ? durationToMs(finishers[0].finishTime) : NaN;
  const visible = sorted.filter((r) => matches(r, search));

  if (sorted.length === 0) {
    return <EmptyState icon={Timer} title="No results yet" description="Times appear here as soon as the organizer records them." />;
  }

  const columns: Column<ResultRow>[] = [
    {
      key: 'rank',
      header: 'Rank',
      numeric: true,
      render: (r) => (r.rank != null ? <span className={styles.rank}>{r.rank <= 3 && <span aria-hidden="true">{MEDALS[r.rank - 1]}</span>}{r.rank}</span> : '—'),
    },
    { key: 'bib', header: 'Bib', numeric: true, render: (r) => r.raceNumber },
    { key: 'name', header: 'Runner', render: (r) => <span className={styles.name}>{r.participantName}</span> },
    {
      key: 'time',
      header: 'Time',
      numeric: true,
      render: (r) => (r.status === 'Finished' && r.finishTime ? <span className="tnum">{formatDuration(r.finishTime)}</span> : <Badge tone={resultStatusTone[r.status]}>{r.status}</Badge>),
    },
    {
      key: 'gap',
      header: 'Gap',
      numeric: true,
      render: (r) =>
        r.status === 'Finished' && r.finishTime && r.rank !== 1 && !Number.isNaN(leaderMs)
          ? <span className={`${styles.gap} tnum`}>{formatGap(durationToMs(r.finishTime), leaderMs)}</span>
          : '',
    },
  ];

  return (
    <>
      {!search && <Podium finishers={finishers} />}
      <p className={styles.summary}>{finishers.length} {finishers.length === 1 ? 'finisher' : 'finishers'}{sorted.length > finishers.length ? ` · ${sorted.length - finishers.length} did not finish or start` : ''}</p>
      {visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No runner matches your search" description="Try a name or a bib number." />
      ) : (
        <DataTable caption="Results" columns={columns} rows={visible} rowKey={(r) => r.resultId} />
      )}
    </>
  );
}

export function Component() {
  const { id } = useParams();
  const eventId = Number(id);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<string>('');

  const { data: event, isPending: eventPending, error: eventError } = useQuery({
    queryKey: ['event', eventId],
    queryFn: ({ signal }) => api<EventDetail>(`/events/${eventId}`, { signal }),
    enabled: Number.isInteger(eventId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  // Published events that already started are "live": keep the board fresh
  const live = !!event && event.status === 'Published' && hasStarted(event);

  const { data: results, isPending: resultsPending } = useQuery({
    queryKey: ['results', eventId],
    queryFn: ({ signal }) => api<ResultRow[]>(`/results/event/${eventId}`, { signal }),
    enabled: !!event,
    refetchInterval: live ? LIVE_REFRESH_MS : false,
  });

  usePageTitle(event ? `Results · ${event.title}` : 'Results');

  if (eventError || (!eventPending && !event)) {
    return (
      <div className="container" style={{ paddingBlock: '3rem' }}>
        <EmptyState icon={Compass} title="Results not found" description="This event does not exist or is not published." action={<Link to="/events" className={buttonClass()}>Browse events</Link>} />
      </div>
    );
  }

  if (eventPending || !event || resultsPending) {
    return (
      <div className="container" aria-busy="true" aria-label="Loading results">
        <div style={{ paddingBlock: '2rem', display: 'grid', gap: '1rem' }}>
          <Skeleton width="50%" height={40} />
          <Skeleton height={44} />
          <Skeleton height={220} radius={16} />
        </div>
      </div>
    );
  }

  const rowsByCategory = new Map<number, ResultRow[]>();
  for (const row of results ?? []) rowsByCategory.set(row.categoryId, [...(rowsByCategory.get(row.categoryId) ?? []), row]);

  const categories = event.categories;
  const activeTab = categories.some((c) => String(c.categoryId) === tab) ? tab : String(categories[0]?.categoryId ?? '');

  return (
    <div className="container">
      <Link to={`/events/${event.eventId}`} className={styles.back}>← {event.title}</Link>
      <PageHeader title="Results" subtitle={event.title} actions={live ? <span className={styles.live}>Live · updates every 30 s</span> : undefined} />

      {categories.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No categories" description="This event has no categories, so there are no results to show." />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <Input label="Find a runner" type="search" placeholder="Name or bib number" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {categories.length === 1 ? (
            <CategoryResults rows={rowsByCategory.get(categories[0]!.categoryId) ?? []} search={search} />
          ) : (
            <Tabs
              label="Categories"
              value={activeTab}
              onChange={setTab}
              tabs={categories.map((c) => ({
                id: String(c.categoryId),
                label: `${c.name}${rowsByCategory.get(c.categoryId)?.length ? ` (${rowsByCategory.get(c.categoryId)!.length})` : ''}`,
                content: <CategoryResults rows={rowsByCategory.get(c.categoryId) ?? []} search={search} />,
              }))}
            />
          )}
        </>
      )}
    </div>
  );
}
