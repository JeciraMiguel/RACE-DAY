/**
 * Token storage. The access token lives in memory only (lost on reload, never exposed to
 * storage); the refresh token lives in sessionStorage so a reload keeps you signed in for
 * the lifetime of the tab.
 */
const REFRESH_KEY = 'raceday.refreshToken';

let accessToken: string | null = null;
const expiredListeners = new Set<() => void>();

function readRefresh(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(value: string | null) {
  try {
    if (value) sessionStorage.setItem(REFRESH_KEY, value);
    else sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // storage unavailable (private mode): the session just will not survive a reload
  }
}

export const session = {
  getAccessToken: () => accessToken,
  getRefreshToken: readRefresh,

  set(tokens: { token: string; refreshToken: string }) {
    accessToken = tokens.token;
    writeRefresh(tokens.refreshToken);
  },

  clear() {
    accessToken = null;
    writeRefresh(null);
  },

  /** Fired when a refresh fails: the user has to sign in again. */
  onExpired(listener: () => void) {
    expiredListeners.add(listener);
    return () => {
      expiredListeners.delete(listener);
    };
  },

  notifyExpired() {
    expiredListeners.forEach((listener) => listener());
  },
};
