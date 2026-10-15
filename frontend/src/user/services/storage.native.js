import { createMMKV } from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';

/** Phone storage: settings and caches in MMKV, login tokens in the Android Keystore (never in plain storage). */
const store = createMMKV({ id: 'bolibazaar' });

export const kv = {
  getString: (k) => store.getString(k),
  set: (k, v) => store.set(k, v),
  remove: (k) => store.remove(k),
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

const TOKEN_SERVICE = 'bolibazaar.session';
export const secureTokens = {
  async get() {
    const c = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
    if (!c) return null;
    try {
      return JSON.parse(c.password);
    } catch {
      return null;
    }
  },
  async set(tokens) {
    await Keychain.setGenericPassword('session', JSON.stringify(tokens), { service: TOKEN_SERVICE, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  },
  async clear() {
    await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
  },
};

export const KV = { language: 'pref.language', bootstrap: 'cache.bootstrap', fcmToken: 'push.fcmToken' };
