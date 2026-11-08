import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, refreshSession } from '../../lib/api';
import { session } from '../../lib/session';
import type { Profile, RegisterInput, Role } from '../../lib/types';
import { useToast } from '../../components/ui';
import { AuthContext, type AuthState, type AuthStatus } from './auth-context';
import { authApi } from './authApi';

/** Pauses between attempts while restoring a session after a transient failure. */
const RESTORE_RETRY_DELAYS = [400, 1200];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<Profile | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const signedOut = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session after a reload: the access token is memory-only, so use the refresh token.
  // A transient failure (network blip, server still starting) is retried a couple of times before
  // giving up; a definitive rejection (the token is gone) ends it at once.
  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    async function refresh(): Promise<boolean> {
      for (let attempt = 0; attempt <= RESTORE_RETRY_DELAYS.length; attempt++) {
        if (!session.getRefreshToken()) return false;
        if (await refreshSession()) return true;
        // refreshSession forgets the token on a definitive rejection, so a token that is still here means
        // the failure was transient
        if (!session.getRefreshToken() || attempt === RESTORE_RETRY_DELAYS.length) return false;
        await wait(RESTORE_RETRY_DELAYS[attempt]!);
        if (cancelled) return false;
      }
      return false;
    }

    async function loadProfile(): Promise<Profile | null> {
      for (let attempt = 0; attempt <= RESTORE_RETRY_DELAYS.length; attempt++) {
        try {
          return await authApi.me();
        } catch (error) {
          // Only a definitive rejection forgets the session; a dropped connection (or a reload in the middle of
          // this request) must leave the refresh token for the next attempt
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            session.clear();
            return null;
          }
          if (attempt === RESTORE_RETRY_DELAYS.length) return null;
          await wait(RESTORE_RETRY_DELAYS[attempt]!);
          if (cancelled) return null;
        }
      }
      return null;
    }

    async function restore() {
      const profile = (await refresh()) ? await loadProfile() : null;
      if (cancelled) return;
      if (profile) {
        setUser(profile);
        setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // A failed token refresh anywhere in the app signs the user out
  useEffect(
    () =>
      session.onExpired(() => {
        signedOut();
        toast.info('Your session expired. Please sign in again.');
      }),
    [signedOut, toast],
  );

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    session.set(tokens);
    const profile = await authApi.me();
    setUser(profile);
    setStatus('authenticated');
    return profile;
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      await authApi.register(input);
      return login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    const refreshToken = session.getRefreshToken();
    session.clear();
    signedOut();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // already signed out locally; the token expires on its own
      }
    }
  }, [signedOut]);

  const reloadProfile = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const hasRole = useCallback((...roles: Role[]) => user !== null && roles.includes(user.role), [user]);

  const value = useMemo<AuthState>(
    () => ({ status, user, login, register, logout, reloadProfile, hasRole }),
    [status, user, login, register, logout, reloadProfile, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
