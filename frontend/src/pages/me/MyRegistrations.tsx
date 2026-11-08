import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, buttonClass, Card, ConfirmDialog, EmptyState, Skeleton, Tabs, useToast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { registrationBucket, type RegistrationBucket } from '../../lib/eventState';
import { formatDateTime, formatMoney } from '../../lib/format';
import { paymentStatusTone } from '../../lib/status';
import type { Registration } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './MyRegistrations.module.css';

const TAB_LABEL: Record<RegistrationBucket, string> = { upcoming: 'Upcoming', past: 'Past', cancelled: 'Cancelled' };

const EMPTY: Record<RegistrationBucket, { title: string; description: string }> = {
  upcoming: { title: 'No upcoming races', description: 'Pick a distance and get on a start list.' },
  past: { title: 'No past races yet', description: 'Races you have taken part in will be listed here.' },
  cancelled: { title: 'Nothing cancelled', description: 'Cancelled registrations and cancelled events show up here.' },
};

function RegistrationCard({ registration, bucket, onCancel }: { registration: Registration; bucket: RegistrationBucket; onCancel: (r: Registration) => void }) {
  const eventCancelled = registration.eventStatus === 'Cancelled';

  return (
    <Card as="article" className={styles.card}>
      <div className={styles.bib}>
        <span className={styles.bibLabel}>Bib</span>
        <span className={styles.bibNumber}>{registration.raceNumber}</span>
      </div>

      <div className={styles.info}>
        <h3 className={styles.title}><Link to={`/events/${registration.eventId}`}>{registration.eventTitle}</Link></h3>
        <p className={styles.meta}>{registration.categoryName} · {formatDateTime(registration.eventDate)}</p>
        <div className={styles.badges}>
          {eventCancelled && <Badge tone="danger">Event cancelled</Badge>}
          {registration.status === 'Cancelled' && <Badge tone="danger">Registration cancelled</Badge>}
          {registration.status === 'Confirmed' && !eventCancelled && <Badge tone="success">Confirmed</Badge>}
          {registration.status === 'Confirmed' && <Badge tone={paymentStatusTone[registration.paymentStatus]}>Payment {registration.paymentStatus.toLowerCase()}</Badge>}
        </div>
        {registration.status === 'Confirmed' && registration.paymentStatus === 'Pending' && registration.entryFee > 0 && bucket === 'upcoming' && (
          <p className={styles.fee}>Entry fee {formatMoney(registration.entryFee)}: pay the organizer to complete your registration.</p>
        )}
      </div>

      <div className={styles.actions}>
        <Link to={`/events/${registration.eventId}`} className={buttonClass('secondary', 'sm')}>View event</Link>
        {registration.hasResult && <Link to={`/events/${registration.eventId}/results`} className={buttonClass('secondary', 'sm')}>Results</Link>}
        {registration.canCancel && <Button variant="ghost" size="sm" onClick={() => onCancel(registration)} aria-label={`Cancel registration for ${registration.eventTitle}`}>Cancel</Button>}
      </div>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className={styles.list} aria-busy="true" aria-label="Loading your registrations">
      {[0, 1, 2].map((i) => (
        <Card key={i} className={styles.skeletonCard}>
          <Skeleton width="45%" height={22} />
          <Skeleton width="70%" height={14} />
          <Skeleton width={120} height={22} radius={999} />
        </Card>
      ))}
    </div>
  );
}

export function Component() {
  usePageTitle('My races');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<RegistrationBucket>('upcoming');
  const [toCancel, setToCancel] = useState<Registration | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['my-registrations'],
    queryFn: ({ signal }) => api<Registration[]>('/registrations', { signal }),
  });

  const cancel = useMutation({
    mutationFn: (registration: Registration) => api(`/registrations/${registration.registrationId}`, { method: 'DELETE' }),
    // The card moves to "Cancelled" immediately; it comes back if the server refuses
    onMutate: async (registration) => {
      await queryClient.cancelQueries({ queryKey: ['my-registrations'] });
      const previous = queryClient.getQueryData<Registration[]>(['my-registrations']);
      queryClient.setQueryData<Registration[]>(['my-registrations'], (rows) =>
        rows?.map((r) => (r.registrationId === registration.registrationId ? { ...r, status: 'Cancelled', canCancel: false } : r)),
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Your registration was cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['my-registrations'] });
      void queryClient.invalidateQueries({ queryKey: ['event'] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err, _registration, context) => {
      if (context?.previous) queryClient.setQueryData(['my-registrations'], context.previous);
      toast.error(err instanceof ApiError ? err.detail : 'Could not cancel the registration.');
      void queryClient.invalidateQueries({ queryKey: ['my-registrations'] }); // the window may just have closed
    },
  });

  if (error) {
    return <EmptyState icon={TriangleAlert} title="We could not load your races" description={error instanceof ApiError ? error.detail : undefined} action={<Button onClick={() => void refetch()}>Try again</Button>} />;
  }
  if (isPending) return <ListSkeleton />;

  const buckets: Record<RegistrationBucket, Registration[]> = { upcoming: [], past: [], cancelled: [] };
  for (const registration of data) buckets[registrationBucket(registration)].push(registration);
  buckets.upcoming.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  buckets.past.sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  if (data.length === 0) {
    return (
      <EmptyState
        title="You have not registered for a race yet"
        description="Find an event, choose a distance and your race number is yours in seconds."
        action={<Link to="/events" className={buttonClass()}>Browse events</Link>}
      />
    );
  }

  return (
    <>
      <Tabs
        label="My races"
        value={tab}
        onChange={(id) => setTab(id as RegistrationBucket)}
        tabs={(Object.keys(TAB_LABEL) as RegistrationBucket[]).map((bucket) => ({
          id: bucket,
          label: `${TAB_LABEL[bucket]} (${buckets[bucket].length})`,
          content:
            buckets[bucket].length === 0 ? (
              <EmptyState
                title={EMPTY[bucket].title}
                description={EMPTY[bucket].description}
                action={bucket === 'upcoming' ? <Link to="/events" className={buttonClass()}>Browse events</Link> : undefined}
              />
            ) : (
              <div className={styles.list}>
                {buckets[bucket].map((r) => <RegistrationCard key={r.registrationId} registration={r} bucket={bucket} onCancel={setToCancel} />)}
              </div>
            ),
        }))}
      />

      <ConfirmDialog
        open={toCancel !== null}
        danger
        title="Cancel your registration?"
        message={toCancel ? `You will give up race number #${toCancel.raceNumber} for ${toCancel.categoryName} at ${toCancel.eventTitle}. You can register again while spots remain, but you will get a new number.` : ''}
        confirmLabel="Cancel registration"
        onClose={() => setToCancel(null)}
        onConfirm={async () => {
          if (!toCancel) return;
          try {
            await cancel.mutateAsync(toCancel);
          } catch {
            // reported through the toast in onError
          }
        }}
      />
    </>
  );
}
