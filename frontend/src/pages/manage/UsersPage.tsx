import { TriangleAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, ConfirmDialog, DataTable, EmptyState, Input, Pagination, SegmentedControl, Skeleton, useToast, type Column } from '../../components/ui';
import { useAuth } from '../../features/auth/useAuth';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Paged, Role, UserSummary } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './Manage.module.css';

const PAGE_SIZE = 15;
const ROLES: Role[] = ['Participant', 'Organizer', 'Admin'];

type Pending = { user: UserSummary; kind: 'role'; role: Role } | { user: UserSummary; kind: 'active'; isActive: boolean };

export function Component() {
  usePageTitle('Users');
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(draft); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [draft]);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['users', { search, role, page }],
    queryFn: ({ signal }) => api<Paged<UserSummary>>('/users', { query: { search, role, page, pageSize: PAGE_SIZE }, signal }),
    placeholderData: keepPreviousData,
  });

  // One cheap request per role (page size 1) for the counts on the filter
  const roleCounts = useQuery({
    queryKey: ['users', 'role-counts'],
    queryFn: async ({ signal }) => {
      const [all, ...byRole] = await Promise.all(
        ['', ...ROLES].map((r) => api<Paged<UserSummary>>('/users', { query: { role: r, pageSize: 1 }, signal })),
      );
      return { '': all!.totalCount, Participant: byRole[0]!.totalCount, Organizer: byRole[1]!.totalCount, Admin: byRole[2]!.totalCount } as Record<string, number>;
    },
  });

  const update = useMutation({
    mutationFn: (change: Pending) =>
      change.kind === 'role'
        ? api(`/users/${change.user.userId}/role`, { method: 'PUT', body: { role: change.role } })
        : api(`/users/${change.user.userId}/active`, { method: 'PUT', body: { isActive: change.isActive } }),
    onSuccess: (_d, change) => {
      toast.success(change.kind === 'role' ? `${change.user.fullName} is now ${change.role}.` : `${change.user.fullName} was ${change.isActive ? 'activated' : 'deactivated'}.`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : 'Could not update the user.'),
  });

  const columns: Column<UserSummary>[] = [
    { key: 'name', header: 'User', render: (u) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}><Avatar name={u.fullName} size={36} /><span><strong>{u.fullName}</strong>{u.userId === me?.userId && <> <Badge tone="accent">You</Badge></>}<br /><span className={styles.muted}>{u.email}</span></span></span> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <select
          className={styles.inlineSelect}
          aria-label={`Role of ${u.fullName}`}
          value={u.role}
          disabled={u.userId === me?.userId}
          onChange={(e) => setPending({ user: u, kind: 'role', role: e.target.value as Role })}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      ),
    },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge> },
    { key: 'joined', header: 'Joined', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) =>
        u.userId === me?.userId ? null : (
          <Button size="sm" variant={u.isActive ? 'ghost' : 'secondary'} onClick={() => setPending({ user: u, kind: 'active', isActive: !u.isActive })} aria-label={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.fullName}`}>
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        ),
    },
  ];

  const message = !pending
    ? ''
    : pending.kind === 'role'
      ? `${pending.user.fullName} will become ${pending.role}. They are signed out immediately and sign in again with the new permissions.`
      : pending.isActive
        ? `${pending.user.fullName} will be able to sign in again.`
        : `${pending.user.fullName} is signed out immediately and cannot sign in until you activate the account again.`;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.grow}><Input label="Search users" type="search" placeholder="Name or email" value={draft} onChange={(e) => setDraft(e.target.value)} /></div>
        <SegmentedControl
          label="Filter by role"
          value={role}
          onChange={(value) => { setRole(value); setPage(1); }}
          options={[{ value: '', label: 'All', count: roleCounts.data?.[''] }, ...ROLES.map((r) => ({ value: r, label: r === 'Participant' ? 'Participants' : r === 'Organizer' ? 'Organizers' : 'Admins', count: roleCounts.data?.[r] }))]}
        />
      </div>

      {error ? (
        <EmptyState icon={TriangleAlert} title="We could not load the users" description={error instanceof ApiError ? error.detail : undefined} action={<Button onClick={() => void refetch()}>Try again</Button>} />
      ) : isPending ? (
        <Skeleton height={200} radius={16} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={Users} title="No users match" description="Try a different name, email or role." />
      ) : (
        <div style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity var(--dur) var(--ease)' }}>
          <DataTable caption="Users" columns={columns} rows={data.items} rowKey={(u) => u.userId} />
          <Pagination page={data.page} pageCount={Math.ceil(data.totalCount / data.pageSize)} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        danger={pending?.kind === 'active' && !pending.isActive}
        title={pending?.kind === 'role' ? 'Change role?' : pending?.kind === 'active' && pending.isActive ? 'Activate account?' : 'Deactivate account?'}
        message={message}
        confirmLabel="Confirm"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          try { await update.mutateAsync(pending); } catch { /* shown in the toast */ }
        }}
      />
    </>
  );
}
