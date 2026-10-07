import axios from 'axios';
import { env } from './env';

const TOKEN_KEY = 'admin_token';
const ADMIN_KEY = 'admin_user';

export const auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  admin: () => {
    try {
      return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null');
    } catch {
      return null;
    }
  },
  save: (token, admin) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (admin) localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  },
};

export const http = axios.create({ baseURL: `${env.apiBaseUrl}/admin`, timeout: 30000 });

http.interceptors.request.use((config) => {
  const token = auth.token();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && ['TOKEN_EXPIRED', 'TOKEN_INVALID', 'SESSION_REVOKED', 'ADMIN_DISABLED', 'AUTH_REQUIRED'].includes(code)) {
      auth.clear();
      window.dispatchEvent(new Event('admin:logout'));
    }
    return Promise.reject(error);
  }
);

/** Unwraps { success, data, meta } → { data, meta }. */
export const call = async (promise) => {
  const res = await promise;
  return { data: res.data.data, meta: res.data.meta };
};

/** Human message from any API error (shows field errors when present). */
export const errorMessage = (error) => {
  const e = error?.response?.data?.error;
  if (e?.details?.fields) {
    return Object.entries(e.details.fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  }
  return e?.message || error?.message || 'Something went wrong';
};

/** Upload an image through the admin upload endpoint; returns { id, url }. */
export const uploadImage = async (file, purpose) => {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', file);
  const { data } = await call(http.post('/uploads/image', form));
  return data;
};
