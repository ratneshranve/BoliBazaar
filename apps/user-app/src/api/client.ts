import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { secureTokens, kv, KV, StoredTokens } from '../services/storage';
import { getDeviceId, deviceMeta, timezone } from '../services/device';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { success: boolean; data: T; meta?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } };

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  auth?: boolean; // attach access token (default true)
  idempotencyKey?: string | false; // auto for POST/PUT/PATCH unless false
  query?: Record<string, string | number | boolean | undefined>;
};

/* ───── session hooks (set by the store so the client stays framework-agnostic) ───── */
let onSessionExpired: (() => void) | null = null;
let onMaintenance: ((details?: Record<string, unknown>) => void) | null = null;
export const setClientHooks = (hooks: { onSessionExpired: () => void; onMaintenance: (d?: Record<string, unknown>) => void }) => {
  onSessionExpired = hooks.onSessionExpired;
  onMaintenance = hooks.onMaintenance;
};

let tokens: StoredTokens | null = null;
export const loadTokens = async () => {
  tokens = await secureTokens.get();
  return tokens;
};
export const saveTokens = async (t: StoredTokens) => {
  tokens = t;
  await secureTokens.set(t);
};
export const clearTokens = async () => {
  tokens = null;
  await secureTokens.clear();
};
export const hasSession = () => Boolean(tokens?.refreshToken);

export const newIdempotencyKey = () => uuidv4();

const baseHeaders = async (): Promise<Record<string, string>> => {
  const meta = deviceMeta();
  return {
    Accept: 'application/json',
    'Accept-Language': kv.getString(KV.language) ?? '',
    'X-Platform': meta.platform,
    'X-App-Version': meta.appVersion,
    'X-Device-Id': await getDeviceId(),
    'X-Device-Name': meta.deviceName,
    'X-Timezone': timezone(),
  };
};

/* Single-flight refresh: concurrent 401s wait for one refresh call. */
let refreshing: Promise<boolean> | null = null;
const refreshAccessToken = (): Promise<boolean> => {
  if (!refreshing) {
    refreshing = (async () => {
      if (!tokens?.refreshToken) return false;
      try {
        const res = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { ...(await baseHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        const json = (await res.json()) as Envelope<{ accessToken: string; refreshToken: string }>;
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

const buildUrl = (path: string, query?: RequestOptions['query']) => {
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${env.apiBaseUrl}${path}${q ? `?${q}` : ''}`;
};

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const method = opts.method ?? 'GET';
  const isMutation = method !== 'GET';
  const idemKey = isMutation && opts.idempotencyKey !== false ? opts.idempotencyKey || newIdempotencyKey() : undefined;

  const send = async () => {
    const headers: Record<string, string> = await baseHeaders();
    if (opts.auth !== false && tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
    if (idemKey) headers['Idempotency-Key'] = idemKey; // same key on retry → safe
    let body: string | FormData | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return fetch(buildUrl(path, opts.query), { method, headers, body });
  };

  let res: Response;
  try {
    res = await send();
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No internet connection');
  }

  let json = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (res.status === 401 && json?.error?.code === 'TOKEN_EXPIRED' && opts.auth !== false) {
    if (await refreshAccessToken()) {
      res = await send();
      json = (await res.json().catch(() => null)) as Envelope<T> | null;
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
