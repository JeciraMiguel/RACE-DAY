import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component as MyRegistrationsPage } from './MyRegistrations';
import { Component as MyResultsPage } from './MyResults';
import { Component as ProfilePage } from './ProfilePage';
import { mockApi, participant, problem, renderPage, signedInAuth } from '../../test/utils';
import type { MyResult, Registration } from '../../lib/types';

afterEach(() => vi.unstubAllGlobals());

const registration = (over: Partial<Registration> = {}): Registration => ({
  registrationId: 1, categoryId: 10, categoryName: '10 km', eventId: 1, eventTitle: 'City 10K', participantName: 'Thandi Mokoena',
  raceNumber: 42, registrationDate: '2026-11-01T00:00:00Z', status: 'Confirmed', paymentStatus: 'Pending',
  eventDate: '2099-03-14T07:00:00', eventStatus: 'Published', entryFee: 150, hasResult: false, canCancel: true, ...over,
});

describe('My races page', () => {
  const page = () => renderPage(<MyRegistrationsPage />, { route: '/me/registrations', path: '/me/registrations', auth: signedInAuth });

  const all = [
    registration({ registrationId: 1 }),
    registration({ registrationId: 2, eventId: 2, eventTitle: 'Old Race', eventDate: '2020-01-01T08:00:00', eventStatus: 'Completed', hasResult: true, canCancel: false, paymentStatus: 'Paid' }),
    registration({ registrationId: 3, eventId: 3, eventTitle: 'Dropped Race', status: 'Cancelled', canCancel: false }),
    registration({ registrationId: 4, eventId: 4, eventTitle: 'Called Off', eventStatus: 'Cancelled', canCancel: false }),
  ];

  it('groups registrations into upcoming, past and cancelled with counts', async () => {
    mockApi({ 'GET /api/registrations': all });
    page();

    expect(await screen.findByRole('tab', { name: 'Upcoming (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Past (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cancelled (2)' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'City 10K' })).toHaveAttribute('href', '/events/1');
    expect(screen.getByText('42')).toBeInTheDocument(); // bib
    expect(screen.getByText(/pay the organizer/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Past (1)' }));
    expect(await screen.findByRole('link', { name: 'Old Race' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Results' })).toHaveAttribute('href', '/events/2/results');
    expect(screen.getByText('Payment paid')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Cancelled (2)' }));
    expect(await screen.findByText('Registration cancelled')).toBeInTheDocument();
    expect(screen.getByText('Event cancelled')).toBeInTheDocument();
  });

  it('cancels a registration after confirmation and refreshes the list', async () => {
    let cancelled = false;
    const fetchMock = mockApi({
      'GET /api/registrations': () => [registration({ status: cancelled ? 'Cancelled' : 'Confirmed', canCancel: !cancelled })],
      'DELETE /api/registrations/1': () => { cancelled = true; return new Response(null, { status: 204 }); },
    });
    page();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel registration for City 10K' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel your registration?' });
    expect(within(dialog).getByText(/race number #42/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel registration' }));

    expect(await screen.findByText('Your registration was cancelled.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Cancelled (1)' })).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('moves a cancelled registration to the Cancelled tab before the server answers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mockApi({
      'GET /api/registrations': [registration()],
      'DELETE /api/registrations/1': async () => { await gate; return new Response(null, { status: 204 }); },
    });
    page();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel registration for City 10K' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel registration' }));

    expect(await screen.findByRole('tab', { name: 'Upcoming (0)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cancelled (1)' })).toBeInTheDocument();
    release();
  });

  it('puts the registration back when the server refuses the cancellation', async () => {
    mockApi({
      'GET /api/registrations': [registration()],
      'DELETE /api/registrations/1': () => problem(409, 'The cancellation period has ended.'),
    });
    page();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel registration for City 10K' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel registration' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The cancellation period has ended.');
    expect(await screen.findByRole('tab', { name: 'Upcoming (1)' })).toBeInTheDocument();
  });

  it('shows the server message when cancelling is refused', async () => {
    mockApi({
      'GET /api/registrations': [registration()],
      'DELETE /api/registrations/1': () => problem(409, 'The cancellation period has ended.'),
    });
    page();

    await userEvent.click(await screen.findByRole('button', { name: /Cancel registration for/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel registration' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The cancellation period has ended.');
  });

  it('does not offer cancelling when the server says it is no longer possible', async () => {
    mockApi({ 'GET /api/registrations': [registration({ canCancel: false })] });
    page();

    await screen.findByRole('link', { name: 'City 10K' });
    expect(screen.queryByRole('button', { name: /Cancel registration for/ })).not.toBeInTheDocument();
  });

  it('invites new users to browse events', async () => {
    mockApi({ 'GET /api/registrations': [] });
    page();

    expect(await screen.findByText('You have not registered for a race yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse events' })).toHaveAttribute('href', '/events');
  });
});

describe('My results page', () => {
  const result = (over: Partial<MyResult> = {}): MyResult => ({
    resultId: 1, registrationId: 1, eventId: 1, eventTitle: 'City 10K', eventDate: '2026-09-12T08:00:00', categoryId: 10, categoryName: '10 km',
    raceNumber: 42, status: 'Finished', finishTime: '00:41:02', rank: 2, finishers: 14, ...over,
  });
  const page = () => renderPage(<MyResultsPage />, { route: '/me/results', path: '/me/results', auth: signedInAuth });

  it('summarises the results and lists each race with the place', async () => {
    mockApi({
      'GET /api/results/mine': [
        result(),
        result({ resultId: 2, eventId: 2, eventTitle: 'Trail Run', rank: 1, finishers: 30, finishTime: '01:12:00' }),
        result({ resultId: 3, eventId: 3, eventTitle: 'Half', rank: null, status: 'DNF', finishTime: null }),
      ],
    });
    page();

    const table = await screen.findByRole('table', { name: 'My results' });
    expect(within(table).getByText('41:02')).toBeInTheDocument();
    expect(within(table).getByText('2nd')).toBeInTheDocument();
    expect(within(table).getByText('of 14')).toBeInTheDocument();
    expect(within(table).getByText('DNF')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'City 10K' })).toHaveAttribute('href', '/events/1/results');

    // 2 finished, 2 podiums, best place 1st
    expect(screen.getByText('Races finished').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Podiums').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Best place').nextElementSibling).toHaveTextContent('1st');
  });

  it('shows an empty state before any result exists', async () => {
    mockApi({ 'GET /api/results/mine': [] });
    page();
    expect(await screen.findByText('No results yet')).toBeInTheDocument();
  });
});

describe('Profile page', () => {
  const auth = () => ({ ...signedInAuth, reloadProfile: vi.fn(async () => {}), logout: vi.fn(async () => {}) });
  const page = (a = auth()) => {
    renderPage(<ProfilePage />, { route: '/me/profile', path: '/me/profile', auth: a });
    return a;
  };

  it('prefills the form and saves the changes, then reloads the profile', async () => {
    const fetchMock = mockApi({ 'PUT /api/auth/me': () => ({ ...participant }) });
    const a = page();

    const name = screen.getByLabelText(/full name/i);
    expect(name).toHaveValue('Thandi Mokoena');
    expect(screen.getByText('t@raceday.test')).toBeInTheDocument(); // email is read-only

    await userEvent.type(screen.getByLabelText('Phone'), '+27 82 000 0000');
    await userEvent.selectOptions(screen.getByLabelText('Gender'), 'Female');
    await userEvent.type(screen.getByLabelText('Date of birth'), '1990-05-17');
    await userEvent.type(screen.getByLabelText('Contact name'), 'Sipho');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Your profile was saved.')).toBeInTheDocument();
    expect(a.reloadProfile).toHaveBeenCalled();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({
      fullName: 'Thandi Mokoena', dateOfBirth: '1990-05-17', gender: 'Female', phone: '+27 82 000 0000',
      emergencyContactName: 'Sipho', emergencyContactPhone: null,
    });
  });

  it('validates the name on the client and maps server field errors', async () => {
    mockApi({
      'PUT /api/auth/me': () => new Response(JSON.stringify({ status: 400, title: 'Invalid', errors: { Phone: ['Phone is too long.'] } }), { status: 400, headers: { 'Content-Type': 'application/problem+json' } }),
    });
    page();

    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter your full name.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/full name/i), 'Thandi');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Phone is too long.')).toBeInTheDocument();
  });

  it('checks the new password before calling the server', async () => {
    const fetchMock = mockApi({});
    page();

    await userEvent.type(screen.getByLabelText('Current password'), 'Password123!');
    await userEvent.type(screen.getByLabelText('New password'), 'weak');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs the user out and goes to the login page after changing the password', async () => {
    const fetchMock = mockApi({ 'POST /api/auth/change-password': () => new Response(null, { status: 204 }) });
    const a = page();

    await userEvent.type(screen.getByLabelText('Current password'), 'Password123!');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPassword456');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassword456');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(a.logout).toHaveBeenCalled();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ currentPassword: 'Password123!', newPassword: 'NewPassword456' });
  });

  it('shows a wrong current password under that field and stays signed in', async () => {
    mockApi({ 'POST /api/auth/change-password': () => problem(400, 'Current password is incorrect.') });
    const a = page();

    await userEvent.type(screen.getByLabelText('Current password'), 'Wrong-password-1');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPassword456');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassword456');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
    expect(a.logout).not.toHaveBeenCalled();
  });
});
