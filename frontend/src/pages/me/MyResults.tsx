import { Timer, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MEDALS } from '../../components/Podium';
import { Badge, Button, buttonClass, Card, DataTable, EmptyState, Skeleton, type Column } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatDuration, ordinal } from '../../lib/format';
import { resultStatusTone } from '../../lib/status';
import type { MyResult } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './MyResults.module.css';

export function Component() {
  usePageTitle('My results');

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['my-results'],
    queryFn: ({ signal }) => api<MyResult[]>('/results/mine', { signal }),
  });

  if (error) {
    return <EmptyState icon={TriangleAlert} title="We could not load your results" description={error instanceof ApiError ? error.detail : undefined} action={<Button onClick={() => void refetch()}>Try again</Button>} />;
  }
  if (isPending) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }} aria-busy="true" aria-label="Loading your results">
        <Skeleton height={84} radius={16} />
        <Skeleton height={200} radius={16} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Timer}
        title="No results yet"
        description="Once you finish a race and the organizer records your time, it shows up here."
        action={<Link to="/me/registrations" className={buttonClass()}>See my races</Link>}
      />
    );
  }

  const finished = data.filter((r) => r.status === 'Finished' && r.rank != null);
  const podiums = finished.filter((r) => r.rank! <= 3).length;
  const best = finished.length > 0 ? Math.min(...finished.map((r) => r.rank!)) : null;

  const columns: Column<MyResult>[] = [
    { key: 'event', header: 'Event', render: (r) => <span className={styles.event}><Link to={`/events/${r.eventId}/results`}>{r.eventTitle}</Link></span> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.eventDate) },
    { key: 'category', header: 'Category', render: (r) => r.categoryName },
    { key: 'bib', header: 'Bib', numeric: true, render: (r) => r.raceNumber },
    {
      key: 'time',
      header: 'Time',
      numeric: true,
      render: (r) => (r.status === 'Finished' && r.finishTime ? <span className="tnum">{formatDuration(r.finishTime)}</span> : <Badge tone={resultStatusTone[r.status]}>{r.status}</Badge>),
    },
    {
      key: 'rank',
      header: 'Place',
      numeric: true,
      render: (r) =>
        r.rank != null ? (
          <span className={styles.rank}>
            {r.rank <= 3 && <span aria-hidden="true">{MEDALS[r.rank - 1]}</span>}
            <strong>{ordinal(r.rank)}</strong>
            <span className={styles.of}>of {r.finishers}</span>
          </span>
        ) : '—',
    },
  ];

  return (
    <>
      <div className={styles.stats}>
        <Card className={styles.stat}><span className={styles.statLabel}>Races finished</span><span className={styles.statValue}>{finished.length}</span></Card>
        <Card className={styles.stat}><span className={styles.statLabel}>Podiums</span><span className={`${styles.statValue} ${podiums > 0 ? styles.gold : ''}`}>{podiums}</span></Card>
        <Card className={styles.stat}><span className={styles.statLabel}>Best place</span><span className={styles.statValue}>{best != null ? ordinal(best) : '—'}</span></Card>
      </div>
      <DataTable caption="My results" columns={columns} rows={data} rowKey={(r) => r.resultId} />
    </>
  );
}
