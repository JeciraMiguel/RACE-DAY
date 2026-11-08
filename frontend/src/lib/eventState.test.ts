import { describe, expect, it } from 'vitest';
import { availability, eligibilityLabel, registrationBucket, registrationState } from './eventState';
import { countdownParts } from './countdown';
import { durationToMs, formatGap, formatTime, localNaiveNow, ordinal } from './format';
import type { RaceEvent, Registration } from './types';

const event = (over: Partial<RaceEvent> = {}): RaceEvent => ({
  eventId: 1, title: 'City 10K', description: '', eventDate: '2027-03-14T07:00:00', venueId: 1, venueName: 'Stadium', imageUrl: null,
  status: 'Published', organizerId: 1, registrationOpensAt: null, registrationClosesAt: null, categoryCount: 1, minEntryFee: 100, spotsLeft: null, registeredCount: 0,
  ...over,
});

const now = new Date('2027-03-01T12:00:00');

describe('registrationState', () => {
  it('is open for a published future event without a window', () => {
    expect(registrationState(event(), now)).toEqual({ kind: 'open', closesAt: null });
  });

  it('respects the registration window', () => {
    expect(registrationState(event({ registrationOpensAt: '2027-03-05T00:00:00' }), now)).toEqual({ kind: 'not-open-yet', opensAt: '2027-03-05T00:00:00' });
    expect(registrationState(event({ registrationClosesAt: '2027-02-28T00:00:00' }), now)).toEqual({ kind: 'closed' });
    expect(registrationState(event({ registrationClosesAt: '2027-03-10T00:00:00' }), now)).toEqual({ kind: 'open', closesAt: '2027-03-10T00:00:00' });
  });

  it('reports started, cancelled, completed and draft events', () => {
    expect(registrationState(event(), new Date('2027-03-14T07:00:01'))).toEqual({ kind: 'started' });
    expect(registrationState(event({ status: 'Cancelled' }), now)).toEqual({ kind: 'cancelled' });
    expect(registrationState(event({ status: 'Completed' }), now)).toEqual({ kind: 'completed' });
    expect(registrationState(event({ status: 'Draft' }), now)).toEqual({ kind: 'draft' });
  });
});

describe('availability', () => {
  it('classifies the remaining spots', () => {
    expect(availability(null)).toBe('open');
    expect(availability(0)).toBe('full');
    expect(availability(7)).toBe('few');
    expect(availability(10)).toBe('few');
    expect(availability(11)).toBe('open');
  });
});

describe('eligibilityLabel', () => {
  it('describes gender and age rules', () => {
    expect(eligibilityLabel({ gender: null, minAge: null, maxAge: null })).toBe('Open');
    expect(eligibilityLabel({ gender: 'Female', minAge: 18, maxAge: 40 })).toBe('Women · 18–40');
    expect(eligibilityLabel({ gender: null, minAge: 18, maxAge: null })).toBe('18+');
    expect(eligibilityLabel({ gender: 'Male', minAge: null, maxAge: 12 })).toBe('Men · Up to 12');
  });
});

describe('countdownParts', () => {
  it('splits the remaining time and stops at zero', () => {
    const target = new Date('2027-03-03T13:02:05');
    expect(countdownParts(target, new Date('2027-03-01T12:00:00'))).toEqual({ done: false, days: 2, hours: 1, minutes: 2, seconds: 5 });
    expect(countdownParts(target, new Date('2027-04-01T00:00:00')).done).toBe(true);
  });
});

describe('time helpers', () => {
  it('formats start times, parses durations and computes gaps', () => {
    expect(formatTime('07:30:00')).toBe('07:30');
    expect(durationToMs('00:39:30.500')).toBe(2_370_500);
    expect(Number.isNaN(durationToMs('nope'))).toBe(true);
    expect(formatGap(durationToMs('00:41:02'), durationToMs('00:39:30'))).toBe('+1:32');
    expect(formatGap(durationToMs('01:41:02'), durationToMs('00:39:30'))).toBe('+1:01:32');
  });

  it('formats "now" as a naive local timestamp', () => {
    expect(localNaiveNow(new Date(2027, 2, 4, 5, 6, 7))).toBe('2027-03-04T05:06:07');
  });
});

describe('registrationBucket', () => {
  const registration = (over: Partial<Registration> = {}): Registration => ({
    registrationId: 1, categoryId: 1, categoryName: '10 km', eventId: 1, eventTitle: 'City 10K', participantName: 'T', raceNumber: 5,
    registrationDate: '2027-01-01T00:00:00Z', status: 'Confirmed', paymentStatus: 'Pending', eventDate: '2027-03-14T07:00:00',
    eventStatus: 'Published', entryFee: 100, hasResult: false, canCancel: true, ...over,
  });

  it('puts future confirmed registrations in upcoming', () => {
    expect(registrationBucket(registration(), now)).toBe('upcoming');
  });

  it('puts finished, completed or already started races in past', () => {
    expect(registrationBucket(registration({ hasResult: true }), now)).toBe('past');
    expect(registrationBucket(registration({ eventStatus: 'Completed' }), now)).toBe('past');
    expect(registrationBucket(registration(), new Date('2027-03-14T08:00:00'))).toBe('past');
  });

  it('puts cancelled registrations and cancelled events in cancelled', () => {
    expect(registrationBucket(registration({ status: 'Cancelled' }), now)).toBe('cancelled');
    expect(registrationBucket(registration({ eventStatus: 'Cancelled' }), now)).toBe('cancelled');
  });
});

describe('ordinal', () => {
  it('handles the teens and the usual suffixes', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  });
});
