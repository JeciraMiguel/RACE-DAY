import { session } from './session';
import type { AuthResponse } from './types';

const BASE = '/api';

/** Error thrown for every failed request. `detail` is a message that is safe to show. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  /** Field -> messages, present for validation problems (HTTP 400). Keys are camelCase. */
  readonly errors?: Record<string, string[]>;

  constructor(status: number, detail: string, errors?: Record<string, string[]>) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.errors = errors;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** Multipart body (used for events with banner images). */
  form?: FormData;
  query?: Query;
  /** Set false for endpoints that must not carry (or refresh) a token, e.g. login. */
  auth?: boolean;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' };
  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form; // the browser sets the multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const token = options.auth === false ? null : session.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
}

function lowerFirst(key: string): string {
  return key.charAt(0).toLowerCase() + key.slice(1);
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = '';
  let errors: Record<string, string[]> | undefined;

  try {
    const data = await response.json();
    detail = data.detail ?? data.title ?? '';
    if (data.errors && typeof data.errors === 'object') {
      errors = {};
      for (const [key, messages] of Object.entries(data.errors)) {
        // ASP.NET reports "Password" or "$.password"; normalise to the camelCase field name
        const field = lowerFirst(key.replace(/^\$\./, ''));
        errors[field] = Array.isArray(messages) ? (messages as string[]) : [String(messages)];
      }
      detail = detail || 'Please correct the highlighted fields.';
    }
  } catch {
    // not JSON
  }

  return new ApiError(response.status, detail || fallbackMessage(response.status), errors);
}

function fallbackMessage(status: number): string {
  switch (status) {
    case 401: return 'You need to sign in to do that.';
    case 403: return 'You do not have permission to do that.';
    case 404: return 'We could not find what you were looking for.';
    case 429: return 'Too many requests. Please wait a moment and try again.';
    default: return status >= 500 ? 'Something went wrong on our side. Please try again.' : 'The request failed.';
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers share one request
 * (refresh tokens rotate, so a second parallel call would be treated as token reuse).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = session.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await send('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });
      if (!response.ok) throw await toApiError(response);
      session.set((await response.json()) as AuthResponse);
      return true;
    } catch (error) {
      // Only a definitive rejection ends the session. A network failure or server error (offline, the page
      // being reloaded or closed mid-request, a restart) must keep the refresh token: the next attempt can
      // still succeed, and wiping it here would sign the user out for no reason.
      const transient = error instanceof ApiError && (error.status === 0 || error.status >= 500);
      if (!transient) {
        session.clear();
        session.notifyExpired();
      }
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Sends a request, refreshing the session once on 401, and throws ApiError for non-2xx responses. */
async function request(path: string, options: RequestOptions): Promise<Response> {
  let response = await send(path, options);

  if (response.status === 401 && options.auth !== false && session.getRefreshToken()) {
    if (await refreshSession()) response = await send(path, options);
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

/** Typed JSON request helper with one transparent refresh-and-retry on 401. */
export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  return (contentType.includes('json') ? await response.json() : await response.text()) as T;
}

/** Fetches a file (e.g. a CSV export) with the bearer token. `filename` comes from Content-Disposition. */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<{ blob: Blob; filename: string | null }> {
  const response = await request(path, options);
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match ? decodeURIComponent(match[1]!) : null };
}
