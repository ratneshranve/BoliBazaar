import { api } from './client';

export const configApi = {
  bootstrap: () => api('/config/bootstrap', { auth: false }),
};

/** Machine-translated UI strings for admin-enabled languages the app doesn't ship */
export const i18nApi = {
  bundle: (lang, strings) => api('/i18n/bundle', { method: 'POST', body: { lang, strings }, auth: false, idempotencyKey: false }),
};

/** Terms, Privacy and Support text, managed in Admin › Content Pages */
export const pagesApi = {
  get: (slug) => api(`/pages/${slug}`, { auth: false }),
};

export const authApi = {
  sendOtp: (phone, countryCode) => api('/auth/otp/send', { method: 'POST', body: { phone, countryCode }, auth: false }),
  verifyOtp: (phone, countryCode, code) => api('/auth/otp/verify', { method: 'POST', body: { phone, countryCode, code }, auth: false }),
  logout: () => api('/auth/logout', { method: 'POST' }),
};

export const meApi = {
  get: () => api('/me'),
  update: (body) => api('/me', { method: 'PATCH', body }),
  completeProfile: (body) => api('/me/complete-profile', { method: 'POST', body }),
  sessions: () => api('/me/sessions'),
  revokeSession: (id) => api(`/me/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => api('/me/sessions', { method: 'DELETE' }),
};
