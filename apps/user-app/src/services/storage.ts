import { createMMKV } from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';

/** Non-sensitive local cache (preferences, bootstrap cache, drafts). */
export const kv = createMMKV({ id: 'bolibazaar' });

export const kvGetJSON = <T>(key: string): T | undefined => {
  const raw = kv.getString(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    kv.remove(key);
    return undefined;
  }
};
export const kvSetJSON = (key: string, value: unknown) => kv.set(key, JSON.stringify(value));

/** Tokens live in Keychain/Keystore only. */
const TOKEN_SERVICE = 'bolibazaar.session';

export type StoredTokens = { accessToken: string; refreshToken: string };

export const secureTokens = {
  async get(): Promise<StoredTokens | null> {
    const c = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
    if (!c) return null;
    try {
      return JSON.parse(c.password) as StoredTokens;
    } catch {
      return null;
    }
  },
  async set(tokens: StoredTokens) {
    await Keychain.setGenericPassword('session', JSON.stringify(tokens), {
      service: TOKEN_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
  },
};

export const KV = {
  language: 'pref.language',
  bootstrap: 'cache.bootstrap',
  fcmToken: 'push.fcmToken',
} as const;
