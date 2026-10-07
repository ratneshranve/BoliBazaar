import { api } from './client';
import type { Bootstrap, LoginResult, Me, OtpSent, SessionInfo } from './types';

export const configApi = {
  bootstrap: () => api<Bootstrap>('/config/bootstrap', { auth: false }),
};

export const authApi = {
  sendOtp: (phone: string, countryCode: string) =>
    api<OtpSent>('/auth/otp/send', { method: 'POST', body: { phone, countryCode }, auth: false }),
  verifyOtp: (phone: string, countryCode: string, code: string) =>
    api<LoginResult>('/auth/otp/verify', { method: 'POST', body: { phone, countryCode, code }, auth: false }),
  logout: () => api<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),
  registerDevice: (body: {
    fcmToken: string;
    deviceId: string;
    platform: 'android' | 'ios';
    osVersion?: string;
    appVersion?: string;
    model?: string;
    locale?: string;
  }) => api<{ registered: boolean }>('/auth/devices', { method: 'POST', body }),
  removeDevice: (fcmToken: string) => api<{ removed: boolean }>('/auth/devices', { method: 'DELETE', body: { fcmToken } }),
};

export const meApi = {
  get: () => api<Me>('/me'),
  update: (body: Partial<{ name: string; about: string | null; language: string; avatarMediaId: string | null }>) =>
    api<Me>('/me', { method: 'PATCH', body }),
  completeProfile: (body: {
    name: string;
    language?: string;
    ageConfirmed: true;
    consents: { docType: 'terms' | 'privacy' | 'marketing'; version: number }[];
  }) => api<Me>('/me/complete-profile', { method: 'POST', body }),
  sessions: () => api<SessionInfo[]>('/me/sessions'),
  revokeSession: (id: string) => api<{ revoked: boolean }>(`/me/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => api<{ revoked: number }>('/me/sessions', { method: 'DELETE' }),
};
