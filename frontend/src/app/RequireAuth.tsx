import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';
import type { Role } from '../lib/types';

/** Route guard (layout route): anonymous users go to /login and come back, wrong roles to /forbidden. */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner center label="Checking your session" />;
  if (status === 'anonymous') return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;

  return <Outlet />;
}
