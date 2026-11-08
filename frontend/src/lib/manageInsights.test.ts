import { describe, expect, it } from 'vitest';
import { attentionItems, eventCapacity } from './manageInsights';
import type { RaceEvent } from './types';

const now = new Date('2027-03-10T12:00:00');

const event = (over: Partial<RaceEvent>): RaceEvent => ({
  eventId: 1, title: 'City 10K', description: '', eventDate: '2027-06-01T08:00:00', venueId: 1, venueName: 'Stadium', imageUrl: null,
  status: 'Published', organizerId: 1, registrationOpensAt: null, registrationClosesAt: null, categoryCount: 1, minEntryFee: 100,
  spotsLeft: null, registeredCount: 0, ...over,
});

describe('attentionItems', () => {
  it('has nothing to say when nothing needs attention', () => {
    expect(attentionItems([event({}), event({ eventId: 2, status: 'Completed', eventDate: '2027-01-01T08:00:00' })], now)).toEqual([]);
  });

  it('flags races that already ran but are not closed, most urgent first', () => {
    const items = attentionItems([event({ eventId: 7, title: 'Old race', eventDate: '2027-03-01T08:00:00' }), event({ eventId: 8, eventDate: '2027-03-12T08:00:00' })], now);

    expect(items.map((i) => i.id)).toEqual(['results-pending', 'starting-soon']);
    expect(items[0]).toMatchObject({ tone: 'danger', count: 1, href: '/manage/events/7/results', hint: 'Old race' });
    expect(items[1]).toMatchObject({ tone: 'warning', count: 1, href: '/manage/events/8/registrations' });
  });

  it('separates drafts that can go live from drafts that still need categories', () => {
    const items = attentionItems([
      event({ eventId: 1, status: 'Draft', categoryCount: 2 }),
      event({ eventId: 2, status: 'Draft', categoryCount: 0 }),
      event({ eventId: 3, status: 'Draft', categoryCount: 1, eventDate: '2027-01-01T08:00:00' }), // date already passed: cannot be published
    ], now);

    expect(items.map((i) => i.id)).toEqual(['ready-to-publish', 'needs-categories']);
    expect(items[0]).toMatchObject({ count: 1, href: '/manage/events/1' });
    expect(items[1]).toMatchObject({ count: 1, href: '/manage/events/2/categories' });
  });

  it('links to the filtered list when several events are involved', () => {
    const items = attentionItems([event({ eventId: 1, status: 'Draft' }), event({ eventId: 2, status: 'Draft' })], now);
    expect(items[0]).toMatchObject({ count: 2, href: '/manage?status=Draft' });
  });

  it('does not count cancelled events', () => {
    expect(attentionItems([event({ status: 'Cancelled', eventDate: '2027-03-01T08:00:00' })], now)).toEqual([]);
  });
});

describe('eventCapacity', () => {
  it('adds the registrations to the spots left, and is null when nothing limits the event', () => {
    expect(eventCapacity({ registeredCount: 30, spotsLeft: 70 })).toBe(100);
    expect(eventCapacity({ registeredCount: 30, spotsLeft: null })).toBeNull();
    expect(eventCapacity({ registeredCount: 0, spotsLeft: 0 })).toBe(0);
    expect(eventCapacity({ registeredCount: 8, spotsLeft: 54_992 })).toBeNull(); // a 55,000 seat venue is not a goal
  });
});
