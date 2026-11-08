import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Input, PasswordInput } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';
import { ApiError } from '../lib/api';
import { usePageTitle } from '../lib/usePageTitle';
import styles from './AuthPage.module.css';

export function Component() {
  usePageTitle('Sign in');
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to={from?.pathname ?? '/'} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from ? `${from.pathname}${from.search ?? ''}` : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`container ${styles.wrap}`}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.lead}>Sign in to manage your registrations and results.</p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {error && <div className={styles.alert} role="alert">{error}</div>}
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" size="lg" block loading={busy} disabled={!email || !password}>Sign in</Button>
        </form>

        <p className={styles.alt}>
          New here? <Link to="/register" state={location.state}>Create an account</Link>
        </p>
      </Card>
    </div>
  );
}
