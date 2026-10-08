/**
 * Web stand-ins for the native storage used by the RN app (MMKV + Keychain).
 * NOTE: tokens are kept in localStorage here — for local testing only. The RN app uses Keychain/Keystore.
 */
export const kv = {
  getString: (k) => localStorage.getItem(k) ?? undefined,
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
};

export const kvGetJSON = (key) => {
  const raw = kv.getString(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    kv.remove(key);
    return undefined;
  }
};
export const kvSetJSON = (key, value) => kv.set(key, JSON.stringify(value));

const TOKEN_KEY = 'secure.tokens';
export const secureTokens = {
  async get() {
    return kvGetJSON(TOKEN_KEY) ?? null;
  },
  async set(tokens) {
    kvSetJSON(TOKEN_KEY, tokens);
  },
  async clear() {
    kv.remove(TOKEN_KEY);
  },
};

export const KV = { language: 'pref.language', bootstrap: 'cache.bootstrap', fcmToken: 'push.fcmToken' };
