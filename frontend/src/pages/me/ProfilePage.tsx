import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UnsavedChangesDialog } from '../../components/UnsavedChangesDialog';
import { Button, Card, Input, PasswordInput, Select, useToast } from '../../components/ui';
import { authApi } from '../../features/auth/authApi';
import { useAuth } from '../../features/auth/useAuth';
import { ApiError } from '../../lib/api';
import type { Gender, Profile } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChanges';
import styles from './ProfilePage.module.css';

type DetailField = 'fullName' | 'dateOfBirth' | 'phone' | 'emergencyContactName' | 'emergencyContactPhone';
type Errors<K extends string> = Partial<Record<K, string>>;

function DetailsForm({ user }: { user: Profile }) {
  const { reloadProfile } = useAuth();
  const toast = useToast();

  const [values, setValues] = useState<Record<DetailField, string>>({
    fullName: user.fullName,
    dateOfBirth: user.dateOfBirth ?? '',
    phone: user.phone ?? '',
    emergencyContactName: user.emergencyContactName ?? '',
    emergencyContactPhone: user.emergencyContactPhone ?? '',
  });
  const [gender, setGender] = useState<Gender | ''>(user.gender ?? '');
  const [errors, setErrors] = useState<Errors<DetailField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: DetailField) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: event.target.value }));

  // Compared with the saved profile, so the guard clears itself once the profile is reloaded after saving
  const saved: Record<DetailField, string> = {
    fullName: user.fullName,
    dateOfBirth: user.dateOfBirth ?? '',
    phone: user.phone ?? '',
    emergencyContactName: user.emergencyContactName ?? '',
    emergencyContactPhone: user.emergencyContactPhone ?? '',
  };
  const dirty = gender !== (user.gender ?? '') || (Object.keys(saved) as DetailField[]).some((key) => values[key] !== saved[key]);
  const { blocker } = useUnsavedChangesGuard(dirty);
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const clientErrors: Errors<DetailField> = {};
    if (!values.fullName.trim()) clientErrors.fullName = 'Enter your full name.';
    if (values.dateOfBirth && values.dateOfBirth > today) clientErrors.dateOfBirth = 'Date of birth cannot be in the future.';
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setBusy(true);
    try {
      await authApi.updateProfile({
        fullName: values.fullName.trim(),
        dateOfBirth: values.dateOfBirth || null,
        gender: gender || null,
        phone: values.phone.trim() || null,
        emergencyContactName: values.emergencyContactName.trim() || null,
        emergencyContactPhone: values.emergencyContactPhone.trim() || null,
      });
      await reloadProfile();
      toast.success('Your profile was saved.');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        const mapped: Errors<DetailField> = {};
        for (const [field, messages] of Object.entries(err.errors)) mapped[field as DetailField] = messages[0];
        setErrors(mapped);
      }
      setFormError(err instanceof ApiError ? err.detail : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={styles.card}>
      <UnsavedChangesDialog blocker={blocker} />
      <h2>Your details</h2>
      <p className={styles.lead}>Date of birth and gender are used to check that you are eligible for age and gender categories.</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <div className={styles.alert} role="alert">{formError}</div>}

        <div className={styles.readonly}>
          <span className={styles.readonlyLabel}>Email</span>
          <span className={styles.readonlyValue}>{user.email}</span>
        </div>

        <Input label="Full name" autoComplete="name" required value={values.fullName} onChange={set('fullName')} error={errors.fullName} />
        <div className={styles.row}>
          <Input label="Date of birth" type="date" max={today} autoComplete="bday" value={values.dateOfBirth} onChange={set('dateOfBirth')} error={errors.dateOfBirth} />
          <Select label="Gender" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')}>
            <option value="">Prefer not to say</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </Select>
        </div>
        <Input label="Phone" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />

        <h3 style={{ marginTop: 'var(--space-3)' }}>Emergency contact</h3>
        <div className={styles.row}>
          <Input label="Contact name" value={values.emergencyContactName} onChange={set('emergencyContactName')} error={errors.emergencyContactName} />
          <Input label="Contact phone" type="tel" value={values.emergencyContactPhone} onChange={set('emergencyContactPhone')} error={errors.emergencyContactPhone} />
        </div>

        <div className={styles.actions}>
          <Button type="submit" loading={busy}>Save changes</Button>
        </div>
      </form>
    </Card>
  );
}

type PasswordField = 'currentPassword' | 'newPassword' | 'confirm';

function PasswordForm() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<PasswordField, string>>({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Errors<PasswordField>>({});
  const [busy, setBusy] = useState(false);

  const set = (field: PasswordField) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const next: Errors<PasswordField> = {};
    if (!values.currentPassword) next.currentPassword = 'Enter your current password.';
    if (values.newPassword.length < 8) next.newPassword = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(values.newPassword) || !/\d/.test(values.newPassword)) next.newPassword = 'Include at least one letter and one digit.';
    else if (values.newPassword === values.currentPassword) next.newPassword = 'Choose a password that is different from the current one.';
    if (values.confirm !== values.newPassword) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      // The server signed this account out everywhere, so continue from the login page
      await logout();
      toast.info('Password changed. Please sign in again with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : 'Could not change your password.';
      if (err instanceof ApiError && err.errors?.newPassword) setErrors({ newPassword: err.errors.newPassword[0] });
      else setErrors({ currentPassword: detail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={styles.card}>
      <h2>Password</h2>
      <p className={styles.lead}>Changing your password signs you out of every device.</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <PasswordInput label="Current password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} />
        <PasswordInput label="New password" autoComplete="new-password" value={values.newPassword} onChange={set('newPassword')} error={errors.newPassword} hint="At least 8 characters, with a letter and a digit." />
        <PasswordInput label="Confirm new password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} error={errors.confirm} />
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" loading={busy}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}

export function Component() {
  usePageTitle('Profile');
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className={styles.stack}>
      {/* keyed so the form re-initialises if the profile is reloaded from the server */}
      <DetailsForm key={user.userId} user={user} />
      <PasswordForm />
    </div>
  );
}
