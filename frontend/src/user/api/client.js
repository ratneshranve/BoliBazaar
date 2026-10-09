import { env } from '../config/env';
import { secureTokens, kv, KV } from '../services/storage';
import { getDeviceId, deviceMeta, timezone } from '../services/device';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onSessionExpired = null;
let onMaintenance = null;
export const setClientHooks = (hooks) => {
  onSessionExpired = hooks.onSessionExpired;
  onMaintenance = hooks.onMaintenance;
};

let tokens = null;
export const loadTokens = async () => (tokens = await secureTokens.get());
export const saveTokens = async (t) => {
  tokens = t;
  await secureTokens.set(t);
};
export const clearTokens = async () => {
  tokens = null;
  await secureTokens.clear();
};
export const hasSession = () => Boolean(tokens?.refreshToken);
export const getAccessToken = () => tokens?.accessToken ?? null;

export const newIdempotencyKey = () => crypto.randomUUID();

const baseHeaders = async () => {
  const meta = deviceMeta();
  return {
    Accept: 'application/json',
    'Accept-Language': kv.getString(KV.language) ?? '',
    'X-Platform': meta.platform,
    'X-Device-Id': await getDeviceId(),
    'X-Timezone': timezone(),
  };
};

let refreshing = null;
export const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = (async () => {
      if (!tokens?.refreshToken) return false;
      try {
        const res = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { ...(await baseHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) return false;
        await saveTokens({ accessToken: json.data.accessToken, refreshToken: json.data.refreshToken });
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
};

const buildUrl = (path, query) => {
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${env.apiBaseUrl}${path}${q ? `?${q}` : ''}`;
};

/** Download a private file (needs the login token, so a plain link cannot be used). Returns a Blob. */
export async function apiBlob(path) {
  const get = async () => {
    const headers = await baseHeaders();
    if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
    return fetch(buildUrl(path), { headers });
  };
  let res;
  try {
    res = await get();
    if (res.status === 401 && (await refreshAccessToken())) res = await get();
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No internet connection');
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json?.error?.code ?? 'UNKNOWN_ERROR', json?.error?.message ?? 'Request failed');
  }
  return res.blob();
}

/** Same contract as the RN client: returns { data, meta }, throws ApiError. */
export async function api(path, opts = {}) {
  const method = opts.method ?? 'GET';
  const isMutation = method !== 'GET';
  const idemKey = isMutation && opts.idempotencyKey !== false ? opts.idempotencyKey || newIdempotencyKey() : undefined;

  const send = async () => {
    const headers = await baseHeaders();
    if (opts.auth !== false && tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
    if (idemKey) headers['Idempotency-Key'] = idemKey;
    let body;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return fetch(buildUrl(path, opts.query), { method, headers, body });
  };

  let res;
  try {
    res = await send();
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No internet connection');
  }
  let json = await res.json().catch(() => null);

  if (res.status === 401 && json?.error?.code === 'TOKEN_EXPIRED' && opts.auth !== false) {
    if (await refreshAccessToken()) {
      res = await send();
      json = await res.json().catch(() => null);
    } else {
      await clearTokens();
      onSessionExpired?.();
    }
  } else if (res.status === 401 && ['SESSION_REVOKED', 'TOKEN_INVALID', 'USER_NOT_FOUND'].includes(json?.error?.code ?? '')) {
    await clearTokens();
    onSessionExpired?.();
  }

  if (res.status === 503 && json?.error?.code === 'MAINTENANCE') onMaintenance?.(json.error.details);

  if (!res.ok || !json?.success) {
    throw new ApiError(res.status, json?.error?.code ?? 'UNKNOWN_ERROR', json?.error?.message ?? 'Request failed', json?.error?.details);
  }
  return { data: json.data, meta: json.meta };
}
