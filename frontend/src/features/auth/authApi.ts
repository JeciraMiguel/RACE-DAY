import { api } from '../../lib/api';
import type { AuthResponse, Profile, RegisterInput, UpdateProfileInput } from '../../lib/types';

export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  register: (input: RegisterInput) => api('/auth/register', { method: 'POST', body: input, auth: false }),

  logout: (refreshToken: string) => api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),

  me: () => api<Profile>('/auth/me'),

  updateProfile: (input: UpdateProfileInput) => api<Profile>('/auth/me', { method: 'PUT', body: input }),

  /** Succeeding signs the user out everywhere: the caller has to sign in again. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
};
