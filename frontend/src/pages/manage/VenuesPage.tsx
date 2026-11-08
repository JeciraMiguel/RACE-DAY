import { MapPin, SearchX, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Skeleton, Textarea, useToast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import type { Venue, VenueInput } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './Manage.module.css';
import cards from './VenuesPage.module.css';

type Field = 'name' | 'location' | 'capacity' | 'timeZone';

/** IANA zones the browser knows, offered as suggestions; the server validates whatever is typed. */
function knownTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.('timeZone') ?? [];
}

const defaultTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';

function VenueModal({ venue, onClose }: { venue: Venue | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState({
    name: venue?.name ?? '',
    location: venue?.location ?? '',
    city: venue?.city ?? '',
    capacity: String(venue?.capacity ?? 0),
    description: venue?.description ?? '',
    timeZone: venue?.timeZone ?? defaultTimeZone(),
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (field: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body: VenueInput = {
        name: values.name.trim(),
        location: values.location.trim(),
        city: values.city.trim() || null,
        description: values.description.trim() || null,
        capacity: Number(values.capacity),
        timeZone: values.timeZone.trim() || null,
      };
      return venue ? api(`/venues/${venue.venueId}`, { method: 'PUT', body }) : api('/venues', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(venue ? 'Venue saved.' : 'Venue added.');
      void queryClient.invalidateQueries({ queryKey: ['venues'] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.detail : 'Could not save the venue.');
      if (err instanceof ApiError && /time ?zone/i.test(err.detail)) setErrors({ timeZone: 'Use an IANA name such as Africa/Johannesburg.' });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found: Partial<Record<Field, string>> = {};
    if (!values.name.trim()) found.name = 'Enter a name.';
    if (!values.location.trim()) found.location = 'Enter the address or location.';
    const capacity = Number(values.capacity);
    if (values.capacity.trim() === '' || !Number.isInteger(capacity) || capacity < 0) found.capacity = 'Use a whole number (0 means no limit).';
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={venue ? 'Edit venue' : 'Add venue'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="venue-form" loading={save.isPending}>{venue ? 'Save' : 'Add venue'}</Button></>}
    >
      <form id="venue-form" className={styles.form} onSubmit={submit} noValidate>
        {formError && <div className={styles.alert} role="alert">{formError}</div>}
        <Input label="Name" required maxLength={150} value={values.name} onChange={set('name')} error={errors.name} />
        <Input label="Address / location" required maxLength={250} value={values.location} onChange={set('location')} error={errors.location} />
        <div className={styles.row}>
          <Input label="City" maxLength={100} value={values.city} onChange={set('city')} />
          <Input label="Capacity" type="number" min={0} step={1} value={values.capacity} onChange={set('capacity')} error={errors.capacity} hint="Maximum registrations across an event here. 0 means no limit." />
        </div>
        <Input
          label="Time zone"
          list="venue-time-zones"
          value={values.timeZone}
          onChange={set('timeZone')}
          error={errors.timeZone}
          hint="Event times at this venue are local to it. Shown to participants."
          placeholder="Africa/Johannesburg"
        />
        <datalist id="venue-time-zones">{knownTimeZones().map((zone) => <option key={zone} value={zone} />)}</datalist>
        <Textarea label="Description" maxLength={1000} value={values.description} onChange={set('description')} />
      </form>
    </Modal>
  );
}

export function Component() {
  usePageTitle('Venues');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Venue | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Venue | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['venues'],
    queryFn: ({ signal }) => api<Venue[]>('/venues', { signal }),
  });

  const remove = useMutation({
    mutationFn: (venue: Venue) => api(`/venues/${venue.venueId}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Venue deleted.'); void queryClient.invalidateQueries({ queryKey: ['venues'] }); },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'Could not delete the venue.'),
  });

  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const venues = (data ?? []).filter((v) => !needle || [v.name, v.location, v.city ?? ''].some((text) => text.toLowerCase().includes(needle)));

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <Input label="Search venues" type="search" placeholder="Name, address or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className={styles.spacer} />
        <Button onClick={() => setEditing('new')}>Add venue</Button>
      </div>

      {error ? (
        <EmptyState icon={TriangleAlert} title="We could not load the venues" description={error instanceof ApiError ? error.detail : undefined} action={<Button onClick={() => void refetch()}>Try again</Button>} />
      ) : isPending ? (
        <div className={cards.grid} aria-busy="true" aria-label="Loading venues"><Skeleton height={170} radius={16} /><Skeleton height={170} radius={16} /></div>
      ) : data.length === 0 ? (
        <EmptyState icon={MapPin} title="No venues yet" description="Add a venue before you create an event." action={<Button onClick={() => setEditing('new')}>Add a venue</Button>} />
      ) : venues.length === 0 ? (
        <EmptyState icon={SearchX} title="No venue matches your search" description="Try a different name, address or city." action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} />
      ) : (
        <ul className={cards.grid} aria-label="Venues" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {venues.map((v) => (
            <li key={v.venueId}>
              <Card as="article" className={cards.card} interactive>
                <div className={cards.head}>
                  <span className={cards.pin} aria-hidden="true">📍</span>
                  <div>
                    <h3 className={cards.name}>{v.name}</h3>
                    <p className={cards.where}>{[v.location, v.city].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <div className={cards.facts}>
                  <Badge tone="accent">{v.capacity > 0 ? `${v.capacity.toLocaleString()} capacity` : 'No capacity limit'}</Badge>
                  {v.timeZone && <Badge>{v.timeZone.replace(/_/g, ' ')}</Badge>}
                </div>
                {v.description && <p className={cards.desc}>{v.description}</p>}
                <div className={cards.actions}>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(v)} aria-label={`Edit ${v.name}`}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(v)} aria-label={`Delete ${v.name}`}>Delete</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && <VenueModal venue={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        danger
        title="Delete venue?"
        message={deleting ? `"${deleting.name}" will be removed.` : ''}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try { await remove.mutateAsync(deleting); } catch { /* shown in the toast */ }
        }}
      />
    </>
  );
}
