import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { toDateTimeLocal } from '../../lib/format';
import { validateEvent, type EventErrors, type EventField, type EventValues } from '../../lib/validation';
import type { EventDetail, RaceEvent, Venue } from '../../lib/types';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChanges';
import { UnsavedChangesDialog } from '../UnsavedChangesDialog';
import { Button, Card, FileInput, Input, Select, Textarea, useToast } from '../ui';
import styles from '../../pages/manage/Manage.module.css';

type Field = EventField;
type Errors = EventErrors;
type Values = EventValues;

interface EventFormProps {
  /** Present when editing; absent when creating. */
  event?: EventDetail;
  onSaved: (eventId: number) => void;
}

export function EventForm({ event, onSaved }: EventFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const locked = event?.status === 'Cancelled' || event?.status === 'Completed';

  const initial: Values = {
    title: event?.title ?? '',
    description: event?.description ?? '',
    eventDate: toDateTimeLocal(event?.eventDate),
    venueId: event ? String(event.venueId) : '',
    registrationOpensAt: toDateTimeLocal(event?.registrationOpensAt),
    registrationClosesAt: toDateTimeLocal(event?.registrationClosesAt),
  };
  const [values, setValues] = useState<Values>(initial);
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Leaving with edits (or a chosen banner) asks first; a successful save lifts the guard
  const dirty = !saved && !locked && (image !== null || (Object.keys(initial) as (keyof Values)[]).some((key) => values[key] !== initial[key]));
  const { blocker, allowNext } = useUnsavedChangesGuard(dirty);

  const { data: venues, isPending: venuesPending } = useQuery({
    queryKey: ['venues'],
    queryFn: ({ signal }) => api<Venue[]>('/venues', { signal }),
  });

  // Preview of a newly chosen banner; revoked when replaced or on unmount
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (field: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.set('Title', values.title.trim());
      form.set('Description', values.description.trim());
      form.set('EventDate', values.eventDate);
      form.set('VenueId', values.venueId);
      if (values.registrationOpensAt) form.set('RegistrationOpensAt', values.registrationOpensAt);
      if (values.registrationClosesAt) form.set('RegistrationClosesAt', values.registrationClosesAt);
      if (image) form.set('imageFile', image);

      if (event) {
        await api(`/events/${event.eventId}`, { method: 'PUT', form });
        return event.eventId;
      }
      return (await api<RaceEvent>('/events', { method: 'POST', form })).eventId;
    },
    onSuccess: (eventId) => {
      allowNext();
      setSaved(true);
      toast.success(event ? 'Event saved.' : 'Event created as a draft. Add categories, then publish it.');
      void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['manage-events'] });
      onSaved(eventId);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.errors) {
        const mapped: Errors = {};
        for (const [name, messages] of Object.entries(err.errors)) mapped[name as Field] = messages[0];
        setErrors(mapped);
      }
      setFormError(err instanceof ApiError ? err.detail : 'Could not save the event.');
    },
  });

  function onSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setFormError(null);
    const found = validateEvent(values, image);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate();
  }

  return (
    <Card className={styles.card}>
      <UnsavedChangesDialog blocker={blocker} />
      {locked && <div className={styles.notice} role="status">A {event!.status.toLowerCase()} event can no longer be edited.</div>}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <div className={styles.alert} role="alert">{formError}</div>}

        <fieldset disabled={locked} className={styles.form}>
          <Input label="Title" required maxLength={150} value={values.title} onChange={set('title')} error={errors.title} />
          <Textarea label="Description" maxLength={1000} value={values.description} onChange={set('description')} error={errors.description} hint={`${values.description.length}/1000 characters`} />

          <div className={styles.row}>
            <Input label="Date and start time" type="datetime-local" required value={values.eventDate} onChange={set('eventDate')} error={errors.eventDate} />
            <Select
              label="Venue"
              required
              value={values.venueId}
              onChange={set('venueId')}
              error={errors.venueId}
              disabled={venuesPending}
              hint={venues && venues.length === 0 ? undefined : 'Registrations are limited by the venue capacity.'}
            >
              <option value="">{venuesPending ? 'Loading venues…' : 'Choose a venue'}</option>
              {venues?.map((v) => <option key={v.venueId} value={v.venueId}>{v.name}{v.city ? ` · ${v.city}` : ''}</option>)}
            </Select>
          </div>
          {venues && venues.length === 0 && <p className={styles.muted}>There are no venues yet. <Link to="/manage/venues">Add one first</Link>.</p>}

          <div className={styles.row}>
            <Input label="Registration opens (optional)" type="datetime-local" value={values.registrationOpensAt} onChange={set('registrationOpensAt')} error={errors.registrationOpensAt} />
            <Input label="Registration closes (optional)" type="datetime-local" value={values.registrationClosesAt} onChange={set('registrationClosesAt')} error={errors.registrationClosesAt} hint="Participants can cancel until it closes." />
          </div>

          <div>
            <FileInput
              label="Banner image (optional)"
              accept="image/*"
              error={errors.image}
              hint={event?.imageUrl ? 'Choose a file to replace the current banner. JPG, PNG, WebP or GIF, up to 5 MB.' : 'JPG, PNG, WebP or GIF, up to 5 MB.'}
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
            {(preview ?? event?.imageUrl) && <img className={styles.preview} style={{ marginTop: 'var(--space-3)' }} src={(preview ?? event?.imageUrl)!} alt={preview ? 'Preview of the new banner' : 'Current banner'} />}
          </div>
        </fieldset>

        {!locked && (
          <div className={styles.formActions}>
            <Button type="submit" loading={save.isPending}>{event ? 'Save changes' : 'Create event'}</Button>
          </div>
        )}
      </form>
    </Card>
  );
}
