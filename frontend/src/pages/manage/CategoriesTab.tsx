import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, Input, Modal, Select, useToast, type Column } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { eligibilityLabel } from '../../lib/eventState';
import { formatMoney, formatTime } from '../../lib/format';
import { validateCategory, type CategoryField, type CategoryFormValues } from '../../lib/validation';
import type { Category, CategoryInput } from '../../lib/types';
import { useManagedEvent } from './useManagedEvent';
import styles from './Manage.module.css';

const blank: CategoryFormValues = { name: '', entryFee: '0', distanceKm: '', startTime: '', maxParticipants: '', minAge: '', maxAge: '', gender: '' };

function toValues(c: Category): CategoryFormValues {
  return {
    name: c.name,
    entryFee: String(c.entryFee),
    distanceKm: c.distanceKm != null ? String(c.distanceKm) : '',
    startTime: c.startTime ? c.startTime.slice(0, 5) : '',
    maxParticipants: c.maxParticipants != null ? String(c.maxParticipants) : '',
    minAge: c.minAge != null ? String(c.minAge) : '',
    maxAge: c.maxAge != null ? String(c.maxAge) : '',
    gender: c.gender ?? '',
  };
}

const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value));

function CategoryModal({ category, eventId, onClose }: { category: Category | null; eventId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<CategoryFormValues>(category ? toValues(category) : blank);
  const [errors, setErrors] = useState<Partial<Record<CategoryField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (field: keyof CategoryFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body: CategoryInput = {
        name: values.name.trim(),
        entryFee: Number(values.entryFee),
        distanceKm: optionalNumber(values.distanceKm),
        startTime: values.startTime ? `${values.startTime}:00` : null,
        maxParticipants: optionalNumber(values.maxParticipants),
        minAge: optionalNumber(values.minAge),
        maxAge: optionalNumber(values.maxAge),
        gender: values.gender || null,
      };
      return category
        ? api(`/categories/${category.categoryId}`, { method: 'PUT', body })
        : api('/categories', { method: 'POST', body: { ...body, eventId } });
    },
    onSuccess: () => {
      toast.success(category ? 'Category saved.' : 'Category added.');
      void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.detail : 'Could not save the category.'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validateCategory(values, category?.registeredCount ?? 0);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="category-form" loading={save.isPending}>{category ? 'Save' : 'Add category'}</Button>
        </>
      }
    >
      <form id="category-form" className={styles.form} onSubmit={submit} noValidate>
        {formError && <div className={styles.alert} role="alert">{formError}</div>}
        <Input label="Name" required maxLength={100} value={values.name} onChange={set('name')} error={errors.name} placeholder="e.g. 10 km, Half marathon" />
        <div className={styles.row}>
          <Input label="Entry fee" type="number" min={0} step="0.01" required value={values.entryFee} onChange={set('entryFee')} error={errors.entryFee} hint="0 means free." />
          <Input label="Distance (km)" type="number" min={0} step="0.1" value={values.distanceKm} onChange={set('distanceKm')} error={errors.distanceKm} />
        </div>
        <div className={styles.row}>
          <Input label="Start time" type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
          <Input label="Maximum participants" type="number" min={1} step={1} value={values.maxParticipants} onChange={set('maxParticipants')} error={errors.maxParticipants} hint="Empty means unlimited." />
        </div>
        <div className={styles.row3}>
          <Input label="Minimum age" type="number" min={0} max={120} value={values.minAge} onChange={set('minAge')} error={errors.minAge} />
          <Input label="Maximum age" type="number" min={0} max={120} value={values.maxAge} onChange={set('maxAge')} error={errors.maxAge} />
          <Select label="Gender" value={values.gender} onChange={set('gender')}>
            <option value="">Open</option>
            <option value="Female">Women</option>
            <option value="Male">Men</option>
            <option value="Other">Other</option>
          </Select>
        </div>
      </form>
    </Modal>
  );
}

export function Component() {
  const event = useManagedEvent();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const closed = event.status === 'Cancelled' || event.status === 'Completed';

  const remove = useMutation({
    mutationFn: (category: Category) => api(`/categories/${category.categoryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Category deleted.');
      void queryClient.invalidateQueries({ queryKey: ['event', event.eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'Could not delete the category.'),
  });

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Category', render: (c) => <strong>{c.name}</strong> },
    { key: 'distance', header: 'Distance', render: (c) => (c.distanceKm != null ? `${c.distanceKm} km` : '—') },
    { key: 'start', header: 'Start', render: (c) => (c.startTime ? formatTime(c.startTime) : '—') },
    { key: 'fee', header: 'Entry', numeric: true, render: (c) => (c.entryFee === 0 ? 'Free' : formatMoney(c.entryFee)) },
    { key: 'who', header: 'Who can enter', render: (c) => eligibilityLabel(c) },
    {
      key: 'registered',
      header: 'Registered',
      numeric: true,
      render: (c) => (c.maxParticipants != null ? <Badge tone={c.spotsLeft === 0 ? 'danger' : 'neutral'}>{c.registeredCount} / {c.maxParticipants}</Badge> : c.registeredCount),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <span className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>Delete</Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.muted}>Each category is a distance or group with its own fee, capacity and eligibility.</p>
        <span className={styles.spacer} />
        {!closed && <Button onClick={() => setEditing('new')}>Add category</Button>}
      </div>

      {event.categories.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No categories yet" description="Add at least one category before you publish the event." action={!closed ? <Button onClick={() => setEditing('new')}>Add the first category</Button> : undefined} />
      ) : (
        <DataTable caption="Categories" columns={columns} rows={event.categories} rowKey={(c) => c.categoryId} />
      )}

      {editing && <CategoryModal category={editing === 'new' ? null : editing} eventId={event.eventId} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        danger
        title="Delete category?"
        message={deleting ? `"${deleting.name}" will be removed. Categories with registrations cannot be deleted.` : ''}
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
