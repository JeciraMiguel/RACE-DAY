import { useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import styles from './Field.module.css';

interface Shared {
  label: string;
  hint?: string;
  error?: string;
}

interface ShellProps extends Shared {
  id: string;
  required?: boolean;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, required, children }: ShellProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}

/** aria-describedby / aria-invalid wiring shared by every control. */
function describe(id: string, { hint, error }: Pick<Shared, 'hint' | 'error'>) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export function Input({ label, hint, error, id, className, required, ...rest }: Shared & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <input id={fieldId} className={[styles.control, className].filter(Boolean).join(' ')} required={required} {...describe(fieldId, { hint, error })} {...rest} />
    </FieldShell>
  );
}

export function PasswordInput({ label, hint, error, id, required, ...rest }: Shared & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const generated = useId();
  const fieldId = id ?? generated;
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <div className={styles.passwordWrap}>
        <input id={fieldId} className={styles.control} type={visible ? 'text' : 'password'} required={required} {...describe(fieldId, { hint, error })} {...rest} />
        <button type="button" className={styles.toggle} onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </FieldShell>
  );
}

export function Select({ label, hint, error, id, required, children, ...rest }: Shared & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <select id={fieldId} className={styles.control} required={required} {...describe(fieldId, { hint, error })} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Textarea({ label, hint, error, id, required, ...rest }: Shared & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <textarea id={fieldId} className={styles.control} required={required} {...describe(fieldId, { hint, error })} {...rest} />
    </FieldShell>
  );
}

export function FileInput({ label, hint, error, id, required, ...rest }: Shared & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <input id={fieldId} type="file" className={styles.control} required={required} {...describe(fieldId, { hint, error })} {...rest} />
    </FieldShell>
  );
}
