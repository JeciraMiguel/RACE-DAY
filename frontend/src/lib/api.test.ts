import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl } from './api';
import { session } from './session';

const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });

const tokens = (n: number) => ({ token: `access-${n}`, refreshToken: `refresh-${n}`, email: 'a@b.c', role: 'Participant', expiresAt: '2030-01-01T00:00:00Z' });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    session.clear();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('builds query strings and skips empty values', () => {
    expect(buildUrl('/events', { search: 'city run', page: 2, status: undefined, q: null, empty: '' })).toBe('/api/events?search=city+run&page=2');
    expect(buildUrl('/events')).toBe('/api/events');
  });

  it('sends the bearer token and parses JSON', async () => {
    session.set({ token: 'abc', refreshToken: 'r' });
    fetchMock.mockResolvedValueOnce(json({ ok: true }));

    await expect(api<{ ok: boolean }>('/ping')).resolves.toEqual({ ok: true });

    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('does not send a token when auth is false', async () => {
    session.set({ token: 'abc', refreshToken: 'r' });
    fetchMock.mockResolvedValueOnce(json({}));
    await api('/auth/login', { method: 'POST', body: { a: 1 }, auth: false });
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api('/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('turns ProblemDetails into an ApiError', async () => {
    fetchMock.mockResolvedValueOnce(json({ title: 'Conflict', status: 409, detail: 'This category is full.' }, 409, 'application/problem+json'));
    const error = await api('/registrations', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, detail: 'This category is full.' });
  });

  it('normalises validation error keys to camelCase fields', async () => {
    fetchMock.mockResolvedValueOnce(json({ title: 'One or more validation errors occurred.', status: 400, errors: { Password: ['Too short'], '$.email': ['Invalid'] } }, 400));
    const error = (await api('/auth/register', { method: 'POST', body: {}, auth: false }).catch((e) => e)) as ApiError;
    expect(error.errors).toEqual({ password: ['Too short'], email: ['Invalid'] });
  });

  it('uses friendly fallbacks when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const error = (await api('/x').catch((e) => e)) as ApiError;
    expect(error.status).toBe(500);
    expect(error.detail).toMatch(/something went wrong/i);
  });

  it('reports network failures with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = (await api('/x').catch((e) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0 });
    expect(error.detail).toMatch(/cannot reach the server/i);
  });

  it('refreshes once on 401 and retries the request', async () => {
    session.set({ token: 'old', refreshToken: 'refresh-1' });
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(tokens(2)))
      .mockResolvedValueOnce(json({ data: 1 }));

    await expect(api('/secure')).resolves.toEqual({ data: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/refresh');
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({ refreshToken: 'refresh-1' });
    expect((fetchMock.mock.calls[2]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
    expect(session.getRefreshToken()).toBe('refresh-2'); // rotated
  });

  it('shares a single refresh between concurrent 401s', async () => {
    session.set({ token: 'old', refreshToken: 'refresh-1' });
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return json(tokens(2));
      const authorized = session.getAccessToken() === 'access-2';
      return authorized ? json({ url }) : json({}, 401);
    });

    await Promise.all([api('/a'), api('/b'), api('/c')]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session and notifies when the refresh fails', async () => {
    session.set({ token: 'old', refreshToken: 'refresh-1' });
    const expired = vi.fn();
    const off = session.onExpired(expired);

    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ detail: 'Invalid refresh token.' }, 401));

    await expect(api('/secure')).rejects.toMatchObject({ status: 401 });

    expect(expired).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBeNull();
    expect(session.getRefreshToken()).toBeNull();
    off();
  });

  it('keeps the session when the refresh fails because of the network or the server', async () => {
    session.set({ token: 'old', refreshToken: 'refresh-1' });
    const expired = vi.fn();
    const off = session.onExpired(expired);

    // 1) the connection drops mid-refresh (offline, or the page is being reloaded)
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api('/secure')).rejects.toMatchObject({ status: 401 });
    expect(session.getRefreshToken()).toBe('refresh-1');

    // 2) the server is down
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ detail: 'boom' }, 503));
    await expect(api('/secure')).rejects.toMatchObject({ status: 401 });
    expect(session.getRefreshToken()).toBe('refresh-1');

    expect(expired).not.toHaveBeenCalled();
    off();
  });

  it('never tries to refresh for auth:false requests', async () => {
    session.set({ token: 'old', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Invalid email or password.' }, 401));

    await expect(api('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({ detail: 'Invalid email or password.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
