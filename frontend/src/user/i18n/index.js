import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@locales/en.json';
import hi from '@locales/hi.json';
import { kv, KV, kvGetJSON, kvSetJSON } from '../services/storage';
import { ApiError } from '../api/client';
import { i18nApi } from '../api/endpoints';

/**
 * UI strings shipped with the app (English is the source; hi.json is hand-written but may be incomplete).
 * Every other language — and the gaps in hi — comes from the server as one ready-made bundle, saved on
 * this device so it is downloaded once and then works offline.
 */
const BUNDLED = { en, hi };

export const savedLanguage = () => kv.getString(KV.language);

const cacheKey = (code) => `i18n.bundle.${code}`;

/* ───── nested JSON ⇄ the server's flat 'a.b.c' keys ───── */
const unflatten = (flat) => {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    path.split('.').reduce((o, key, i, arr) => (o[key] = i === arr.length - 1 ? value : o[key] || {}), out);
  }
  return out;
};

/** The language's strings saved on this device: { version, strings (flat) } — or null. */
const cachedBundle = (code) => {
  const c = kvGetJSON(cacheKey(code));
  return c?.version && c.strings ? c : null;
};

const resources = Object.fromEntries(Object.entries(BUNDLED).map(([code, strings]) => [code, { translation: strings }]));
const startLang = savedLanguage();
const startCache = startLang && startLang !== 'en' ? cachedBundle(startLang) : null;
if (startCache) resources[startLang] = { translation: unflatten(startCache.strings) };

i18n.use(initReactI18next).init({
  resources,
  // a language picked before opens straight away in it, from the strings saved on this device
  lng: startLang && resources[startLang] ? startLang : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { bindI18nStore: 'added' }, // screens redraw when newer strings arrive in the background
});

const checked = new Set(); // languages already checked with the server since the app started

/** Ask the server for `code`'s strings; only a version number comes back when ours are current. */
const download = async (code) => {
  const have = cachedBundle(code);
  const { data } = await i18nApi.bundle(code, have?.version);
  checked.add(code);
  if (data.unchanged) return;
  kvSetJSON(cacheKey(code), { version: data.version, strings: data.strings });
  i18n.addResourceBundle(code, 'translation', unflatten(data.strings), true, true);
};

/**
 * Make sure UI strings for `code` are loaded. With strings already on the device (shipped or saved) this
 * returns at once and checks for newer ones in the background; otherwise it waits for the download.
 * False when they could not be loaded (English stays).
 */
export const ensureLanguage = async (code) => {
  if (!code || code === 'en') return true;
  const cached = cachedBundle(code);
  if (cached && !i18n.hasResourceBundle(code, 'translation')) i18n.addResourceBundle(code, 'translation', unflatten(cached.strings), true, true);
  if (BUNDLED[code] || cached) {
    if (!checked.has(code)) download(code).catch(() => {});
    return true;
  }
  try {
    await download(code);
    return true;
  } catch {
    return false;
  }
};

/**
 * Switch the app to `code` and remember it on this device (sent as Accept-Language, so server content
 * follows). App.jsx also keeps it on the account, so notifications use it and another phone starts in it.
 */
export const setLanguage = async (code) => {
  kv.set(KV.language, code);
  if (typeof document !== 'undefined') document.documentElement.lang = code; // website only
  await ensureLanguage(code);
  await i18n.changeLanguage(code);
};

/** True for the errors our API client throws (also when instanceof is unreliable). */
const isApiError = (err) => err instanceof ApiError || err?.name === 'ApiError';

export const errorText = (err) => {
  const known = isApiError(err);
  const code = known ? err.code : 'UNKNOWN_ERROR';
  console.warn('[app error]', err?.name, code, err?.status, err?.message); // visible in the phone log while testing
  const key = `errors.${code}`;
  if (known && code === 'UNKNOWN_ERROR') return `${i18n.t('errors.UNKNOWN_ERROR')} (HTTP ${err.status})`; // the server's answer was not understood
  if (known && i18n.exists(key)) return i18n.t(key);
  if (known) return err.message;
  // not a server answer: something inside the app failed — show the reason so it can be fixed quickly
  const reason = err?.message ? ` (${String(err.message).slice(0, 80)})` : '';
  return `${i18n.t('errors.UNKNOWN_ERROR')}${reason}`;
};

export default i18n;
