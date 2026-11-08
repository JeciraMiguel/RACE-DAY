import { Ban, Compass, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EventStepper } from '../../components/manage/EventStepper';
import { SubNav } from '../../components/SubNav';
import { ActionMenu, Badge, Button, buttonClass, ConfirmDialog, EmptyState, Skeleton, useToast } from '../../components/ui';
import { useAuth } from '../../features/auth/useAuth';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { eventStatusTone } from '../../lib/status';
import type { EventDetail, ResultRow } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './EventManageLayout.module.css';

type Action = 'publish' | 'cancel' | 'complete' | 'delete';

const CONFIRM: Record<Exclude<Action, 'publish'>, { title: string; message: string; label: string }> = {
  cancel: { title: 'Cancel this event?', message: 'Participants will see it as cancelled and nobody can register. This cannot be undone.', label: 'Cancel event' },
  complete: { title: 'Mark as completed?', message: 'Use this once the results are final. Registration and editing close.', label: 'Mark completed' },
  delete: { title: 'Delete this event?', message: 'The event and its categories are removed for good. Events with registrations cannot be deleted.', label: 'Delete event' },
};

export function Component() {
  const { id } = useParams();
  const eventId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, hasRole } = useAuth();
  const [confirm, setConfirm] = useState<Exclude<Action, 'publish'> | null>(null);

  const { data: event, isPending, error } = useQuery({
    queryKey: ['event', eventId],
    queryFn: ({ signal }) => api<EventDetail>(`/events/${eventId}`, { signal }),
    enabled: Number.isInteger(eventId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  // How many runners already have a result: shown on the Results tab
  const { data: results } = useQuery({
    queryKey: ['event-results', eventId],
    queryFn: ({ signal }) => api<ResultRow[]>(`/results/event/${eventId}`, { signal }),
    enabled: !!event && event.status !== 'Draft',
  });

  usePageTitle(event ? `Manage · ${event.title}` : 'Manage event');

  const run = useMutation({
    mutationFn: async (action: Action) => {
      if (action === 'delete') await api(`/events/${eventId}`, { method: 'DELETE' });
      else await api(`/events/${eventId}/${action}`, { method: 'POST' });
      return action;
    },
    onSuccess: (action) => {
      const done: Record<Action, string> = { publish: 'Event published.', cancel: 'Event cancelled.', complete: 'Event marked as completed.', delete: 'Event deleted.' };
      toast.success(done[action]);
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['manage-events'] });
      if (action === 'delete') {
        queryClient.removeQueries({ queryKey: ['event', eventId] });
        navigate('/manage', { replace: true });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'That action failed.'),
  });

  if (!Number.isInteger(eventId) || (error instanceof ApiError && error.status === 404)) {
    return <EmptyState icon={Compass} title="Event not found" description="It may have been deleted." action={<Link to="/manage" className={buttonClass()}>Back to events</Link>} />;
  }
  if (error) return <EmptyState icon={TriangleAlert} title="We could not load this event" description={error instanceof ApiError ? error.detail : undefined} action={<Link to="/manage" className={buttonClass()}>Back to events</Link>} />;
  if (isPending) return <div aria-busy="true" aria-label="Loading event" style={{ display: 'grid', gap: '1rem' }}><Skeleton width="50%" height={40} /><Skeleton height={44} /></div>;

  const isAdmin = hasRole('Admin');
  if (!isAdmin && event.organizerId !== user?.userId) {
    return <EmptyState icon={Ban} title="This is not your event" description="Organizers can only manage the events they created." action={<Link to="/manage" className={buttonClass()}>Back to my events</Link>} />;
  }

  const isDraft = event.status === 'Draft';
  const isPublished = event.status === 'Published';
  const future = new Date(event.eventDate) > new Date();
  const base = `/manage/events/${event.eventId}`;
  const registered = event.categories.reduce((sum, c) => sum + c.registeredCount, 0);

  const menuItems = [
    ...(isDraft || isPublished ? [{ label: 'Cancel event', danger: true, onSelect: () => setConfirm('cancel') }] : []),
    ...(isAdmin ? [{ label: 'Delete event', danger: true, onSelect: () => setConfirm('delete') }] : []),
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link to="/manage">Events</Link><span aria-hidden="true">/</span><span aria-current="page">{event.title}</span>
      </nav>

      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>{event.title}</h2>
          <p className={styles.meta}>
            <Badge tone={eventStatusTone[event.status]}>{event.status}</Badge> {formatDateTime(event.eventDate)} · {event.venueName}
          </p>
        </div>

        <div className={styles.actions}>
          {!isDraft && <Link to={`/events/${event.eventId}`} className={buttonClass('secondary', 'sm')}>Public page</Link>}
          {isDraft && <Button size="sm" loading={run.isPending && run.variables === 'publish'} onClick={() => run.mutate('publish')}>Publish</Button>}
          {isPublished && <Button size="sm" onClick={() => setConfirm('complete')}>Mark completed</Button>}
          {menuItems.length > 0 && <ActionMenu label="More actions" items={menuItems} />}
        </div>
      </header>

      <div className={styles.progress}>
        <EventStepper status={event.status} />
        {isDraft && (
          <ul className={styles.readiness} aria-label="Ready to publish?">
            <li className={`${styles.chip} ${event.categories.length > 0 ? styles.ok : styles.todo}`}>{event.categories.length > 0 ? '✓' : '○'} At least one category</li>
            <li className={`${styles.chip} ${future ? styles.ok : styles.todo}`}>{future ? '✓' : '○'} The event date is in the future</li>
          </ul>
        )}
      </div>

      <SubNav
        label="Event sections"
        items={[
          { to: base, label: 'Details', end: true },
          { to: `${base}/categories`, label: `Categories (${event.categories.length})` },
          { to: `${base}/registrations`, label: `Registrations (${registered})` },
          { to: `${base}/results`, label: results && registered > 0 ? `Results (${results.length}/${registered})` : 'Results' },
        ]}
      />

      <Outlet context={{ event }} />

      {confirm && (
        <ConfirmDialog
          open
          danger={confirm !== 'complete'}
          title={CONFIRM[confirm].title}
          message={CONFIRM[confirm].message}
          confirmLabel={CONFIRM[confirm].label}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await run.mutateAsync(confirm);
            } catch {
              // reported through the toast
            }
          }}
        />
      )}
    </>
  );
}
