import { Shirt, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, Input, Pagination, Select, Skeleton, useToast, type Column } from '../../components/ui';
import { api, apiBlob, ApiError } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { formatDate } from '../../lib/format';
import { paymentStatusTone, registrationStatusTone } from '../../lib/status';
import type { Participant, PaymentStatus } from '../../lib/types';
import { useManagedEvent } from './useManagedEvent';
import styles from './Manage.module.css';

const PAGE_SIZE = 25;
const PAYMENTS: PaymentStatus[] = ['Pending', 'Paid', 'Waived'];

export function Component() {
  const event = useManagedEvent();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [payment, setPayment] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [page, setPage] = useState(1);
  const [toCancel, setToCancel] = useState<Participant | null>(null);
  const [exporting, setExporting] = useState(false);

  const listKey = ['event-registrations', event.eventId];

  const { data, isPending, error, refetch } = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => api<Participant[]>(`/events/${event.eventId}/registrations`, { signal }),
  });

  /** Applies a change to the cached list right away and returns what is needed to undo it. */
  async function optimistic(change: (rows: Participant[]) => Participant[]) {
    await queryClient.cancelQueries({ queryKey: listKey });
    const previous = queryClient.getQueryData<Participant[]>(listKey);
    queryClient.setQueryData<Participant[]>(listKey, (rows) => (rows ? change(rows) : rows));
    return { previous };
  }
  const rollback = (context?: { previous?: Participant[] }) => {
    if (context?.previous) queryClient.setQueryData(listKey, context.previous);
  };

  const setPaymentStatus = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: number; paymentStatus: PaymentStatus }) =>
      api(`/registrations/${id}/payment`, { method: 'PATCH', body: { paymentStatus } }),
    onMutate: ({ id, paymentStatus }) => optimistic((rows) => rows.map((p) => (p.registrationId === id ? { ...p, paymentStatus } : p))),
    onError: (err, _vars, context) => {
      rollback(context);
      toast.error(err instanceof ApiError ? err.detail : 'Could not update the payment status.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const cancel = useMutation({
    mutationFn: (p: Participant) => api(`/registrations/${p.registrationId}`, { method: 'DELETE' }),
    onMutate: (p) => optimistic((rows) => rows.map((r) => (r.registrationId === p.registrationId ? { ...r, status: 'Cancelled' } : r))),
    onSuccess: () => {
      toast.success('Registration cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['event', event.eventId] });
    },
    onError: (err, _vars, context) => {
      rollback(context);
      toast.error(err instanceof ApiError ? err.detail : 'Could not cancel the registration.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase().replace(/^#/, '');
    return (data ?? []).filter((p) =>
      (showCancelled || p.status === 'Confirmed')
      && (!categoryId || String(p.categoryId) === categoryId)
      && (!payment || p.paymentStatus === payment)
      && (!needle || p.participantName.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle) || String(p.raceNumber) === needle),
    );
  }, [data, search, categoryId, payment, showCancelled]);

  const confirmed = (data ?? []).filter((p) => p.status === 'Confirmed');
  const paid = confirmed.filter((p) => p.paymentStatus === 'Paid' || p.paymentStatus === 'Waived').length;

  const pageCount = Math.max(Math.ceil(rows.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, pageCount);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function exportCsv() {
    setExporting(true);
    try {
      const { blob, filename } = await apiBlob(`/events/${event.eventId}/registrations`, { query: { format: 'csv' } });
      downloadBlob(blob, filename ?? `registrations-${event.eventId}.csv`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Could not export the registrations.');
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<Participant>[] = [
    { key: 'bib', header: 'Bib', numeric: true, render: (p) => p.raceNumber },
    { key: 'name', header: 'Participant', render: (p) => <span><strong>{p.participantName}</strong><br /><span className={styles.muted}>{p.email}{p.phone ? ` · ${p.phone}` : ''}</span></span> },
    { key: 'category', header: 'Category', render: (p) => p.categoryName },
    { key: 'date', header: 'Registered', render: (p) => formatDate(p.registrationDate) },
    {
      key: 'payment',
      header: 'Payment',
      render: (p) =>
        p.status === 'Cancelled' ? <Badge tone={registrationStatusTone.Cancelled}>Cancelled</Badge> : (
          <select
            className={styles.inlineSelect}
            aria-label={`Payment status for ${p.participantName}`}
            value={p.paymentStatus}
            onChange={(e) => setPaymentStatus.mutate({ id: p.registrationId, paymentStatus: e.target.value as PaymentStatus })}
            data-tone={paymentStatusTone[p.paymentStatus]}
          >
            {PAYMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => p.status === 'Confirmed' ? <Button size="sm" variant="ghost" onClick={() => setToCancel(p)} aria-label={`Cancel registration of ${p.participantName}`}>Cancel</Button> : null,
    },
  ];

  if (error) return <EmptyState icon={TriangleAlert} title="We could not load the registrations" description={error instanceof ApiError ? error.detail : undefined} action={<Button onClick={() => void refetch()}>Try again</Button>} />;
  if (isPending) return <div style={{ display: 'grid', gap: '0.75rem' }} aria-busy="true" aria-label="Loading registrations"><Skeleton height={48} radius={12} /><Skeleton height={48} radius={12} /><Skeleton height={48} radius={12} /></div>;

  return (
    <>
      <p className={styles.muted} style={{ marginBottom: 'var(--space-4)' }} aria-live="polite">
        {confirmed.length} {confirmed.length === 1 ? 'registration' : 'registrations'} · {paid} paid or waived · {confirmed.length - paid} pending
      </p>

      <div className={styles.toolbar}>
        <div className={styles.grow}><Input label="Search" type="search" placeholder="Name, email or bib" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className={styles.filter}>
          <Select label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {event.categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
          </Select>
        </div>
        <div className={styles.filter}>
          <Select label="Payment" value={payment} onChange={(e) => { setPayment(e.target.value); setPage(1); }}>
            <option value="">Any payment status</option>
            {PAYMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <label className={styles.muted} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={showCancelled} onChange={(e) => { setShowCancelled(e.target.checked); setPage(1); }} /> Show cancelled
        </label>
        <span className={styles.spacer} />
        <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting} disabled={confirmed.length === 0}>Export CSV</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Shirt}
          title={data.length === 0 ? 'No registrations yet' : 'No registrations match your filters'}
          description={data.length === 0 ? 'Participants appear here as soon as they register.' : 'Try clearing the search or the filters.'}
        />
      ) : (
        <>
          <DataTable caption="Registrations" columns={columns} rows={visible} rowKey={(p) => p.registrationId} />
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        danger
        title="Cancel this registration?"
        message={toCancel ? `${toCancel.participantName} (bib #${toCancel.raceNumber}) will lose their place in ${toCancel.categoryName}. They can register again if spots remain.` : ''}
        confirmLabel="Cancel registration"
        onClose={() => setToCancel(null)}
        onConfirm={async () => {
          if (!toCancel) return;
          try { await cancel.mutateAsync(toCancel); } catch { /* shown in the toast */ }
        }}
      />
    </>
  );
}
