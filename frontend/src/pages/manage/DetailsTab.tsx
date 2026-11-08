import { EventForm } from '../../components/manage/EventForm';
import { useManagedEvent } from './useManagedEvent';

export function Component() {
  const event = useManagedEvent();
  // keyed so the form re-initialises when the event is reloaded
  return <EventForm key={`${event.eventId}-${event.title}-${event.eventDate}-${event.venueId}-${event.imageUrl}`} event={event} onSaved={() => {}} />;
}
