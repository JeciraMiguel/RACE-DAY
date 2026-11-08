import { Outlet } from 'react-router-dom';
import { SubNav } from '../../components/SubNav';
import { Avatar } from '../../components/ui';
import { useAuth } from '../../features/auth/useAuth';

/** Shell of the signed-in participant area: a greeting and the three sections. */
export function Component() {
  const { user } = useAuth();

  return (
    <div className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-6) 0 var(--space-5)' }}>
        {user && <Avatar name={user.fullName} size={52} />}
        <div>
          <h1>My RaceDay</h1>
          {user && <p style={{ color: 'var(--ink-muted)' }}>{user.fullName}</p>}
        </div>
      </header>

      <SubNav
        label="My RaceDay"
        items={[
          { to: '/me/registrations', label: 'My races' },
          { to: '/me/results', label: 'My results' },
          { to: '/me/profile', label: 'Profile' },
        ]}
      />

      <Outlet />
    </div>
  );
}
