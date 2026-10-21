import { env, integrations } from '../../core/config/env.js';
import { redis } from '../../core/db/redis.js';
import { logger } from '../../core/utils/logger.js';
import { I18nMeta } from './translation.model.js';

/**
 * Languages the app can offer. The full list is every language Google Translate supports (fetched once,
 * then kept in memory → Redis → MongoDB and refreshed monthly). Which ones users may pick is set in
 * Admin › Languages: all of them, or only selected ones. The short list below is used when Google
 * can't be reached, and its native names win over generated ones.
 */
const BUILT_IN = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
];

/** "hi", "mni", "zh-CN", "mni-Mtei" — the code styles Google uses. */
export const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const RTL = new Set(['ar', 'ur', 'fa', 'he', 'iw', 'sd', 'ps', 'yi', 'ug', 'dv', 'ckb', 'prs', 'syr']);
const isRtl = (code) => RTL.has(code.split('-')[0]);

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2/languages';
const META_ID = 'google-languages';
const REDIS_KEY = 'i18n:languages';
const REDIS_TTL_SEC = 7 * 24 * 3600;
const REFRESH_MS = 30 * 24 * 3600 * 1000;
const MEMO_MS = 10 * 60 * 1000;

/** The language's own name for itself ("বাংলা"), from Node's ICU data; falls back to the English name. */
const nativeNameOf = (code, fallback) => {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (n && n.toLowerCase() !== code.toLowerCase()) return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  } catch {
    /* unknown to ICU */
  }
  return fallback;
};

const build = (googleList = []) => {
  const byCode = new Map(BUILT_IN.map((l) => [l.code, { ...l, rtl: isRtl(l.code) }]));
  for (const g of googleList) {
    if (!g?.language || !LANG_CODE.test(g.language) || byCode.has(g.language)) continue;
    const name = g.name || g.language;
    byCode.set(g.language, { code: g.language, name, nativeName: nativeNameOf(g.language, name), rtl: isRtl(g.language) });
  }
  const list = [...byCode.values()].sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.name.localeCompare(b.name)));
  return { list, byCode };
};

const fetchGoogle = async () => {
  const res = await fetch(`${ENDPOINT}?key=${env.GOOGLE_TRANSLATE_API_KEY}&target=en`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google languages ${res.status}: ${json?.error?.message || 'request failed'}`);
  return json.data.languages;
};

let memo = null; // { at, list, byCode }
let loading = null;

const load = async ({ force = false } = {}) => {
  if (!force) {
    const cached = await redis.get(REDIS_KEY).catch(() => null);
    if (cached) return build(JSON.parse(cached));
  }
  const doc = await I18nMeta.findById(META_ID).lean();
  const fresh = doc && Date.now() - new Date(doc.updatedAt).getTime() < REFRESH_MS;
  let google = doc?.value || [];
  if ((force || !fresh) && integrations.translate.configured) {
    try {
      google = await fetchGoogle(); // listing languages is free (not billed per character)
      await I18nMeta.updateOne({ _id: META_ID }, { $set: { value: google } }, { upsert: true });
    } catch (err) {
      logger.warn('Could not refresh the Google language list, using the saved one', { err: err.message });
    }
  }
  if (google.length) await redis.set(REDIS_KEY, JSON.stringify(google), 'EX', REDIS_TTL_SEC).catch(() => {});
  return build(google);
};

const catalogue = async () => {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo;
  if (!loading) {
    loading = load()
      .then((c) => (memo = { ...c, at: Date.now() }))
      .catch((err) => {
        logger.warn('Language list unavailable, using the built-in one', { err: err.message });
        return (memo = { ...build(), at: Date.now() });
      })
      .finally(() => (loading = null));
  }
  return loading;
};

/** Every language the app can be shown in: [{ code, name, nativeName, rtl }], English first. */
export const allLanguages = async () => (await catalogue()).list;

export const languageInfo = async (code) => (await catalogue()).byCode.get(code);

/** Fetch Google's list again now (Admin › Languages › Refresh). */
export const refreshLanguages = async () => {
  await redis.del(REDIS_KEY).catch(() => {});
  memo = { ...(await load({ force: true })), at: Date.now() };
  return memo.list;
};

/** The admin setting, with older saved values (no `mode` yet) read as "selected". */
export const normalizeLanguageSetting = (v) => ({ mode: v?.mode === 'all' ? 'all' : 'selected', default: v?.default || 'en', enabled: v?.enabled?.length ? v.enabled : ['en'] });

/** What the app shows in its language chooser. */
export const languagesForApp = async (settingValue) => {
  const s = normalizeLanguageSetting(settingValue);
  const items =
    s.mode === 'all'
      ? await allLanguages()
      : (await Promise.all(s.enabled.map((code) => languageInfo(code)))).filter(Boolean);
  return { mode: s.mode, default: s.default, items: items.map(({ code, name, nativeName, rtl }) => ({ code, name, nativeName, rtl: Boolean(rtl) })) };
};
