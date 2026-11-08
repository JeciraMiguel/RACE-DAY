import { useOutletContext } from 'react-router-dom';
import type { EventDetail } from '../../lib/types';

/** The event being managed, shared with the tab pages through the outlet. */
export function useManagedEvent() {
  return useOutletContext<{ event: EventDetail }>().event;
}
