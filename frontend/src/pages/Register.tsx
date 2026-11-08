import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Input, PasswordInput, Select } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';
import { ApiError } from '../lib/api';
import type { Gender } from '../lib/types';
import { usePageTitle } from '../lib/usePageTitle';
import styles from './AuthPage.module.css';

type Fields = 'fullName' | 'email' | 'password' | 'dateOfBirth' | 'phone';

function validate(values: Record<Fields, string>): Partial<Record<Fields, string>> {
  const errors: Partial<Record<Fields, string>> = {};
  if (!values.fullName.trim()) errors.fullName = 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Enter a valid email address.';
  if (values.password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) errors.password = 'Include at least one letter and one digit.';
  if (values.dateOfBirth && new Date(values.dateOfBirth) > new Date()) errors.dateOfBirth = 'Date of birth cannot be in the future.';
  return errors;
}

export function Component() {
  usePageTitle('Join');
  const { status, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;

  const [values, setValues] = useState<Record<Fields, string>>({ fullName: '', email: '', password: '', dateOfBirth: '', phone: '' });
  const [gender, setGender] = useState<Gender | ''>('');
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to={from?.pathname ?? '/'} replace />;

  const set = (field: Fields) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const clientErrors = validate(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setBusy(true);
    try {
      await register({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        dateOfBirth: values.dateOfBirth || null,
        gender: gender || null,
        phone: values.phone.trim() || null,
      });
      navigate(from ? `${from.pathname}${from.search ?? ''}` : '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        const mapped: Partial<Record<Fields, string>> = {};
        for (const [field, messages] of Object.entries(err.errors)) mapped[field as Fields] = messages[0];
        setErrors(mapped);
        setFormError(err.detail);
      } else {
        setFormError(err instanceof ApiError ? err.detail : 'Could not create the account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`container ${styles.wrap}`}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Join RaceDay</h1>
        <p className={styles.lead}>Create an account to register for events and follow your results.</p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && <div className={styles.alert} role="alert">{formError}</div>}
          <Input label="Full name" autoComplete="name" required value={values.fullName} onChange={set('fullName')} error={errors.fullName} />
          <Input label="Email" type="email" autoComplete="email" required value={values.email} onChange={set('email')} error={errors.email} />
          <PasswordInput label="Password" autoComplete="new-password" required value={values.password} onChange={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a digit." />
          <div className={styles.row}>
            <Input label="Date of birth" type="date" autoComplete="bday" value={values.dateOfBirth} onChange={set('dateOfBirth')} error={errors.dateOfBirth} hint="Needed for age categories." />
            <Select label="Gender" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')} hint="Needed for gender categories.">
              <option value="">Prefer not to say</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </Select>
          </div>
          <Input label="Phone (optional)" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
          <Button type="submit" size="lg" block loading={busy}>Create account</Button>
        </form>

        <p className={styles.alt}>
          Already registered? <Link to="/login" state={location.state}>Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
