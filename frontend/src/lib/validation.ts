// Pure validation for the organizer forms (kept out of the components so it is easy to test).

import type { Gender } from './types';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type EventField = 'title' | 'description' | 'eventDate' | 'venueId' | 'registrationOpensAt' | 'registrationClosesAt' | 'image';
export type EventErrors = Partial<Record<EventField, string>>;

export interface EventValues {
  title: string;
  description: string;
  eventDate: string;
  venueId: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
}

export function validateEvent(values: EventValues, image: File | null): EventErrors {
  const errors: EventErrors = {};
  if (!values.title.trim()) errors.title = 'Enter a title.';
  if (!values.eventDate) errors.eventDate = 'Choose the date and start time.';
  if (!values.venueId) errors.venueId = 'Choose a venue.';
  if (values.description.length > 1000) errors.description = 'Use at most 1000 characters.';

  const { registrationOpensAt: opens, registrationClosesAt: closes, eventDate } = values;
  if (opens && closes && opens >= closes) errors.registrationClosesAt = 'Registration must close after it opens.';
  else if (closes && eventDate && closes > eventDate) errors.registrationClosesAt = 'Registration cannot close after the event starts.';

  if (image) {
    if (!image.type.startsWith('image/')) errors.image = 'Choose an image file (JPG, PNG, WebP or GIF).';
    else if (image.size > MAX_IMAGE_BYTES) errors.image = 'The image must be 5 MB or smaller.';
  }
  return errors;
}


export type CategoryField = 'name' | 'entryFee' | 'distanceKm' | 'startTime' | 'maxParticipants' | 'minAge' | 'maxAge';

export interface CategoryFormValues {
  name: string;
  entryFee: string;
  distanceKm: string;
  startTime: string;
  maxParticipants: string;
  minAge: string;
  maxAge: string;
  gender: Gender | '';
}

export function validateCategory(v: CategoryFormValues, registeredCount = 0): Partial<Record<CategoryField, string>> {
  const errors: Partial<Record<CategoryField, string>> = {};
  if (!v.name.trim()) errors.name = 'Enter a name.';
  if (v.entryFee.trim() === '' || Number(v.entryFee) < 0 || Number.isNaN(Number(v.entryFee))) errors.entryFee = 'Enter the fee (0 for free).';
  if (v.distanceKm && !(Number(v.distanceKm) > 0)) errors.distanceKm = 'Distance must be greater than zero.';
  if (v.maxParticipants) {
    const max = Number(v.maxParticipants);
    if (!Number.isInteger(max) || max < 1) errors.maxParticipants = 'Use a whole number of at least 1.';
    else if (max < registeredCount) errors.maxParticipants = `There are already ${registeredCount} registrations.`;
  }
  if (v.minAge && v.maxAge && Number(v.minAge) > Number(v.maxAge)) errors.maxAge = 'Maximum age must be at least the minimum age.';
  return errors;
}
