import { ClipboardList, Compass, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Countdown } from '../components/Countdown';
import { RegistrationSuccess } from '../components/RegistrationSuccess';
import { Badge, Button, buttonClass, Card, ConfirmDialog, DataTable, EmptyState, Skeleton, SkeletonText, useToast, type Column } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';
import { api, ApiError } from '../lib/api';
import { availability, eligibilityLabel, hasStarted, registrationState } from '../lib/eventState';
import { formatDateTime, formatMoney, formatTime } from '../lib/format';
import { eventStatusTone } from '../lib/status';
import type { Category, EventDetail, Registration, Venue } from '../lib/types';
import { usePageTitle } from '../lib/usePageTitle';
import styles from './EventDetail.module.css';

function DetailSkeleton() {
  return (
    <div className="container" aria-busy="true" aria-label="Loading event">
      <div className={styles.skeletonStack}>
        <Skeleton height={220} radius={16} />
        <Skeleton width="60%" height={44} />
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

export function Component() {
  const { id } = useParams();
  const eventId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { status: authStatus } = useAuth();

  const [target, setTarget] = useState<Category | null>(null);
  const [success, setSuccess] = useState<Registration | null>(null);

  const { data: event, isPending, error } = useQuery({
    queryKey: ['event', eventId],
    queryFn: ({ signal }) => api<EventDetail>(`/events/${eventId}`, { signal }),
    enabled: Number.isInteger(eventId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  const { data: venue } = useQuery({
    queryKey: ['venue', event?.venueId],
    queryFn: ({ signal }) => api<Venue>(`/venues/${event!.venueId}`, { signal }),
    enabled: !!event,
  });

  // The signed-in user's own registrations, to show "Registered" instead of a button
  const signedIn = authStatus === 'authenticated';
  const { data: mine } = useQuery({
    queryKey: ['my-registrations'],
    queryFn: ({ signal }) => api<Registration[]>('/registrations', { signal }),
    enabled: signedIn,
  });
  const registrationByCategory = new Map((mine ?? []).filter((r) => r.status === 'Confirmed').map((r) => [r.categoryId, r]));

  const register = useMutation({
    mutationFn: (categoryId: number) => api<Registration>('/registrations', { method: 'POST', body: { categoryId } }),
    onSuccess: (registration) => {
      setSuccess(registration);
      void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['my-registrations'] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'Could not complete your registration.'),
  });

  usePageTitle(event?.title, { description: event?.description || (event ? `${event.title} at ${event.venueName}` : undefined), image: event?.imageUrl });

  if (!Number.isInteger(eventId)) return <NotFoundState />;
  if (isPending) return <DetailSkeleton />;
  if (error || !event) {
    return error instanceof ApiError && error.status === 404 ? (
      <NotFoundState />
    ) : (
      <div className="container" style={{ paddingBlock: '3rem' }}>
        <EmptyState icon={TriangleAlert} title="We could not load this event" description={error instanceof ApiError ? error.detail : undefined} action={<Link to="/events" className={buttonClass()}>Back to events</Link>} />
      </div>
    );
  }

  const state = registrationState(event);
  const showResults = event.status === 'Completed' || (event.status === 'Published' && hasStarted(event));

  function startRegistration(category: Category) {
    if (!signedIn) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setTarget(category);
  }

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Category', render: (c) => <strong>{c.name}</strong> },
    { key: 'distance', header: 'Distance', render: (c) => (c.distanceKm != null ? `${c.distanceKm} km` : '—') },
    { key: 'start', header: 'Start', render: (c) => (c.startTime ? formatTime(c.startTime) : '—') },
    { key: 'fee', header: 'Entry', numeric: true, render: (c) => <span className={styles.fee}>{c.entryFee === 0 ? 'Free' : formatMoney(c.entryFee)}</span> },
    { key: 'who', header: 'Who can enter', render: (c) => eligibilityLabel(c) },
    {
      key: 'spots',
      header: 'Spots',
      numeric: true,
      render: (c) => {
        const level = availability(c.spotsLeft);
        if (c.spotsLeft === null) return <span className={styles.muted}>Unlimited</span>;
        return <Badge tone={level === 'full' ? 'danger' : level === 'few' ? 'warning' : 'success'}>{level === 'full' ? 'Full' : `${c.spotsLeft} left`}</Badge>;
      },
    },
    {
      key: 'action',
      header: 'Register',
      render: (c) => {
        const registration = registrationByCategory.get(c.categoryId);
        if (registration) return <span className={styles.registered}><Badge tone="success">Registered</Badge> <span className="tnum">#{registration.raceNumber}</span></span>;
        if (state.kind !== 'open') return <span className={styles.muted}>—</span>;
        if (c.spotsLeft === 0) return <span className={styles.muted}>Full</span>;
        return <Button size="sm" onClick={() => startRegistration(c)} aria-label={`Register for ${c.name}`}>Register</Button>;
      },
    },
  ];

  return (
    <div className="container">
      <Link to="/events" className={styles.back}>← All events</Link>

      <div className={styles.banner}>
        {event.imageUrl ? <img src={event.imageUrl} alt="" /> : <div className={styles.placeholder} aria-hidden="true">▶</div>}
        {event.status !== 'Published' && (
          <div className={styles.bannerBadges}><Badge tone={eventStatusTone[event.status]}>{event.status}</Badge></div>
        )}
      </div>

      <header className={styles.head}>
        <time className={styles.when} dateTime={event.eventDate}>{formatDateTime(event.eventDate)}</time>
        <h1 className={styles.title}>{event.title}</h1>
        {venue?.timeZone && <p className={styles.muted}>Times are local to the venue ({venue.timeZone.replace(/_/g, ' ')}).</p>}
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          {event.description && (
            <section className={styles.section} aria-labelledby="about-heading">
              <h2 id="about-heading">About</h2>
              <p className={styles.about}>{event.description}</p>
            </section>
          )}

          <section className={styles.section} aria-labelledby="categories-heading">
            <h2 id="categories-heading">Categories</h2>
            {event.categories.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No categories yet" description="The organizer has not added any distances to this event." />
            ) : (
              <DataTable caption={`Categories for ${event.title}`} columns={columns} rows={event.categories} rowKey={(c) => c.categoryId} />
            )}
          </section>

          <section className={styles.section} aria-labelledby="venue-heading">
            <h2 id="venue-heading">Venue</h2>
            <div className={styles.venue}>
              <strong>{event.venueName}</strong>
              {venue ? (
                <>
                  <span className={styles.muted}>{[venue.location, venue.city].filter(Boolean).join(' · ')}</span>
                  {venue.description && <p className={styles.about}>{venue.description}</p>}
                </>
              ) : (
                <Skeleton width="50%" height={14} />
              )}
            </div>
          </section>
        </div>

        <Card as="aside" className={styles.aside} aria-label="Registration">
          <RegistrationPanel event={event} state={state} showResults={showResults} />
        </Card>
      </div>

      <RegistrationSuccess registration={success} onClose={() => setSuccess(null)} />

      <ConfirmDialog
        open={target !== null}
        title="Confirm your registration"
        message={target ? `Register for ${target.name} at ${event.title}?${target.entryFee > 0 ? ` The entry fee is ${formatMoney(target.entryFee)}, paid to the organizer.` : ''}` : ''}
        confirmLabel="Register"
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          try {
            await register.mutateAsync(target.categoryId);
          } catch {
            // already reported through the toast in onError
          }
        }}
      />
    </div>
  );
}

function RegistrationPanel({ event, state, showResults }: { event: EventDetail; state: ReturnType<typeof registrationState>; showResults: boolean }) {
  const heading: Record<typeof state.kind, string> = {
    open: 'Registration is open',
    'not-open-yet': 'Registration opens soon',
    closed: 'Registration closed',
    started: 'The race is under way',
    cancelled: 'This event was cancelled',
    completed: 'This event is over',
    draft: 'Draft event',
  };

  return (
    <>
      <div className={styles.statusLine}>
        <span className={styles.statusTitle}>{heading[state.kind]}</span>
        {state.kind === 'open' && state.closesAt && <span className={styles.muted}>Closes {formatDateTime(state.closesAt)}</span>}
        {state.kind === 'not-open-yet' && <span className={styles.muted}>Opens {formatDateTime(state.opensAt)}</span>}
      </div>

      {(state.kind === 'open' || state.kind === 'not-open-yet' || state.kind === 'closed') && <Countdown to={event.eventDate} />}

      <dl className={styles.dl}>
        <div><dt>Date</dt><dd>{formatDateTime(event.eventDate)}</dd></div>
        <div><dt>Venue</dt><dd>{event.venueName}</dd></div>
        <div><dt>Categories</dt><dd>{event.categories.length}</dd></div>
      </dl>

      {state.kind === 'open' && <p className={styles.muted}>Choose a category in the table to register.</p>}

      {showResults && <Link to={`/events/${event.eventId}/results`} className={buttonClass('primary', 'md', true)}>View results</Link>}
    </>
  );
}

function NotFoundState() {
  return (
    <div className="container" style={{ paddingBlock: '3rem' }}>
      <EmptyState icon={Compass} title="Event not found" description="It may have been removed, or it is not published yet." action={<Link to="/events" className={buttonClass()}>Browse events</Link>} />
    </div>
  );
}
