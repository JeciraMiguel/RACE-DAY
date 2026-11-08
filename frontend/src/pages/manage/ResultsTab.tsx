import { Timer, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDALS } from '../../components/Podium';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, FileInput, Input, Modal, ProgressBar, SegmentedControl, Select, Skeleton, useToast, type Column } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { formatDuration, normalizeTimeSpan } from '../../lib/format';
import { resultStatusTone } from '../../lib/status';
import type { ImportSummary, Participant, ResultRow, ResultStatus } from '../../lib/types';
import { useManagedEvent } from './useManagedEvent';
import styles from './Manage.module.css';
import tab from './ResultsTab.module.css';

const STATUSES: ResultStatus[] = ['Finished', 'DNF', 'DNS', 'DSQ'];
const KIND_OPTIONS = STATUSES.map((s) => ({ value: s, label: s === 'Finished' ? 'Finished' : s }));
const PENDING_SHOWN = 12;

function resultBody(status: ResultStatus, time: string): { finishTime: string | null; error?: string } {
  if (status !== 'Finished') return { finishTime: null };
  const normalized = normalizeTimeSpan(time);
  return normalized ? { finishTime: normalized } : { finishTime: null, error: 'Enter the time as mm:ss or h:mm:ss.' };
}

interface Recent { key: number; bib: number; name: string; text: string }

function EditResultModal({ row, eventId, onClose }: { row: ResultRow; eventId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<ResultStatus>(row.status);
  const [time, setTime] = useState(row.finishTime ? row.finishTime.replace(/\.0+$/, '') : '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { finishTime: string | null; status: ResultStatus }) => api(`/results/${row.resultId}`, { method: 'PUT', body }),
    onSuccess: () => {
      toast.success('Result updated.');
      void queryClient.invalidateQueries({ queryKey: ['event-results', eventId] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.detail : 'Could not update the result.'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const { finishTime, error: invalid } = resultBody(status, time);
    if (invalid) { setError(invalid); return; }
    setError(null);
    save.mutate({ finishTime, status });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit result · bib #${row.raceNumber}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="result-form" loading={save.isPending}>Save</Button></>}
    >
      <form id="result-form" className={styles.form} onSubmit={submit} noValidate>
        <p><strong>{row.participantName}</strong> · {row.categoryName}</p>
        {error && <div className={styles.alert} role="alert">{error}</div>}
        <Select label="Result" value={status} onChange={(e) => setStatus(e.target.value as ResultStatus)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {status === 'Finished' && <Input label="Finish time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="39:30 or 1:02:03" autoFocus />}
      </form>
    </Modal>
  );
}

export function Component() {
  const event = useManagedEvent();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [bib, setBib] = useState('');
  const [time, setTime] = useState('');
  const [status, setStatus] = useState<ResultStatus>('Finished');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<ResultRow | null>(null);
  const [deleting, setDeleting] = useState<ResultRow | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [showAllPending, setShowAllPending] = useState(false);
  const bibRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const recentKey = useRef(0);

  const { data: registrations } = useQuery({
    queryKey: ['event-registrations', event.eventId],
    queryFn: ({ signal }) => api<Participant[]>(`/events/${event.eventId}/registrations`, { signal }),
  });

  const { data: results, isPending, error } = useQuery({
    queryKey: ['event-results', event.eventId],
    queryFn: ({ signal }) => api<ResultRow[]>(`/results/event/${event.eventId}`, { signal }),
  });

  const confirmed = useMemo(() => (registrations ?? []).filter((p) => p.status === 'Confirmed'), [registrations]);
  const byBib = useMemo(() => new Map(confirmed.map((p) => [String(p.raceNumber), p])), [confirmed]);
  const resultByRegistration = useMemo(() => new Map((results ?? []).map((r) => [r.registrationId, r])), [results]);
  const pending = useMemo(() => confirmed.filter((p) => !resultByRegistration.has(p.registrationId)).sort((a, b) => a.raceNumber - b.raceNumber), [confirmed, resultByRegistration]);

  const bibKey = bib.trim().replace(/^#/, '');
  const runner = bibKey ? byBib.get(bibKey) : undefined;
  const existing = runner ? resultByRegistration.get(runner.registrationId) : undefined;
  const done = confirmed.length - pending.length;

  const record = useMutation({
    mutationFn: (body: { registrationId: number; finishTime: string | null; status: ResultStatus }) => api('/results', { method: 'POST', body }),
    onSuccess: (_data, vars) => {
      const p = confirmed.find((c) => c.registrationId === vars.registrationId);
      const text = vars.status === 'Finished' && vars.finishTime ? formatDuration(vars.finishTime) : vars.status;
      toast.success(`Saved #${p?.raceNumber} ${p?.participantName}: ${text}`);
      if (p) setRecent((list) => [{ key: recentKey.current++, bib: p.raceNumber, name: p.participantName, text }, ...list].slice(0, 5));
      void queryClient.invalidateQueries({ queryKey: ['event-results', event.eventId] });
      setBib('');
      setTime('');
      bibRef.current?.focus(); // ready for the next runner
    },
    onError: (err) => setEntryError(err instanceof ApiError ? err.detail : 'Could not save the result.'),
  });

  function submitEntry(e: FormEvent) {
    e.preventDefault();
    setEntryError(null);
    if (!runner) { setEntryError(bibKey ? `No confirmed registration has bib #${bibKey}.` : 'Enter a bib number.'); return; }
    const { finishTime, error: invalid } = resultBody(status, time);
    if (invalid) { setEntryError(invalid); return; }
    record.mutate({ registrationId: runner.registrationId, finishTime, status });
  }

  /** Picking a pending runner fills the bib and moves on to the time. */
  function pickPending(p: Participant) {
    setBib(String(p.raceNumber));
    setEntryError(null);
    (status === 'Finished' ? timeRef : bibRef).current?.focus();
  }

  const remove = useMutation({
    mutationFn: (row: ResultRow) => api(`/results/${row.resultId}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Result removed.'); void queryClient.invalidateQueries({ queryKey: ['event-results', event.eventId] }); },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'Could not remove the result.'),
  });

  const importCsv = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return api<ImportSummary>('/results/import', { method: 'POST', query: { eventId: event.eventId }, form });
    },
    onSuccess: (result) => {
      setSummary(result);
      void queryClient.invalidateQueries({ queryKey: ['event-results', event.eventId] });
      if (result.errors.length === 0) toast.success(`Imported ${result.imported} results.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'Could not import the file.'),
  });

  const rows = useMemo(
    () =>
      (results ?? [])
        .filter((r) => !categoryFilter || String(r.categoryId) === categoryFilter)
        .sort((a, b) => a.categoryId - b.categoryId || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.raceNumber - b.raceNumber),
    [results, categoryFilter],
  );

  const columns: Column<ResultRow>[] = [
    { key: 'rank', header: 'Rank', numeric: true, render: (r) => (r.rank != null ? <span>{r.rank <= 3 && <span aria-hidden="true">{MEDALS[r.rank - 1]} </span>}{r.rank}</span> : '—') },
    { key: 'bib', header: 'Bib', numeric: true, render: (r) => r.raceNumber },
    { key: 'name', header: 'Runner', render: (r) => <strong>{r.participantName}</strong> },
    { key: 'category', header: 'Category', render: (r) => r.categoryName },
    { key: 'time', header: 'Result', numeric: true, render: (r) => (r.status === 'Finished' && r.finishTime ? <span className="tnum">{formatDuration(r.finishTime)}</span> : <Badge tone={resultStatusTone[r.status]}>{r.status}</Badge>) },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <span className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => setEditing(r)} aria-label={`Edit result of bib ${r.raceNumber}`}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(r)} aria-label={`Remove result of bib ${r.raceNumber}`}>Remove</Button>
        </span>
      ),
    },
  ];

  const shownPending = showAllPending ? pending : pending.slice(0, PENDING_SHOWN);

  return (
    <>
      {confirmed.length > 0 && (
        <Card className={tab.progressCard}>
          <div className={tab.progressHead}>
            <h3>Race day</h3>
            <p aria-live="polite"><span className={tab.big}>{done}</span> of {confirmed.length} runners have a result</p>
          </div>
          <ProgressBar value={done} max={confirmed.length} label={`Results recorded: ${done} of ${confirmed.length}`} tone={done === confirmed.length ? 'success' : 'accent'} />
          {pending.length > 0 ? (
            <div>
              <p className={tab.pendingTitle}>Still to record · click a runner to fill the bib</p>
              <div className={tab.chips} style={{ marginTop: 'var(--space-2)' }}>
                {shownPending.map((p) => (
                  <button key={p.registrationId} type="button" className={tab.chip} onClick={() => pickPending(p)} aria-label={`Record bib ${p.raceNumber}, ${p.participantName}`}>
                    <strong>#{p.raceNumber}</strong> {p.participantName}
                  </button>
                ))}
                {pending.length > PENDING_SHOWN && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAllPending((v) => !v)}>{showAllPending ? 'Show fewer' : `Show all ${pending.length}`}</Button>
                )}
              </div>
            </div>
          ) : (
            <p className={styles.muted}>Everyone has a result. You can mark the event as completed.</p>
          )}
        </Card>
      )}

      <Card className={tab.entry}>
        <h3>Record a result</h3>
        <form onSubmit={submitEntry} noValidate>
          <div className={tab.entryGrid}>
            <div className={tab.bib}>
              <Input
                label="Bib number"
                inputMode="numeric"
                autoComplete="off"
                ref={bibRef}
                value={bib}
                onChange={(e) => { setBib(e.target.value); setEntryError(null); }}
                hint={runner ? `${runner.participantName} · ${runner.categoryName}${existing ? ' · already has a result, saving replaces it' : ''}` : bibKey ? 'No confirmed registration with this bib' : 'Type the bib, then the time and press Enter'}
              />
            </div>
            <div className={tab.time}>
              <Input label="Finish time" autoComplete="off" ref={timeRef} value={time} onChange={(e) => setTime(e.target.value)} disabled={status !== 'Finished'} placeholder="39:30 or 1:02:03" hint="mm:ss or h:mm:ss" />
            </div>
          </div>

          <div className={tab.kind}>
            <span className={tab.kindLabel}>Result</span>
            <SegmentedControl label="Result" value={status} onChange={setStatus} options={KIND_OPTIONS} />
          </div>

          {entryError && <div className={styles.alert} role="alert" style={{ marginTop: 'var(--space-3)' }}>{entryError}</div>}
          <div className={styles.formActions}><Button type="submit" size="lg" loading={record.isPending}>Save result</Button></div>
        </form>

        {recent.length > 0 && (
          <>
            <p className={tab.recentTitle}>Just recorded</p>
            <ul className={tab.recent} aria-label="Recently recorded results">
              {recent.map((r) => (
                <li key={r.key}><span className={tab.tick} aria-hidden="true">✓</span><span><strong>#{r.bib}</strong> {r.name}</span><span className="tnum">{r.text}</span></li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className={styles.toolbar}>
        <h3>Leaderboard</h3>
        <span className={styles.spacer} />
        {event.categories.length > 1 && (
          <SegmentedControl
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[{ value: '', label: 'All' }, ...event.categories.map((c) => ({ value: String(c.categoryId), label: c.name }))]}
          />
        )}
      </div>

      {error ? (
        <EmptyState icon={TriangleAlert} title="We could not load the results" description={error instanceof ApiError ? error.detail : undefined} />
      ) : isPending ? (
        <Skeleton height={160} radius={16} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Timer} title="No results yet" description="Results you record appear here ranked, exactly as participants will see them." />
      ) : (
        <DataTable caption="Results" columns={columns} rows={rows} rowKey={(r) => r.resultId} />
      )}

      <details className={tab.importDetails}>
        <summary>Import from CSV</summary>
        <Card className={`${styles.card} ${tab.importBody}`} style={{ maxWidth: 'none' }}>
          <p className={styles.muted} style={{ marginBottom: 'var(--space-4)' }}>
            One runner per line: <code>raceNumber,finishTime[,status]</code> (for example <code>214,39:30.5</code>, <code>9,1:02:03</code> or <code>87,,DNF</code>). A header line is fine.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (csvFile && csvFile.size > 0) importCsv.mutate(csvFile);
              else toast.error('Choose a CSV file first.');
            }}
          >
            <FileInput label="CSV file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} />
            <div className={styles.formActions}><Button type="submit" variant="secondary" loading={importCsv.isPending}>Import results</Button></div>
          </form>

          {summary && (
            <div role="status" style={{ marginTop: 'var(--space-4)' }}>
              <p><strong>{summary.imported}</strong> imported{summary.errors.length > 0 ? `, ${summary.errors.length} lines skipped:` : '.'}</p>
              {summary.errors.length > 0 && (
                <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }}>
                  {summary.errors.map((e) => <li key={`${e.line}-${e.message}`} className={styles.muted}>Line {e.line}: {e.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </Card>
      </details>

      {editing && <EditResultModal row={editing} eventId={event.eventId} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        danger
        title="Remove this result?"
        message={deleting ? `The result of #${deleting.raceNumber} ${deleting.participantName} is removed and the ranking is recalculated.` : ''}
        confirmLabel="Remove"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try { await remove.mutateAsync(deleting); } catch { /* shown in the toast */ }
        }}
      />
    </>
  );
}
