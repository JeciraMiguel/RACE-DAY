import { describe, expect, it } from 'vitest';
import { normalizeTimeSpan, toDateTimeLocal } from './format';
import { validateCategory, validateEvent } from './validation';

const event = { title: 'City 10K', description: '', eventDate: '2027-03-14T07:00', venueId: '1', registrationOpensAt: '', registrationClosesAt: '' };

describe('validateEvent', () => {
  it('accepts a complete event', () => {
    expect(validateEvent(event, null)).toEqual({});
  });

  it('requires title, date and venue', () => {
    expect(validateEvent({ ...event, title: ' ', eventDate: '', venueId: '' }, null)).toEqual({
      title: 'Enter a title.', eventDate: 'Choose the date and start time.', venueId: 'Choose a venue.',
    });
  });

  it('checks the registration window against the event date', () => {
    expect(validateEvent({ ...event, registrationOpensAt: '2027-03-10T00:00', registrationClosesAt: '2027-03-01T00:00' }, null).registrationClosesAt).toMatch(/after it opens/);
    expect(validateEvent({ ...event, registrationClosesAt: '2027-03-15T00:00' }, null).registrationClosesAt).toMatch(/after the event starts/);
    expect(validateEvent({ ...event, registrationOpensAt: '2027-03-01T00:00', registrationClosesAt: '2027-03-14T07:00' }, null)).toEqual({});
  });

  it('checks the banner type and size', () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    const ok = new File(['x'], 'ok.png', { type: 'image/png' });
    expect(validateEvent(event, pdf).image).toMatch(/image file/);
    expect(validateEvent(event, big).image).toMatch(/5 MB/);
    expect(validateEvent(event, ok).image).toBeUndefined();
  });
});

describe('validateCategory', () => {
  const category = { name: '10 km', entryFee: '150', distanceKm: '10', startTime: '07:00', maxParticipants: '', minAge: '', maxAge: '', gender: '' as const };

  it('accepts a valid category and treats empty optionals as unlimited', () => {
    expect(validateCategory(category)).toEqual({});
  });

  it('validates the fee, distance, capacity and ages', () => {
    expect(validateCategory({ ...category, name: '', entryFee: '-1' })).toMatchObject({ name: expect.any(String), entryFee: expect.any(String) });
    expect(validateCategory({ ...category, distanceKm: '0' }).distanceKm).toBeDefined();
    expect(validateCategory({ ...category, maxParticipants: '2.5' }).maxParticipants).toBeDefined();
    expect(validateCategory({ ...category, minAge: '40', maxAge: '18' }).maxAge).toBeDefined();
  });

  it('does not allow a capacity below the current registrations', () => {
    expect(validateCategory({ ...category, maxParticipants: '5' }, 8).maxParticipants).toMatch(/already 8/);
    expect(validateCategory({ ...category, maxParticipants: '8' }, 8)).toEqual({});
  });
});

describe('time input helpers', () => {
  it('normalises typed finish times', () => {
    expect(normalizeTimeSpan('39:30')).toBe('00:39:30');
    expect(normalizeTimeSpan('1:02:03')).toBe('01:02:03');
    expect(normalizeTimeSpan('00:39:30.5')).toBe('00:39:30.5');
    expect(normalizeTimeSpan(' 5:07 ')).toBe('00:05:07');
    expect(normalizeTimeSpan('75:00')).toBe('01:15:00'); // minutes over 59 roll into hours
  });

  it('rejects invalid input', () => {
    for (const bad of ['', 'abc', '39', '39:75', '1:75:00', '1:2:3', '12:00:00:00']) expect(normalizeTimeSpan(bad)).toBeNull();
  });

  it('converts API dates for datetime-local inputs', () => {
    expect(toDateTimeLocal('2027-03-14T07:00:00')).toBe('2027-03-14T07:00');
    expect(toDateTimeLocal(null)).toBe('');
  });
});
