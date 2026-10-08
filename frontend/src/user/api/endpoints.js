import { api } from './client';

export const configApi = {
  bootstrap: () => api('/config/bootstrap', { auth: false }),
};

export const homeApi = { get: (params) => api('/home', { auth: false, query: params }) };

export const categoriesApi = {
  tree: () => api('/categories/tree', { auth: false }),
  detail: (id) => api(`/categories/${id}`, { auth: false }),
};

/** Ads: browse/search (public), detail, post/edit, my ads, favourites. */
export const listingsApi = {
  search: (params) => api('/listings', { query: params }),
  detail: (id, point) => api(`/listings/${id}`, { query: point }),
  forEdit: (id) => api(`/listings/${id}/edit`),
  create: (body) => api('/listings', { method: 'POST', body }),
  update: (id, body) => api(`/listings/${id}`, { method: 'PUT', body }),
  action: (id, name) => api(`/listings/${id}/${name}`, { method: 'POST' }), // pause | resume | sold | renew
  remove: (id) => api(`/listings/${id}`, { method: 'DELETE' }),
  mine: (params) => api('/listings/mine', { query: params }),
  favourites: (params) => api('/listings/favourites', { query: params }),
  favourite: (id, on) => api(`/listings/${id}/favourite`, { method: on ? 'POST' : 'DELETE' }),
  view: (id) => api(`/listings/${id}/view`, { method: 'POST', idempotencyKey: false }),
};

/** Photo upload (stored where the admin chose: Cloudinary or the server). */
export const uploadsApi = {
  image: (file, purpose = 'listing') => {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file);
    return api('/uploads/image', { method: 'POST', form, idempotencyKey: false });
  },
};

/** Places come from Google via our server: search a name/PIN, or turn a GPS point / map pin into an address. */
export const placesApi = {
  autocomplete: (q, sessionToken) => api('/places/autocomplete', { auth: false, query: { q, sessionToken } }),
  details: (placeId, sessionToken) => api(`/places/details/${encodeURIComponent(placeId)}`, { auth: false, query: { sessionToken } }),
  reverse: (lat, lng) => api('/places/reverse', { auth: false, query: { lat, lng } }),
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
