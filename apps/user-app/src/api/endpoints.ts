import { api } from './client';
import type { Bootstrap, CategoryNode, ContentPage, HomeFeed, LoginResult, Me, OtpSent, PlaceLite, PlaceNode, SessionInfo } from './types';

export const homeApi = { get: () => api<HomeFeed>('/home', { auth: false }) };

export const categoriesApi = { tree: () => api<CategoryNode[]>('/categories/tree', { auth: false }) };

export const locationsApi = {
  search: (q: string) => api<PlaceLite[]>('/locations/search', { auth: false, query: { q } }),
  children: (parentId?: string) => api<PlaceNode[]>('/locations/children', { auth: false, query: { parentId } }),
  reverse: (lat: number, lng: number) => api<PlaceLite | null>('/locations/reverse', { auth: false, query: { lat, lng } }),
};

/** Machine-translated UI strings for admin-enabled languages the app doesn't ship */
export const i18nApi = {
  bundle: (lang: string, strings: Record<string, string>) =>
    api<{ lang: string; strings: Record<string, string> }>('/i18n/bundle', { method: 'POST', body: { lang, strings }, auth: false, idempotencyKey: false }),
};

export const pagesApi = {
  get: (slug: ContentPage['slug']) => api<ContentPage>(`/pages/${slug}`, { auth: false }),
};

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
  update: (body: Partial<{ name: string; about: string | null; language: string; avatarMediaId: string | null; homeLocationId: string | null }>) =>
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
