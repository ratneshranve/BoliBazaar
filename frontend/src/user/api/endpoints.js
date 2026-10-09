import { api, apiBlob } from './client';

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
  phone: (id) => api(`/listings/${id}/phone`, { method: 'POST', idempotencyKey: false }),
};

/** Photo upload (stored where the admin chose: Cloudinary or the server). */
export const uploadsApi = {
  image: (file, purpose = 'listing') => {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file);
    return api('/uploads/image', { method: 'POST', form, idempotencyKey: false });
  },
  /** Private files (ID documents, evidence): only the owner and reviewing staff can open them. */
  document: (file, purpose = 'kyc') => {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file);
    return api('/uploads/document', { method: 'POST', form, idempotencyKey: false });
  },
};

/** SOP 15.5 ads: count taps (views are counted when served). */
export const adsApi = { click: (id) => api(`/ads/${id}/click`, { method: 'POST', auth: false, idempotencyKey: false }) };

/** Saved searches and public seller pages. */
export const growthApi = {
  searches: () => api('/saved-searches'),
  saveSearch: (body) => api('/saved-searches', { method: 'POST', body }),
  updateSearch: (id, body) => api(`/saved-searches/${id}`, { method: 'PATCH', body }),
  deleteSearch: (id) => api(`/saved-searches/${id}`, { method: 'DELETE' }),
  seller: (publicId, page = 1) => api(`/sellers/${publicId}`, { auth: false, query: { page } }),
};

/** Reports, help desk, verification badges, my data and account deletion. */
export const trustApi = {
  report: (body) => api('/reports', { method: 'POST', body }),
  myReports: () => api('/reports'),
  cases: () => api('/cases'),
  newCase: (body) => api('/cases', { method: 'POST', body }),
  getCase: (id) => api(`/cases/${id}`),
  replyCase: (id, text) => api(`/cases/${id}/reply`, { method: 'POST', body: { text } }),
  closeCase: (id) => api(`/cases/${id}/close`, { method: 'POST' }),
  verification: () => api('/verification'),
  submitVerification: (body) => api('/verification', { method: 'POST', body }),
  exportData: () => api('/account/export'),
  deletionInfo: () => api('/account/deletion'),
  requestDeletion: () => api('/account/deletion', { method: 'POST' }),
  cancelDeletion: () => api('/account/deletion', { method: 'DELETE' }),
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
  sendEmailCode: (email) => api('/me/email', { method: 'POST', body: { email }, idempotencyKey: false }),
  verifyEmail: (email, code) => api('/me/email/verify', { method: 'POST', body: { email, code }, idempotencyKey: false }),
  removeEmail: () => api('/me/email', { method: 'DELETE' }),
  setPrivacy: (body) => api('/me/privacy', { method: 'PATCH', body }),
};

/** In-app notifications + push preferences. */
export const notificationsApi = {
  list: (params) => api('/notifications', { query: params }),
  unread: () => api('/notifications/unread-count'),
  read: (ids) => api('/notifications/read', { method: 'POST', body: ids ? { ids } : {}, idempotencyKey: false }),
  prefs: () => api('/notifications/preferences'),
  setPrefs: (groups) => api('/notifications/preferences', { method: 'PATCH', body: { groups } }),
};

/** Paid extras: posting fees, promotions, plans, commission; checkout via Razorpay. */
export const paymentsApi = {
  catalog: () => api('/payments/catalog'),
  quota: (categoryId) => api('/payments/quota', { query: { categoryId } }),
  quote: (body) => api('/payments/quote', { method: 'POST', body, idempotencyKey: false }),
  order: (body) => api('/payments/orders', { method: 'POST', body }),
  verify: (body) => api('/payments/verify', { method: 'POST', body }),
  failed: (orderId, reason) => api('/payments/failed', { method: 'POST', body: { orderId, reason }, idempotencyKey: false }),
  history: (params) => api('/payments', { query: params }),
  commissions: () => api('/payments/commissions'),
};

/** Auctions: browse, bid, sell, and the deal after a win. */
export const auctionsApi = {
  browse: (params) => api('/auctions', { auth: false, query: params }),
  detail: (id) => api(`/auctions/${id}`),
  bids: (id) => api(`/auctions/${id}/bids`),
  forEdit: (id) => api(`/auctions/${id}/edit`),
  create: (body) => api('/auctions', { method: 'POST', body }),
  update: (id, body) => api(`/auctions/${id}`, { method: 'PUT', body }),
  cancel: (id) => api(`/auctions/${id}`, { method: 'DELETE' }),
  note: (id, text) => api(`/auctions/${id}/notes`, { method: 'POST', body: { text } }),
  offer: (id) => api(`/auctions/${id}/offer`, { method: 'POST' }),
  bid: (id, body) => api(`/auctions/${id}/bids`, { method: 'POST', body }),
  buyNow: (id) => api(`/auctions/${id}/buy-now`, { method: 'POST' }),
  mine: (role) => api('/auctions/mine', { query: { role } }),
  deals: (role) => api('/auctions/deals', { query: { role } }),
  deal: (id) => api(`/auctions/deals/${id}`),
  dealAction: (id, action, reason) => api(`/auctions/deals/${id}/${action}`, { method: 'POST', body: reason ? { reason } : {} }), // confirm | complete | cancel | dispute
};

/** Job applications and service enquiries. */
export const leadsApi = {
  send: (listingId, message) => api('/leads', { method: 'POST', body: { listingId, message } }),
  received: (params) => api('/leads/received', { query: params }),
  unseen: () => api('/leads/received/unseen-count'),
  sent: (params) => api('/leads/sent', { query: params }),
  setStatus: (id, status) => api(`/leads/${id}/status`, { method: 'PATCH', body: { status } }),
  withdraw: (id) => api(`/leads/${id}`, { method: 'DELETE' }),
};

/** Buyer ↔ seller chat, one conversation per ad. */
export const chatApi = {
  list: () => api('/chats'),
  unread: () => api('/chats/unread-count'),
  start: (listingId) => api('/chats/start', { method: 'POST', body: { listingId } }),
  detail: (id) => api(`/chats/${id}`),
  messages: (id, params) => api(`/chats/${id}/messages`, { query: params }),
  send: (id, text, mediaIds = []) => api(`/chats/${id}/messages`, { method: 'POST', body: { text, mediaIds } }),
  file: (id, mediaId) => apiBlob(`/chats/${id}/files/${mediaId}`),
  offer: (id, amount) => api(`/chats/${id}/offers`, { method: 'POST', body: { amount } }),
  answerOffer: (id, messageId, action, amount) => api(`/chats/${id}/offers/${messageId}`, { method: 'POST', body: { action, ...(amount ? { amount } : {}) } }),
  read: (id) => api(`/chats/${id}/read`, { method: 'POST', idempotencyKey: false }),
  block: (userId) => api(`/chats/blocked/${userId}`, { method: 'PUT' }),
  unblock: (userId) => api(`/chats/blocked/${userId}`, { method: 'DELETE' }),
};
