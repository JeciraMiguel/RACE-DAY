import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns before leaving a form with unsaved changes: in-app navigation is blocked (the caller
 * renders <UnsavedChangesDialog blocker={...}/>) and closing or reloading the tab triggers the
 * browser's own prompt. Only changes of page count; filters in the query string do not.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  // Set right before navigating after a successful save: state would still be stale at that moment
  const allowed = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !allowed.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowed.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return { blocker, allowNext: () => { allowed.current = true; } };
}
