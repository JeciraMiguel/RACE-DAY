import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component as EventDetailPage } from './EventDetail';
import { Component as ResultsPage } from './Results';
import { mockApi, problem, renderPage, signedInAuth } from '../test/utils';
import type { Category, EventDetail, ResultRow } from '../lib/types';

const category = (over: Partial<Category> = {}): Category => ({
  categoryId: 10, name: '10 km', entryFee: 150, eventId: 1, distanceKm: 10, startTime: '07:00:00', maxParticipants: 50,
  minAge: null, maxAge: null, gender: null, registeredCount: 3, spotsLeft: 47, ...over,
});

const eventDetail = (over: Partial<EventDetail> = {}): EventDetail => ({
  eventId: 1, title: 'City 10K', description: 'A fast city route.', eventDate: '2099-03-14T07:00:00', venueId: 1, venueName: 'Cape Town Stadium',
  imageUrl: null, status: 'Published', organizerId: 1, registrationOpensAt: null, registrationClosesAt: null,
  categoryCount: 1, minEntryFee: 150, spotsLeft: 47, registeredCount: 0, categories: [category()], ...over,
});

const venue = { venueId: 1, name: 'Cape Town Stadium', location: 'Green Point', city: 'Cape Town', description: null, capacity: 55000, timeZone: 'Africa/Johannesburg' };

afterEach(() => vi.unstubAllGlobals());

describe('EventDetail page', () => {
  const page = () => renderPage(<EventDetailPage />, { route: '/events/1', path: '/events/:id' });

  it('shows the event, its categories and the registration state', async () => {
    mockApi({ 'GET /api/events/1': eventDetail(), 'GET /api/venues/1': venue });
    page();

    expect(await screen.findByRole('heading', { level: 1, name: 'City 10K' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /categories for city 10k/i });
    expect(within(table).getByText('10 km', { selector: 'strong' })).toBeInTheDocument();
    expect(within(table).getByText('47 left')).toBeInTheDocument();
    expect(screen.getByText('Registration is open')).toBeInTheDocument();
    expect(await screen.findByText(/Green Point/)).toBeInTheDocument();
  });

  it('tells visitors which time zone the event times are in', async () => {
    mockApi({ 'GET /api/events/1': eventDetail(), 'GET /api/venues/1': venue });
    page();

    expect(await screen.findByText('Times are local to the venue (Africa/Johannesburg).')).toBeInTheDocument();
  });

  it('puts the event in the page title and description', async () => {
    mockApi({ 'GET /api/events/1': eventDetail({ description: 'A fast city route.' }), 'GET /api/venues/1': venue });
    page();

    await screen.findByRole('heading', { level: 1, name: 'City 10K' });
    expect(document.title).toBe('City 10K · RaceDay');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'A fast city route.');
  });

  it('sends anonymous visitors to the login page when they try to register', async () => {
    mockApi({ 'GET /api/events/1': eventDetail(), 'GET /api/venues/1': venue });
    page();

    await userEvent.click(await screen.findByRole('button', { name: 'Register for 10 km' }));
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('registers a signed-in user after confirmation and reports the race number', async () => {
    const fetchMock = mockApi({
      'GET /api/events/1': eventDetail(),
      'GET /api/venues/1': venue,
      'GET /api/registrations': [],
      'POST /api/registrations': () => ({ registrationId: 1, categoryId: 10, categoryName: '10 km', eventId: 1, eventTitle: 'City 10K', participantName: 'T', raceNumber: 42, registrationDate: '2026-01-01T00:00:00Z', status: 'Confirmed', paymentStatus: 'Pending', eventDate: '2099-03-14T07:00:00', eventStatus: 'Published', entryFee: 150, hasResult: false, canCancel: true }),
    });
    renderPage(<EventDetailPage />, { route: '/events/1', path: '/events/:id', auth: signedInAuth });

    await userEvent.click(await screen.findByRole('button', { name: 'Register for 10 km' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Register for 10 km at City 10K/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Register' }));

    const success = await screen.findByRole('dialog', { name: "You're registered!" });
    expect(within(success).getByLabelText('Race number 42')).toBeInTheDocument();
    expect(within(success).getByRole('link', { name: 'View my races' })).toHaveAttribute('href', '/me/registrations');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ categoryId: 10 });
  });

  it('shows the server message when the registration is refused', async () => {
    mockApi({
      'GET /api/events/1': eventDetail(),
      'GET /api/venues/1': venue,
      'GET /api/registrations': [],
      'POST /api/registrations': () => problem(409, 'This category is full.'),
    });
    renderPage(<EventDetailPage />, { route: '/events/1', path: '/events/:id', auth: signedInAuth });

    await userEvent.click(await screen.findByRole('button', { name: 'Register for 10 km' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This category is full.');
  });

  it('marks categories the user is already registered for', async () => {
    mockApi({
      'GET /api/events/1': eventDetail(),
      'GET /api/venues/1': venue,
      'GET /api/registrations': [{ registrationId: 5, categoryId: 10, categoryName: '10 km', eventId: 1, eventTitle: 'City 10K', participantName: 'T', raceNumber: 88, registrationDate: '2026-01-01T00:00:00Z', status: 'Confirmed', paymentStatus: 'Paid', eventDate: '2099-03-14T07:00:00', eventStatus: 'Published', entryFee: 150, hasResult: false, canCancel: true }],
    });
    renderPage(<EventDetailPage />, { route: '/events/1', path: '/events/:id', auth: signedInAuth });

    expect(await screen.findByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('#88')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register for 10 km' })).not.toBeInTheDocument();
  });

  it('hides the register button when registration is closed or the category is full', async () => {
    mockApi({
      'GET /api/events/1': eventDetail({ registrationClosesAt: '2020-01-01T00:00:00', categories: [category({ spotsLeft: 0, registeredCount: 50 })] }),
      'GET /api/venues/1': venue,
    });
    page();

    expect(await screen.findByText('Registration closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /register for/i })).not.toBeInTheDocument();
  });

  it('links to the results once the event is completed', async () => {
    mockApi({ 'GET /api/events/1': eventDetail({ status: 'Completed' }), 'GET /api/venues/1': venue });
    page();

    expect(await screen.findByRole('link', { name: 'View results' })).toHaveAttribute('href', '/events/1/results');
  });

  it('shows a friendly page for unknown events', async () => {
    mockApi({ 'GET /api/events/1': () => problem(404, 'Event with ID 1 not found.') });
    page();

    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });
});

describe('Results page', () => {
  const row = (over: Partial<ResultRow>): ResultRow => ({
    resultId: 1, registrationId: 1, categoryId: 10, categoryName: '10 km', raceNumber: 1, participantName: 'Runner',
    status: 'Finished', finishTime: '00:40:00', rank: 1, ...over,
  });

  const rows: ResultRow[] = [
    row({ resultId: 1, raceNumber: 214, participantName: 'Thandi Mokoena', finishTime: '00:39:30.500', rank: 1 }),
    row({ resultId: 2, raceNumber: 87, participantName: 'Jan van der Merwe', finishTime: '00:41:02', rank: 2 }),
    row({ resultId: 3, raceNumber: 301, participantName: 'Lerato Dlamini', finishTime: '00:42:18', rank: 3 }),
    row({ resultId: 4, raceNumber: 55, participantName: 'Pieter Botha', status: 'DNF', finishTime: null, rank: null }),
    row({ resultId: 5, raceNumber: 9, categoryId: 11, categoryName: '21 km', participantName: 'Half Runner', finishTime: '01:30:00', rank: 1 }),
  ];

  const detail = eventDetail({ status: 'Completed', categories: [category(), category({ categoryId: 11, name: '21 km', distanceKm: 21.1 })] });
  const renderResults = () => renderPage(<ResultsPage />, { route: '/events/1/results', path: '/events/:id/results' });

  beforeEach(() => {
    mockApi({ 'GET /api/events/1': detail, 'GET /api/results/event/1': rows });
  });

  it('shows the podium, ranked rows, gaps and non-finishers for the first category', async () => {
    renderResults();

    const podium = await screen.findByRole('list', { name: 'Podium' });
    expect(within(podium).getAllByRole('listitem')).toHaveLength(3);
    expect(within(podium).getByText('Thandi Mokoena')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Results' });
    expect(within(table).getByText('+1:32')).toBeInTheDocument(); // 41:02 vs 39:30
    expect(within(table).getByText('DNF')).toBeInTheDocument();
    expect(screen.getByText(/3 finishers · 1 did not finish or start/)).toBeInTheDocument();
    expect(screen.queryByText('Half Runner')).not.toBeInTheDocument();
  });

  it('shows tied places on the podium by rank, not by position in the list', async () => {
    const tied = [
      row({ resultId: 1, raceNumber: 1, participantName: 'Winner', finishTime: '00:39:00', rank: 1 }),
      row({ resultId: 2, raceNumber: 2, participantName: 'Tied A', finishTime: '00:41:00', rank: 2 }),
      row({ resultId: 3, raceNumber: 3, participantName: 'Tied B', finishTime: '00:41:00', rank: 2 }),
      row({ resultId: 4, raceNumber: 4, participantName: 'Fourth', finishTime: '00:44:00', rank: 4 }),
    ];
    mockApi({ 'GET /api/events/1': detail, 'GET /api/results/event/1': tied });
    renderResults();

    const podium = await screen.findByRole('list', { name: 'Podium' });
    const items = within(podium).getAllByRole('listitem');
    expect(items).toHaveLength(3); // winner and both runners-up; the 4th is not a medalist
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Position 1:Winner'),
      expect.stringContaining('Position 2:Tied A'),
      expect.stringContaining('Position 2:Tied B'),
    ]);
    expect(within(podium).queryByText('Fourth')).not.toBeInTheDocument();
  });

  it('switches categories with the tabs', async () => {
    renderResults();

    await userEvent.click(await screen.findByRole('tab', { name: /21 km/ }));
    const table = await screen.findByRole('table', { name: 'Results' });
    expect(within(table).getByText('Half Runner')).toBeInTheDocument();
    expect(screen.queryByText('Thandi Mokoena')).not.toBeInTheDocument();
  });

  it('filters by name or bib and hides the podium while searching', async () => {
    renderResults();
    const search = await screen.findByLabelText('Find a runner');

    await userEvent.type(search, '#87');
    const table = screen.getByRole('table', { name: 'Results' });
    expect(within(table).getByText('Jan van der Merwe')).toBeInTheDocument();
    expect(within(table).queryByText('Thandi Mokoena')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Podium' })).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'nobody');
    expect(await screen.findByText('No runner matches your search')).toBeInTheDocument();
  });

  it('shows an empty state when nothing has been recorded', async () => {
    mockApi({ 'GET /api/events/1': detail, 'GET /api/results/event/1': [] });
    renderResults();

    await waitFor(() => expect(screen.getByText('No results yet')).toBeInTheDocument());
  });

  it('shows a not-found state for unknown events', async () => {
    mockApi({ 'GET /api/events/1': () => problem(404, 'nope') });
    renderResults();

    expect(await screen.findByText('Results not found')).toBeInTheDocument();
  });
});
