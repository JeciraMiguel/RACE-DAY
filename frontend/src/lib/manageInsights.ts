import type { RaceEvent } from './types';

export type AttentionTone = 'danger' | 'warning' | 'accent' | 'info';

export interface AttentionItem {
  id: 'results-pending' | 'starting-soon' | 'ready-to-publish' | 'needs-categories';
  tone: AttentionTone;
  title: string;
  hint: string;
  count: number;
  /** Where to go: the event itself when there is just one, otherwise the filtered list. */
  href: string;
}

const DAY = 24 * 60 * 60 * 1000;

const eventHref = (event: RaceEvent, tab = '') => `/manage/events/${event.eventId}${tab}`;
const listHref = (status: string) => `/manage?status=${status}`;

/**
 * What an organizer should look at first, derived from the events they already have:
 * races that ran but are not closed, races about to start, drafts that can go live and
 * drafts that still need categories. Items with nothing to do are left out.
 */
export function attentionItems(events: RaceEvent[], now = new Date()): AttentionItem[] {
  const started = (e: RaceEvent) => new Date(e.eventDate) <= now;
  const published = events.filter((e) => e.status === 'Published');
  const drafts = events.filter((e) => e.status === 'Draft');

  const resultsPending = published.filter(started);
  const soon = published.filter((e) => !started(e) && new Date(e.eventDate).getTime() - now.getTime() <= 7 * DAY);
  const ready = drafts.filter((e) => e.categoryCount > 0 && !started(e));
  const incomplete = drafts.filter((e) => e.categoryCount === 0);

  const items: AttentionItem[] = [];

  if (resultsPending.length > 0) {
    items.push({
      id: 'results-pending',
      tone: 'danger',
      title: resultsPending.length === 1 ? 'Race run: record results' : 'Races run: record results',
      hint: resultsPending.length === 1 ? resultsPending[0]!.title : 'Record the times and mark them completed',
      count: resultsPending.length,
      href: resultsPending.length === 1 ? eventHref(resultsPending[0]!, '/results') : listHref('Published'),
    });
  }
  if (soon.length > 0) {
    items.push({
      id: 'starting-soon',
      tone: 'warning',
      title: 'Starting this week',
      hint: soon.length === 1 ? soon[0]!.title : 'Check registrations and categories',
      count: soon.length,
      href: soon.length === 1 ? eventHref(soon[0]!, '/registrations') : listHref('Published'),
    });
  }
  if (ready.length > 0) {
    items.push({
      id: 'ready-to-publish',
      tone: 'accent',
      title: 'Ready to publish',
      hint: ready.length === 1 ? ready[0]!.title : 'Drafts with categories',
      count: ready.length,
      href: ready.length === 1 ? eventHref(ready[0]!) : listHref('Draft'),
    });
  }
  if (incomplete.length > 0) {
    items.push({
      id: 'needs-categories',
      tone: 'info',
      title: 'Drafts without categories',
      hint: incomplete.length === 1 ? incomplete[0]!.title : 'Add a distance before publishing',
      count: incomplete.length,
      href: incomplete.length === 1 ? eventHref(incomplete[0]!, '/categories') : listHref('Draft'),
    });
  }
  return items;
}

/** At this size the limit is the building (a stadium), not a goal worth a progress bar. */
const PRACTICALLY_UNLIMITED = 10_000;

/** Total places for an event when something meaningful limits it, otherwise null. */
export function eventCapacity(event: Pick<RaceEvent, 'registeredCount' | 'spotsLeft'>): number | null {
  if (event.spotsLeft === null) return null;
  const capacity = event.registeredCount + event.spotsLeft;
  return capacity >= PRACTICALLY_UNLIMITED ? null : capacity;
}
