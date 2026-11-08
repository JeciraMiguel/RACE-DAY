import { X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';
import { ToastContext, type ToastApi, type ToastKind } from './toast-context';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Errors stay a little longer than confirmations. */
const DURATION: Record<ToastKind, number> = { success: 4000, info: 5000, error: 8000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.kind]}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <span className={styles.message}>{toast.message}</span>
            <button type="button" className={styles.dismiss} onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><X size={18} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
