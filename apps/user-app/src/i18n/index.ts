import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import { kv, KV, kvGetJSON, kvSetJSON } from '../services/storage';
import { ApiError } from '../api/client';
import { i18nApi } from '../api/endpoints';

/** UI strings shipped with the app. Any other language an admin enables is translated automatically. */
const BUNDLED: Record<string, object> = { en, hi };

export const savedLanguage = (): string | undefined => kv.getString(KV.language);

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: BUNDLED[savedLanguage() ?? ''] ? savedLanguage() : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/* ───── flatten / unflatten nested JSON ('a.b.c' keys) ───── */
const flatten = (obj: Record<string, any>, prefix = '', out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
};
const unflatten = (flat: Record<string, string>) => {
  const out: Record<string, any> = {};
  for (const [path, value] of Object.entries(flat)) {
    path.split('.').reduce((o, key, i, arr) => (o[key] = i === arr.length - 1 ? value : o[key] || {}), out);
  }
  return out;
};
const hashOf = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
};

const EN_FLAT = flatten(en);
const EN_HASH = hashOf(JSON.stringify(EN_FLAT));

/** Make sure UI strings for `code` are loaded (bundled → cached translation → fetch translation). */
export const ensureLanguage = async (code: string) => {
  if (i18n.hasResourceBundle(code, 'translation')) return true;
  const cacheKey = `i18n.bundle.${code}`;
  const cached = kvGetJSON<{ hash: string; strings: Record<string, any> }>(cacheKey);
  if (cached?.hash === EN_HASH) {
    i18n.addResourceBundle(code, 'translation', cached.strings, true, true);
    return true;
  }
  try {
    const { data } = await i18nApi.bundle(code, EN_FLAT);
    const strings = unflatten(data.strings);
    kvSetJSON(cacheKey, { hash: EN_HASH, strings });
    i18n.addResourceBundle(code, 'translation', strings, true, true);
    return true;
  } catch {
    return false; // English strings stay in place
  }
};

export const setLanguage = async (code: string) => {
  kv.set(KV.language, code); // also sent as Accept-Language so server content is translated
  await ensureLanguage(code);
  await i18n.changeLanguage(code);
};

/** Localised message for an API error code. */
export const errorText = (err: unknown) => {
  const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
  const key = `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : err instanceof ApiError ? err.message : i18n.t('errors.UNKNOWN_ERROR');
};

export default i18n;
