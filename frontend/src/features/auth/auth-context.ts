import { createContext } from 'react';
import type { Profile, RegisterInput, Role } from '../../lib/types';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: Profile | null;
  login: (email: string, password: string) => Promise<Profile>;
  register: (input: RegisterInput) => Promise<Profile>;
  logout: () => Promise<void>;
  /** Re-reads the profile after it was edited. */
  reloadProfile: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

export const AuthContext = createContext<AuthState | null>(null);
