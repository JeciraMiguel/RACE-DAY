import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component as CategoriesTab } from './CategoriesTab';
import { Component as Dashboard } from './Dashboard';
import { Component as DetailsTab } from './DetailsTab';
import { Component as EventManageLayout } from './EventManageLayout';
import { Component as NewEvent } from './NewEvent';
import { Component as RegistrationsTab } from './RegistrationsTab';
import { Component as ResultsTab } from './ResultsTab';
import { Component as UsersPage } from './UsersPage';
import { Component as VenuesPage } from './VenuesPage';
import { adminAuth, mockApi, organizerAuth, problem, renderPage } from '../../test/utils';
import { localNaiveNow } from '../../lib/format';
import type { Category, EventDetail, Participant, RaceEvent, ResultRow, Venue } from '../../lib/types';

afterEach(() => vi.unstubAllGlobals());

const category = (over: Partial<Category> = {}): Category => ({
  categoryId: 10, name: '10 km', entryFee: 150, eventId: 1, distanceKm: 10, startTime: '07:00:00', maxParticipants: 50,
  minAge: null, maxAge: null, gender: null, registeredCount: 3, spotsLeft: 47, ...over,
});

const detail = (over: Partial<EventDetail> = {}): EventDetail => ({
  eventId: 1, title: 'City 10K', description: 'A fast route.', eventDate: '2099-03-14T07:00:00', venueId: 1, venueName: 'Stadium', imageUrl: null,
  status: 'Draft', organizerId: 7, registrationOpensAt: null, registrationClosesAt: null, categoryCount: 1, minEntryFee: 150, spotsLeft: 47,
  registeredCount: 3, categories: [category()], ...over,
});

const listEvent = (over: Partial<RaceEvent> = {}): RaceEvent => {
  const { categories, ...rest } = detail();
  void categories;
  return { ...rest, ...over };
};

const venue: Venue = { venueId: 1, name: 'Stadium', location: 'Green Point', city: 'Cape Town', description: null, capacity: 55000, timeZone: 'Africa/Johannesburg' };

const participant = (over: Partial<Participant> = {}): Participant => ({
  registrationId: 100, participantName: 'Thandi Mokoena', email: 'thandi@raceday.test', phone: null, categoryId: 10, categoryName: '10 km',
  raceNumber: 214, status: 'Confirmed', paymentStatus: 'Pending', registrationDate: '2026-11-01T00:00:00Z', ...over,
});

const resultRow = (over: Partial<ResultRow> = {}): ResultRow => ({
  resultId: 1, registrationId: 100, categoryId: 10, categoryName: '10 km', raceNumber: 214, participantName: 'Thandi Mokoena',
  status: 'Finished', finishTime: '00:39:30', rank: 1, ...over,
});

/** Renders the event management layout with its real tab pages at `/manage/events/1/<tab>`. */
function renderEventArea(tab: string, auth = organizerAuth) {
  return renderPage(
    <Routes>
      <Route element={<EventManageLayout />}>
        <Route index element={<DetailsTab />} />
        <Route path="categories" element={<CategoriesTab />} />
        <Route path="registrations" element={<RegistrationsTab />} />
        <Route path="results" element={<ResultsTab />} />
      </Route>
    </Routes>,
    { route: `/manage/events/1${tab ? `/${tab}` : ''}`, path: '/manage/events/:id/*', auth },
  );
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, pathPart: string) => {
  const call = fetchMock.mock.calls.find(([url, init]) => init?.method === method && String(url).includes(pathPart))!;
  return call[1]!.body;
};

describe('Dashboard', () => {
  it('lists only the organizer\'s own events', async () => {
    const fetchMock = mockApi({ 'GET /api/events': { items: [listEvent({ title: 'City 10K', registeredCount: 12 })], page: 1, pageSize: 10, totalCount: 1 } });
    renderPage(<Dashboard />, { route: '/manage', path: '/manage', auth: organizerAuth });

    const card = (await screen.findByRole('heading', { name: 'City 10K' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'City 10K' })).toHaveAttribute('href', '/manage/events/1');
    expect(within(card).getByText('12')).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('mine=true'))).toBe(true);
    expect(screen.queryByLabelText('Platform overview')).not.toBeInTheDocument();
  });

  it('shows platform stats and every event to admins', async () => {
    const fetchMock = mockApi({
      'GET /api/events': { items: [listEvent()], page: 1, pageSize: 10, totalCount: 1 },
      'GET /api/stats': { eventsByStatus: { Draft: 2, Published: 5, Cancelled: 0, Completed: 1 }, users: 40, confirmedRegistrations: 120, resultsRecorded: 80 },
    });
    renderPage(<Dashboard />, { route: '/manage', path: '/manage', auth: adminAuth });

    const overview = await screen.findByLabelText('Platform overview');
    expect(within(overview).getByText('120')).toBeInTheDocument();
    expect(within(overview).getByText('40')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/events') && String(url).includes('mine'))).toBe(false);
  });

  it('puts what needs attention up front, each item linking to the right place', async () => {
    const day = 24 * 60 * 60 * 1000;
    const page = (items: RaceEvent[]) => ({ items, page: 1, pageSize: 100, totalCount: items.length });
    mockApi({
      'GET /api/events': page([
        listEvent({ eventId: 5, title: 'Ran already', status: 'Published', eventDate: localNaiveNow(new Date(Date.now() - 3 * day)) }),
        listEvent({ eventId: 6, title: 'Starting soon', status: 'Published', eventDate: localNaiveNow(new Date(Date.now() + 2 * day)) }),
        listEvent({ eventId: 7, title: 'Draft ready', status: 'Draft', categoryCount: 2, eventDate: '2099-01-01T08:00:00' }),
      ]),
    });
    renderPage(<Dashboard />, { route: '/manage', path: '/manage', auth: organizerAuth });

    const region = await screen.findByLabelText('Needs your attention');
    expect(within(region).getByRole('link', { name: /Race run: record results/ })).toHaveAttribute('href', '/manage/events/5/results');
    expect(within(region).getByRole('link', { name: /Starting this week/ })).toHaveAttribute('href', '/manage/events/6/registrations');
    expect(within(region).getByRole('link', { name: /Ready to publish/ })).toHaveAttribute('href', '/manage/events/7');
  });

  it('says so when nothing needs attention', async () => {
    mockApi({ 'GET /api/events': { items: [listEvent({ status: 'Published', eventDate: '2099-06-01T08:00:00' })], page: 1, pageSize: 100, totalCount: 1 } });
    renderPage(<Dashboard />, { route: '/manage', path: '/manage', auth: organizerAuth });

    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Needs your attention')).not.toBeInTheDocument();
  });

  it('shows how full an event is and filters by status with counts', async () => {
    const items = [
      listEvent({ eventId: 1, title: 'City 10K', status: 'Published', eventDate: '2099-06-01T08:00:00', registeredCount: 30, spotsLeft: 70 }),
      listEvent({ eventId: 2, title: 'Draft one', status: 'Draft', categoryCount: 0 }),
    ];
    const fetchMock = mockApi({ 'GET /api/events': { items, page: 1, pageSize: 100, totalCount: 2 } });
    renderPage(<Dashboard />, { route: '/manage', path: '/manage', auth: organizerAuth });

    expect(await screen.findByRole('progressbar', { name: 'Registrations for City 10K: 30 of 100' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /All/ })).toHaveAccessibleName('All 2');
    expect(screen.getByRole('radio', { name: /Draft/ })).toHaveAccessibleName('Draft 1');

    await userEvent.click(screen.getByRole('radio', { name: /Draft/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=Draft'))).toBe(true));
  });

  it('invites organizers to create their first event', async () => {
    mockApi({ 'GET /api/events': { items: [], page: 1, pageSize: 10, totalCount: 0 } });
    renderPage(<Dashboard />, { route: '/manage', path: '/manage', auth: organizerAuth });

    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new event|create an event/i })[0]).toHaveAttribute('href', '/manage/events/new');
  });
});

describe('Event management layout', () => {
  it('shows the publish checklist for drafts and publishes', async () => {
    const fetchMock = mockApi({ 'GET /api/events/1': detail(), 'POST /api/events/1/publish': () => new Response(null, { status: 204 }), 'GET /api/venues': [venue] });
    renderEventArea('');

    expect(await screen.findByRole('heading', { name: 'City 10K' })).toBeInTheDocument();
    expect(screen.getByText(/At least one category/)).toHaveTextContent('✓');
    expect(screen.getByText(/date is in the future/)).toHaveTextContent('✓');

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Event published.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'POST' && String(url).endsWith('/events/1/publish'))).toBe(true);
  });

  it('flags what is missing and surfaces the server message when publishing fails', async () => {
    mockApi({
      'GET /api/events/1': detail({ categories: [] }),
      'POST /api/events/1/publish': () => problem(409, 'Add at least one category before publishing.'),
      'GET /api/venues': [venue],
    });
    renderEventArea('');

    expect(await screen.findByText(/At least one category/)).toHaveTextContent('○');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one category before publishing.');
  });

  it('asks for confirmation before cancelling an event', async () => {
    const fetchMock = mockApi({ 'GET /api/events/1': detail({ status: 'Published' }), 'GET /api/results/event/1': [], 'POST /api/events/1/cancel': () => new Response(null, { status: 204 }), 'GET /api/venues': [venue] });
    renderEventArea('');

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancel event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this event?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel event' }));

    expect(await screen.findByText('Event cancelled.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/events/1/cancel'))).toBe(true);
  });

  it('only lets admins delete events', async () => {
    mockApi({ 'GET /api/events/1': detail(), 'GET /api/venues': [venue] });
    const { unmount } = renderEventArea('', organizerAuth);
    await screen.findByRole('heading', { name: 'City 10K' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete event' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cancel event' })).toBeInTheDocument();
    unmount();

    mockApi({ 'GET /api/events/1': detail(), 'GET /api/venues': [venue] });
    renderEventArea('', adminAuth);
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete event' })).toBeInTheDocument();
  });

  it('blocks organizers from events they do not own', async () => {
    mockApi({ 'GET /api/events/1': detail({ organizerId: 99 }) });
    renderEventArea('');
    expect(await screen.findByText('This is not your event')).toBeInTheDocument();
  });

  it('shows a not-found state for unknown events', async () => {
    mockApi({ 'GET /api/events/1': () => problem(404, 'nope') });
    renderEventArea('');
    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });
});

describe('Event form', () => {
  it('creates a draft with multipart data and continues to the categories step', async () => {
    const fetchMock = mockApi({
      'GET /api/venues': [venue],
      'POST /api/events': () => listEvent({ eventId: 5 }),
    });
    renderPage(<NewEvent />, { route: '/manage/events/new', path: '/manage/events/new', auth: organizerAuth, stubs: [['/manage/events/5/categories', 'categories step']] });

    await screen.findByRole('option', { name: /Stadium/ });
    await userEvent.type(screen.getByLabelText(/^Title/), 'Spring Classic');
    await userEvent.type(screen.getByLabelText(/Date and start time/), '2099-09-05T07:30');
    await userEvent.selectOptions(screen.getByLabelText(/^Venue/), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText('categories step')).toBeInTheDocument();
    const form = bodyOf(fetchMock, 'POST', '/events') as FormData;
    expect(form.get('Title')).toBe('Spring Classic');
    expect(form.get('EventDate')).toBe('2099-09-05T07:30');
    expect(form.get('VenueId')).toBe('1');
    expect(form.has('RegistrationOpensAt')).toBe(false);
  });

  it('shows validation errors without calling the server', async () => {
    const fetchMock = mockApi({ 'GET /api/venues': [venue] });
    renderPage(<NewEvent />, { route: '/manage/events/new', path: '/manage/events/new', auth: organizerAuth });

    await screen.findByRole('option', { name: /Stadium/ });
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(screen.getByText('Choose the date and start time.')).toBeInTheDocument();
    expect(screen.getByText('Choose a venue.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('points to the venues page when there are none', async () => {
    mockApi({ 'GET /api/venues': [] });
    renderPage(<NewEvent />, { route: '/manage/events/new', path: '/manage/events/new', auth: organizerAuth });
    expect(await screen.findByRole('link', { name: 'Add one first' })).toHaveAttribute('href', '/manage/venues');
  });

  it('prefills the details tab and saves changes with PUT', async () => {
    const fetchMock = mockApi({
      'GET /api/events/1': detail(),
      'GET /api/venues': [venue],
      'PUT /api/events/1': () => new Response(null, { status: 204 }),
    });
    renderEventArea('');

    const title = await screen.findByLabelText(/^Title/);
    await waitFor(() => expect(title).toHaveValue('City 10K'));
    expect(screen.getByLabelText(/Date and start time/)).toHaveValue('2099-03-14T07:00');

    await userEvent.clear(title);
    await userEvent.type(title, 'City 10K Reloaded');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Event saved.')).toBeInTheDocument();
    expect((bodyOf(fetchMock, 'PUT', '/events/1') as FormData).get('Title')).toBe('City 10K Reloaded');
  });

  it('locks the form for cancelled events', async () => {
    mockApi({ 'GET /api/events/1': detail({ status: 'Cancelled' }), 'GET /api/venues': [venue] });
    renderEventArea('');

    expect(await screen.findByText(/can no longer be edited/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('Unsaved changes guard', () => {
  const renderNew = () => renderPage(<NewEvent />, { route: '/manage/events/new', path: '/manage/events/new', auth: organizerAuth, stubs: [['/manage', 'manage page']] });

  it('lets a pristine form be left without asking', async () => {
    mockApi({ 'GET /api/venues': [venue] });
    renderNew();

    await userEvent.click(await screen.findByRole('link', { name: '← Events' }));
    expect(await screen.findByText('manage page')).toBeInTheDocument();
  });

  it('asks before leaving a form with changes, and can keep editing or discard', async () => {
    mockApi({ 'GET /api/venues': [venue] });
    renderNew();

    await userEvent.type(await screen.findByLabelText(/^Title/), 'Half written');
    await userEvent.click(screen.getByRole('link', { name: '← Events' }));

    let dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument());
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Half written');

    await userEvent.click(screen.getByRole('link', { name: '← Events' }));
    dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('manage page')).toBeInTheDocument();
  });
});

describe('Categories tab', () => {
  it('adds a category with the entered rules', async () => {
    const fetchMock = mockApi({
      'GET /api/events/1': detail({ categories: [] }),
      'GET /api/venues': [venue],
      'POST /api/categories': () => category(),
    });
    renderEventArea('categories');

    await userEvent.click((await screen.findAllByRole('button', { name: /Add (the first )?category/ }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Add category' });
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Women 10 km');
    await userEvent.clear(within(dialog).getByLabelText(/Entry fee/));
    await userEvent.type(within(dialog).getByLabelText(/Entry fee/), '120');
    await userEvent.type(within(dialog).getByLabelText(/Distance/), '10');
    await userEvent.type(within(dialog).getByLabelText(/Maximum participants/), '200');
    await userEvent.selectOptions(within(dialog).getByLabelText('Gender'), 'Female');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));

    expect(await screen.findByText('Category added.')).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'POST', '/categories') as string)).toEqual({
      name: 'Women 10 km', entryFee: 120, distanceKm: 10, startTime: null, maxParticipants: 200, minAge: null, maxAge: null, gender: 'Female', eventId: 1,
    });
  });

  it('validates before sending and edits an existing category', async () => {
    const fetchMock = mockApi({
      'GET /api/events/1': detail(),
      'GET /api/venues': [venue],
      'PUT /api/categories/10': () => new Response(null, { status: 204 }),
    });
    renderEventArea('categories');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit 10 km' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('10 km');
    expect(within(dialog).getByLabelText(/Start time/)).toHaveValue('07:00');

    await userEvent.clear(within(dialog).getByLabelText(/Maximum participants/));
    await userEvent.type(within(dialog).getByLabelText(/Maximum participants/), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/already 3 registrations/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true);

    await userEvent.clear(within(dialog).getByLabelText(/Maximum participants/));
    await userEvent.type(within(dialog).getByLabelText(/Maximum participants/), '60');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Category saved.')).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'PUT', '/categories/10') as string)).toMatchObject({ maxParticipants: 60, startTime: '07:00:00' });
  });

  it('reports why a category cannot be deleted', async () => {
    mockApi({
      'GET /api/events/1': detail(),
      'GET /api/venues': [venue],
      'DELETE /api/categories/10': () => problem(409, 'Category has registrations and cannot be deleted.'),
    });
    renderEventArea('categories');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete 10 km' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Category has registrations and cannot be deleted.');
  });

  it('does not offer adding categories to a completed event', async () => {
    mockApi({ 'GET /api/events/1': detail({ status: 'Completed' }), 'GET /api/venues': [venue] });
    renderEventArea('categories');
    await screen.findByRole('table', { name: 'Categories' });
    expect(screen.queryByRole('button', { name: 'Add category' })).not.toBeInTheDocument();
  });
});

describe('Registrations tab', () => {
  const people = [
    participant(),
    participant({ registrationId: 101, participantName: 'Jan van der Merwe', email: 'jan@raceday.test', raceNumber: 87, paymentStatus: 'Paid' }),
    participant({ registrationId: 102, participantName: 'Gone Runner', email: 'gone@raceday.test', raceNumber: 5, status: 'Cancelled' }),
  ];
  const routes = () => ({ 'GET /api/events/1': detail({ status: 'Published' }), 'GET /api/venues': [venue], 'GET /api/events/1/registrations': people });

  it('summarises payments and hides cancelled registrations by default', async () => {
    mockApi(routes());
    renderEventArea('registrations');

    const table = await screen.findByRole('table', { name: 'Registrations' });
    expect(within(table).getByText('Thandi Mokoena')).toBeInTheDocument();
    expect(within(table).queryByText('Gone Runner')).not.toBeInTheDocument();
    expect(screen.getByText(/2 registrations · 1 paid or waived · 1 pending/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Show cancelled'));
    expect(within(screen.getByRole('table', { name: 'Registrations' })).getByText('Gone Runner')).toBeInTheDocument();
  });

  it('filters by name, email or bib and by payment status', async () => {
    mockApi(routes());
    renderEventArea('registrations');
    await screen.findByRole('table', { name: 'Registrations' });

    await userEvent.type(screen.getByLabelText('Search'), '#87');
    let table = screen.getByRole('table', { name: 'Registrations' });
    expect(within(table).getByText('Jan van der Merwe')).toBeInTheDocument();
    expect(within(table).queryByText('Thandi Mokoena')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search'));
    await userEvent.selectOptions(screen.getByLabelText('Payment'), 'Pending');
    table = screen.getByRole('table', { name: 'Registrations' });
    expect(within(table).getByText('Thandi Mokoena')).toBeInTheDocument();
    expect(within(table).queryByText('Jan van der Merwe')).not.toBeInTheDocument();
  });

  it('marks a registration as paid', async () => {
    const fetchMock = mockApi({ ...routes(), 'PATCH /api/registrations/100/payment': () => new Response(null, { status: 204 }) });
    renderEventArea('registrations');

    await userEvent.selectOptions(await screen.findByLabelText('Payment status for Thandi Mokoena'), 'Paid');
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    expect(JSON.parse(bodyOf(fetchMock, 'PATCH', '/payment') as string)).toEqual({ paymentStatus: 'Paid' });
  });

  it('shows a payment change immediately and keeps it once the server confirms', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mockApi({
      ...routes(),
      'PATCH /api/registrations/100/payment': async () => { await gate; return new Response(null, { status: 204 }); },
    });
    renderEventArea('registrations');
    expect(await screen.findByText(/1 paid or waived · 1 pending/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Payment status for Thandi Mokoena'), 'Paid');
    // the server has not answered yet, but the summary already moved
    expect(await screen.findByText(/2 paid or waived · 0 pending/)).toBeInTheDocument();
    release();
  });

  it('rolls a payment change back and tells the user when the server refuses it', async () => {
    mockApi({ ...routes(), 'PATCH /api/registrations/100/payment': () => problem(403, 'You cannot change this payment.') });
    renderEventArea('registrations');
    expect(await screen.findByText(/1 paid or waived · 1 pending/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Payment status for Thandi Mokoena'), 'Paid');

    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change this payment.');
    await waitFor(() => expect(screen.getByLabelText('Payment status for Thandi Mokoena')).toHaveValue('Pending'));
    expect(screen.getByText(/1 paid or waived · 1 pending/)).toBeInTheDocument();
  });

  it('cancels a registration after confirmation', async () => {
    const fetchMock = mockApi({ ...routes(), 'DELETE /api/registrations/100': () => new Response(null, { status: 204 }) });
    renderEventArea('registrations');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel registration of Thandi Mokoena' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this registration?' });
    expect(within(dialog).getByText(/bib #214/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel registration' }));

    expect(await screen.findByText('Registration cancelled.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('exports the registrations as a CSV download', async () => {
    const createObjectURL = vi.fn(() => 'blob:csv');
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();

    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('format=csv')) {
        return new Response('RaceNumber,Name\n214,Thandi', { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=registrations-1.csv' } });
      }
      if (url.includes('/events/1/registrations')) return json(people);
      if (url.endsWith('/events/1')) return json(detail({ status: 'Published' }));
      return json([venue]);
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      renderEventArea('registrations');
      await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
      await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('format=csv'))).toBe(true);
    } finally {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});

describe('Results tab', () => {
  const people = [
    participant(),
    participant({ registrationId: 101, participantName: 'Jan van der Merwe', raceNumber: 87 }),
  ];

  const base = (extra: Record<string, unknown> = {}) => ({
    'GET /api/events/1': detail({ status: 'Published' }),
    'GET /api/venues': [venue],
    'GET /api/events/1/registrations': people,
    'GET /api/results/event/1': [resultRow({ registrationId: 101, raceNumber: 87, participantName: 'Jan van der Merwe', resultId: 2, finishTime: '00:41:00', rank: 2 }), resultRow()],
    ...extra,
  });

  it('identifies the runner by bib and records a result with a normalised time', async () => {
    const fetchMock = mockApi(base({ 'POST /api/results': () => ({ message: 'ok' }) }));
    renderEventArea('results');

    expect(await screen.findByText(/runners have a result/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Results recorded: 2 of 2' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Bib number'), '214');
    expect(await screen.findByText(/Thandi Mokoena · 10 km · already has a result/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Finish time'), '39:30.5{Enter}');
    expect(await screen.findByText(/Saved #214 Thandi Mokoena/)).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'POST', '/results') as string)).toEqual({ registrationId: 100, finishTime: '00:39:30.5', status: 'Finished' });
    expect(screen.getByLabelText('Bib number')).toHaveValue('');
    expect(screen.getByLabelText('Bib number')).toHaveFocus();
    // and the entry is remembered under the form
    expect(within(screen.getByRole('list', { name: 'Recently recorded results' })).getByText('Thandi Mokoena', { exact: false })).toBeInTheDocument();
  });

  it('lists the runners still to record and fills the bib when one is picked', async () => {
    mockApi(base({ 'GET /api/results/event/1': [resultRow({ registrationId: 101, raceNumber: 87, participantName: 'Jan van der Merwe', resultId: 2, rank: 1 })] }));
    renderEventArea('results');

    expect(await screen.findByRole('progressbar', { name: 'Results recorded: 1 of 2' })).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 runners have a result|of 2 runners have a result/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record bib 87/ })).not.toBeInTheDocument(); // already done

    await userEvent.click(screen.getByRole('button', { name: 'Record bib 214, Thandi Mokoena' }));
    expect(screen.getByLabelText('Bib number')).toHaveValue('214');
    expect(await screen.findByText(/Thandi Mokoena · 10 km/)).toBeInTheDocument();
    expect(screen.getByLabelText('Finish time')).toHaveFocus();
  });

  it('congratulates when every runner has a result', async () => {
    mockApi(base());
    renderEventArea('results');
    expect(await screen.findByText(/Everyone has a result/)).toBeInTheDocument();
  });

  it('rejects unknown bibs and malformed times locally', async () => {
    const fetchMock = mockApi(base());
    renderEventArea('results');

    await userEvent.type(await screen.findByLabelText('Bib number'), '999');
    await userEvent.type(screen.getByLabelText('Finish time'), '39:30{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('No confirmed registration has bib #999.');

    await userEvent.clear(screen.getByLabelText('Bib number'));
    await userEvent.type(screen.getByLabelText('Bib number'), '87');
    await userEvent.clear(screen.getByLabelText('Finish time'));
    await userEvent.type(screen.getByLabelText('Finish time'), '99:99{Enter}');
    expect(await screen.findByText('Enter the time as mm:ss or h:mm:ss.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('records a DNF without a time', async () => {
    const fetchMock = mockApi(base({ 'POST /api/results': () => ({ message: 'ok' }) }));
    renderEventArea('results');

    await userEvent.type(await screen.findByLabelText('Bib number'), '87');
    await userEvent.click(screen.getByRole('radio', { name: 'DNF' }));
    expect(screen.getByLabelText('Finish time')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save result' }));

    expect(await screen.findByText(/Saved #87 Jan van der Merwe: DNF/)).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'POST', '/results') as string)).toEqual({ registrationId: 101, finishTime: null, status: 'DNF' });
  });

  it('edits and removes recorded results', async () => {
    const fetchMock = mockApi(base({
      'PUT /api/results/1': () => new Response(null, { status: 204 }),
      'DELETE /api/results/2': () => new Response(null, { status: 204 }),
    }));
    renderEventArea('results');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit result of bib 214' }));
    const dialog = await screen.findByRole('dialog', { name: /Edit result/ });
    await userEvent.clear(within(dialog).getByLabelText('Finish time'));
    await userEvent.type(within(dialog).getByLabelText('Finish time'), '38:59');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Result updated.')).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'PUT', '/results/1') as string)).toEqual({ finishTime: '00:38:59', status: 'Finished' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove result of bib 87' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove this result?' })).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Result removed.')).toBeInTheDocument();
  });

  it('imports a CSV and lists the skipped lines', async () => {
    const fetchMock = mockApi(base({ 'POST /api/results/import': () => ({ imported: 2, errors: [{ line: 4, message: 'No confirmed registration with race number 99.' }] }) }));
    renderEventArea('results');

    const file = new File(['raceNumber,finishTime\n214,00:39:30'], 'results.csv', { type: 'text/csv' });
    await userEvent.upload(await screen.findByLabelText('CSV file'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Import results' }));

    const summary = await screen.findByText(/imported, 1 lines skipped/);
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/Line 4: No confirmed registration with race number 99/)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/results/import'))!;
    expect(String(call[0])).toContain('eventId=1');
    expect((call[1]!.body as FormData).get('file')).toBeInstanceOf(File);
  });
});

describe('Venues page', () => {
  it('adds a venue and shows the server error when deleting one in use', async () => {
    const fetchMock = mockApi({
      'GET /api/venues': [venue],
      'POST /api/venues': () => ({ ...venue, venueId: 2 }),
      'DELETE /api/venues/1': () => problem(409, 'Venue is used by events and cannot be deleted.'),
    });
    renderPage(<VenuesPage />, { route: '/manage/venues', path: '/manage/venues', auth: organizerAuth });

    expect(await screen.findByRole('list', { name: 'Venues' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add venue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add venue' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add venue' }));
    expect(await within(dialog).findByText('Enter a name.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Green Point Park');
    await userEvent.type(within(dialog).getByLabelText(/Address/), 'Somewhere 1');
    await userEvent.clear(within(dialog).getByLabelText('Capacity'));
    await userEvent.type(within(dialog).getByLabelText('Capacity'), '1500');
    await userEvent.clear(within(dialog).getByLabelText('Time zone'));
    await userEvent.type(within(dialog).getByLabelText('Time zone'), 'Africa/Johannesburg');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add venue' }));
    expect(await screen.findByText('Venue added.')).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'POST', '/venues') as string)).toEqual({ name: 'Green Point Park', location: 'Somewhere 1', city: null, description: null, capacity: 1500, timeZone: 'Africa/Johannesburg' });

    await userEvent.click(screen.getByRole('button', { name: 'Delete Stadium' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete venue?' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Venue is used by events and cannot be deleted.');
  });
});

describe('Venues search', () => {
  it('filters the cards and offers to clear a search that finds nothing', async () => {
    mockApi({ 'GET /api/venues': [venue, { ...venue, venueId: 2, name: 'Green Point Park', city: 'Cape Town', location: 'Vlei Rd' }] });
    renderPage(<VenuesPage />, { route: '/manage/venues', path: '/manage/venues', auth: organizerAuth });

    const list = await screen.findByRole('list', { name: 'Venues' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    await userEvent.type(screen.getByLabelText('Search venues'), 'park');
    expect(within(screen.getByRole('list', { name: 'Venues' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Green Point Park')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search venues'));
    await userEvent.type(screen.getByLabelText('Search venues'), 'zzz');
    expect(await screen.findByText('No venue matches your search')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(within(await screen.findByRole('list', { name: 'Venues' })).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('Users page', () => {
  const users = {
    items: [
      { userId: 1, fullName: 'Admin User', email: 'admin@raceday.local', role: 'Admin', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
      { userId: 2, fullName: 'Thandi Mokoena', email: 't@raceday.test', role: 'Participant', isActive: true, createdAt: '2026-02-01T00:00:00Z' },
    ],
    page: 1, pageSize: 15, totalCount: 2,
  };

  it('protects the signed-in admin\'s own row', async () => {
    mockApi({ 'GET /api/users': users });
    renderPage(<UsersPage />, { route: '/manage/users', path: '/manage/users', auth: adminAuth });

    expect(await screen.findByLabelText('Role of Admin User')).toBeDisabled();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate Admin User' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Role of Thandi Mokoena')).toBeEnabled();
  });

  it('changes a role after confirmation', async () => {
    const fetchMock = mockApi({ 'GET /api/users': users, 'PUT /api/users/2/role': () => new Response(null, { status: 204 }) });
    renderPage(<UsersPage />, { route: '/manage/users', path: '/manage/users', auth: adminAuth });

    await userEvent.selectOptions(await screen.findByLabelText('Role of Thandi Mokoena'), 'Organizer');
    const dialog = await screen.findByRole('dialog', { name: 'Change role?' });
    expect(within(dialog).getByText(/signed out immediately/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Thandi Mokoena is now Organizer.')).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'PUT', '/role') as string)).toEqual({ role: 'Organizer' });
  });

  it('deactivates an account after confirmation', async () => {
    const fetchMock = mockApi({ 'GET /api/users': users, 'PUT /api/users/2/active': () => new Response(null, { status: 204 }) });
    renderPage(<UsersPage />, { route: '/manage/users', path: '/manage/users', auth: adminAuth });

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Thandi Mokoena' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Deactivate account?' })).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Thandi Mokoena was deactivated.')).toBeInTheDocument();
    expect(JSON.parse(bodyOf(fetchMock, 'PUT', '/active') as string)).toEqual({ isActive: false });
  });
});

describe('Users role filter', () => {
  const everyone = [
    { userId: 1, fullName: 'Admin User', email: 'admin@raceday.local', role: 'Admin', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
    { userId: 2, fullName: 'Thandi Mokoena', email: 't@raceday.test', role: 'Participant', isActive: true, createdAt: '2026-02-01T00:00:00Z' },
    { userId: 3, fullName: 'Olivia Organizer', email: 'o@raceday.test', role: 'Organizer', isActive: true, createdAt: '2026-03-01T00:00:00Z' },
  ];

  const usersApi = () =>
    mockApi({
      'GET /api/users': (_init: RequestInit | undefined, url: URL) => {
        const role = url.searchParams.get('role');
        const items = role ? everyone.filter((u) => u.role === role) : everyone;
        return { items: items.slice(0, Number(url.searchParams.get('pageSize') ?? 15)), page: 1, pageSize: 15, totalCount: items.length };
      },
    });

  it('shows how many people have each role and filters by it', async () => {
    const fetchMock = usersApi();
    renderPage(<UsersPage />, { route: '/manage/users', path: '/manage/users', auth: adminAuth });

    expect(await screen.findByRole('radio', { name: 'All 3' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Participants 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Organizers 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Admins 1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Organizers 1' }));

    const table = await screen.findByRole('table', { name: 'Users' });
    await waitFor(() => expect(within(table).queryByText('Thandi Mokoena')).not.toBeInTheDocument());
    expect(within(table).getByText('Olivia Organizer')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('role=Organizer') && String(url).includes('pageSize=15'))).toBe(true);
  });
});
