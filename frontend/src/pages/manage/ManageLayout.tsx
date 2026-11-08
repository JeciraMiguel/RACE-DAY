import { Outlet } from 'react-router-dom';
import { SubNav } from '../../components/SubNav';
import { useAuth } from '../../features/auth/useAuth';

/** Shell of the organizer/admin area: one compact row (title and section switcher). */
export function Component() {
  const { hasRole } = useAuth();

  return (
    <div className="container">
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-6) 0 var(--space-4)' }}>
        <h1>Manage</h1>
        <SubNav
          variant="pills"
          label="Manage"
          items={[
            { to: '/manage', label: 'Events', end: true },
            { to: '/manage/venues', label: 'Venues' },
            ...(hasRole('Admin') ? [{ to: '/manage/users', label: 'Users' }] : []),
          ]}
        />
      </header>

      <Outlet />
    </div>
  );
}
