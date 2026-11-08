import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { AuthContext, type AuthState } from '../features/auth/auth-context';
import type { Profile } from '../lib/types';

export const participant: Profile = {
  userId: 7, fullName: 'Thandi Mokoena', email: 't@raceday.test', role: 'Participant',
  dateOfBirth: null, gender: null, phone: null, emergencyContactName: null, emergencyContactPhone: null,
  createdAt: '2026-01-01T00:00:00Z',
};

export const anonymousAuth: AuthState = {
  status: 'anonymous', user: null,
  login: vi.fn(), register: vi.fn(), logout: vi.fn(), reloadProfile: vi.fn(), hasRole: () => false,
};

export const signedInAuth: AuthState = { ...anonymousAuth, status: 'authenticated', user: participant, hasRole: (...roles) => roles.includes('Participant') };

interface Options {
  route: string;
  path: string;
  auth?: AuthState;
  /** Stub routes that navigation should be able to reach, as [path, label] pairs. */
  stubs?: [string, string][];
}

/** Renders a page inside the providers it needs, at `route` matched by `path`. Extra routes are stubs. */
export function renderPage(page: ReactElement, { route, path, auth = anonymousAuth, stubs = [] }: Options) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A data router (not <MemoryRouter>) because pages use useBlocker for the unsaved-changes guard
  const router = createMemoryRouter(
    [
      { path, element: page },
      { path: '/login', element: <p>login page</p> },
      { path: '/events', element: <p>events page</p> },
      ...stubs.map(([stubPath, label]) => ({ path: stubPath, element: <p>{label}</p> })),
    ],
    { initialEntries: [route] },
  );

  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

type Handler = unknown | ((init: RequestInit | undefined, url: URL) => Response | unknown | Promise<unknown>);

/** Replaces fetch with routes keyed "METHOD /api/path" (query string ignored). Unknown routes fail the test. */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = routes[key];
    if (handler === undefined) throw new Error(`Unmocked request: ${key}`);
    // handlers may be async, e.g. to hold a response back and observe optimistic updates
    const result = typeof handler === 'function' ? await (handler as (i: RequestInit | undefined, u: URL) => unknown)(init, url) : handler;
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const problem = (status: number, detail: string) =>
  new Response(JSON.stringify({ status, title: 'Error', detail }), { status, headers: { 'Content-Type': 'application/problem+json' } });

export const organizerAuth: AuthState = {
  ...anonymousAuth,
  status: 'authenticated',
  user: { ...participant, userId: 7, role: 'Organizer' },
  hasRole: (...roles) => roles.includes('Organizer'),
};

export const adminAuth: AuthState = {
  ...anonymousAuth,
  status: 'authenticated',
  user: { ...participant, userId: 1, fullName: 'Admin User', role: 'Admin' },
  hasRole: (...roles) => roles.includes('Admin'),
};
