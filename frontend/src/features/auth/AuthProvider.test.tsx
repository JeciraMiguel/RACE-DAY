import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui';
import { session } from '../../lib/session';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

function Probe() {
  const { status, user } = useAuth();
  return <p>status:{status}{user ? ` user:${user.fullName}` : ''}</p>;
}

const renderProvider = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthProvider><Probe /></AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokens = { token: 'access-2', refreshToken: 'refresh-2', email: 'a@b.c', role: 'Participant', expiresAt: '2030-01-01T00:00:00Z' };
const profile = { userId: 1, fullName: 'Thandi Mokoena', email: 'a@b.c', role: 'Participant', dateOfBirth: null, gender: null, phone: null, emergencyContactName: null, emergencyContactPhone: null, createdAt: '2026-01-01T00:00:00Z' };

describe('AuthProvider session restore', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    session.clear();
    session.set({ token: 'stale', refreshToken: 'refresh-1' });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('restores the user from the refresh token', async () => {
    fetchMock.mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json(profile));
    renderProvider();

    expect(await screen.findByText('status:authenticated user:Thandi Mokoena')).toBeInTheDocument();
    expect(session.getRefreshToken()).toBe('refresh-2');
  });

  it('retries after a network blip instead of sending the user to the login page', async () => {
    vi.useFakeTimers();
    // the refresh fails once, then works; the profile fails once, then works
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(tokens))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(profile));
    renderProvider();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(screen.getByText('status:authenticated user:Thandi Mokoena')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('keeps the refresh token after giving up on a profile that cannot be loaded', async () => {
    // e.g. the page is reloaded right after the token was refreshed: an abort must not sign the user out
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(json(tokens)).mockRejectedValue(new TypeError('Failed to fetch'));
    renderProvider();

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(screen.getByText('status:anonymous')).toBeInTheDocument();
    expect(session.getRefreshToken()).toBe('refresh-2');
    vi.useRealTimers();
  });

  it('keeps the refresh token after giving up on a refresh that cannot be completed', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderProvider();

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(screen.getByText('status:anonymous')).toBeInTheDocument();
    expect(session.getRefreshToken()).toBe('refresh-1');
    expect(fetchMock).toHaveBeenCalledTimes(3); // the first attempt plus two retries
    vi.useRealTimers();
  });

  it('forgets the session when the server rejects the profile request or the refresh token', async () => {
    fetchMock.mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json({ detail: 'nope' }, 401)).mockResolvedValueOnce(json({ detail: 'nope' }, 401));
    renderProvider();

    expect(await screen.findByText('status:anonymous')).toBeInTheDocument();
    expect(session.getRefreshToken()).toBeNull();
  });
});
