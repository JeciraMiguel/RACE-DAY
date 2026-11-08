import type { Category, Gender, RaceEvent, Registration } from './types';

/** What a visitor can do about registering for an event right now. Mirrors the server rules. */
export type RegistrationState =
  | { kind: 'open'; closesAt: string | null }
  | { kind: 'not-open-yet'; opensAt: string }
  | { kind: 'closed' }
  | { kind: 'started' }
  | { kind: 'cancelled' }
  | { kind: 'completed' }
  | { kind: 'draft' };

export function registrationState(event: RaceEvent, now = new Date()): RegistrationState {
  if (event.status === 'Draft') return { kind: 'draft' };
  if (event.status === 'Cancelled') return { kind: 'cancelled' };
  if (event.status === 'Completed') return { kind: 'completed' };

  if (now >= new Date(event.eventDate)) return { kind: 'started' };
  if (event.registrationOpensAt && now < new Date(event.registrationOpensAt)) {
    return { kind: 'not-open-yet', opensAt: event.registrationOpensAt };
  }
  if (event.registrationClosesAt && now > new Date(event.registrationClosesAt)) return { kind: 'closed' };

  return { kind: 'open', closesAt: event.registrationClosesAt };
}

export type Availability = 'full' | 'few' | 'open';

/** "few" is shown as a nudge when 10 or fewer spots remain. */
export function availability(spotsLeft: number | null): Availability {
  if (spotsLeft === null) return 'open';
  if (spotsLeft <= 0) return 'full';
  return spotsLeft <= 10 ? 'few' : 'open';
}

const GENDER_LABEL: Record<Gender, string> = { Male: 'Men', Female: 'Women', Other: 'Other' };

/** "Women · 18–40", "18+", "Up to 40" or "Open". */
export function eligibilityLabel(category: Pick<Category, 'gender' | 'minAge' | 'maxAge'>): string {
  const parts: string[] = [];
  if (category.gender) parts.push(GENDER_LABEL[category.gender]);

  if (category.minAge != null && category.maxAge != null) parts.push(`${category.minAge}–${category.maxAge}`);
  else if (category.minAge != null) parts.push(`${category.minAge}+`);
  else if (category.maxAge != null) parts.push(`Up to ${category.maxAge}`);

  return parts.length > 0 ? parts.join(' · ') : 'Open';
}

/** True once the event date has passed, regardless of status. */
export const hasStarted = (event: Pick<RaceEvent, 'eventDate'>, now = new Date()) => now >= new Date(event.eventDate);

export type RegistrationBucket = 'upcoming' | 'past' | 'cancelled';

/** Where a registration belongs in "My races": cancelled (by the user or the organizer), past, or upcoming. */
export function registrationBucket(registration: Registration, now = new Date()): RegistrationBucket {
  if (registration.status === 'Cancelled' || registration.eventStatus === 'Cancelled') return 'cancelled';
  if (registration.hasResult || registration.eventStatus === 'Completed' || now >= new Date(registration.eventDate)) return 'past';
  return 'upcoming';
}
