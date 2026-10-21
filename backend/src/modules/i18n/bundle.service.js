import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../core/config/env.js';
import { redis } from '../../core/db/redis.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { TranslationBundle, TranslationCache, TranslationOverride } from './translation.model.js';
import { translateTexts, translationConfigured } from './translate.service.js';

/**
 * The app's UI text in any language, as one ready-made JSON.
 *
 * English source: the app's own en.json (one file for the website and the phone app). Hand-written files
 * next to it (hi.json…) and admin corrections win; only strings that are new to a language go to Google,
 * and each one only once (TranslationCache). The finished bundle is kept in Redis and MongoDB, so after
 * the first user picks a language every later request costs nothing.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = env.I18N_LOCALES_DIR ? path.resolve(env.I18N_LOCALES_DIR) : path.resolve(here, '../../../../apps/user-app/src/i18n/locales');
const REDIS_TTL_SEC = 7 * 24 * 3600;
const redisKey = (lang) => `i18n:bundle:${lang}`;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
};

/* ───── source files (re-read only when they change on disk) ───── */

const files = new Map(); // file → { mtimeMs, flat, hash }

const readLocale = (code) => {
  const file = path.join(LOCALES_DIR, `${code}.json`);
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const known = files.get(file);
  if (known && known.mtimeMs === st.mtimeMs) return known;
  const flat = flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
  const entry = { mtimeMs: st.mtimeMs, flat, hash: sha1(JSON.stringify(flat)).slice(0, 12) };
  files.set(file, entry);
  return entry;
};

/** The English UI strings ({ "auth.title": "…" }). */
export const englishSource = () => {
  const en = readLocale('en');
  if (!en) throw ApiError.unavailable('I18N_SOURCE_MISSING', `en.json not found in ${LOCALES_DIR} (set I18N_LOCALES_DIR in backend .env)`);
  return en;
};

/** Hand-written strings shipped with the app for `lang` (e.g. hi.json); empty when there is none. */
const handWritten = (lang) => (lang === 'en' ? null : readLocale(lang));

const sourceVersionOf = (lang) => sha1(`${englishSource().hash}:${handWritten(lang)?.hash || '-'}`).slice(0, 12);

/* ───── plural forms ───── */

/**
 * en.json has only "_one" and "_other". Languages with more forms (Arabic: zero/two/few/many…) would show
 * English for those counts, so every form the language uses is filled from the translated "_other".
 */
const fillPlurals = (strings, lang) => {
  let cats;
  try {
    cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  } catch {
    return strings;
  }
  for (const k of Object.keys(strings)) {
    if (!k.endsWith('_other')) continue;
    const base = k.slice(0, -'_other'.length);
    for (const c of cats) {
      if (!(`${base}_${c}` in strings)) strings[`${base}_${c}`] = strings[k];
    }
  }
  return strings;
};

/* ───── build / read ───── */

const building = new Map(); // lang → Promise (one build per language at a time)

const build = async (lang) => {
  const { flat } = englishSource();
  const hand = handWritten(lang)?.flat || {};
  const overrides = new Map((await TranslationOverride.find({ lang }).lean()).map((o) => [o.key, o.text]));
  const keys = Object.keys(flat);
  const need = keys.filter((k) => !overrides.has(k) && !hand[k]);
  // no translation key in .env: hand-written + admin strings, English for the rest — served, never saved
  const partial = need.length > 0 && !translationConfigured();
  const machine = need.length && !partial ? await translateTexts(need.map((k) => flat[k]), lang) : [];
  const machineByKey = new Map(need.map((k, i) => [k, machine[i]]));

  const strings = {};
  for (const k of keys) strings[k] = overrides.get(k) ?? hand[k] ?? machineByKey.get(k) ?? flat[k];
  fillPlurals(strings, lang);

  const json = JSON.stringify(strings);
  const doc = { lang, sourceVersion: sourceVersionOf(lang), version: sha1(json).slice(0, 12), strings: json, count: keys.length };
  if (partial) return doc;
  await TranslationBundle.updateOne({ lang }, { $set: doc }, { upsert: true });
  await redis.set(redisKey(lang), JSON.stringify(doc), 'EX', REDIS_TTL_SEC).catch(() => {});
  logger.info('Translation bundle built', { lang, strings: keys.length, machine: need.length }); // machine = from cache or Google
  return doc;
};

const current = async (lang) => {
  const sourceVersion = sourceVersionOf(lang);
  const cached = await redis.get(redisKey(lang)).catch(() => null);
  if (cached) {
    const doc = JSON.parse(cached);
    if (doc.sourceVersion === sourceVersion) return doc;
  }
  const saved = await TranslationBundle.findOne({ lang }).lean();
  if (saved && saved.sourceVersion === sourceVersion) {
    await redis.set(redisKey(lang), JSON.stringify(saved), 'EX', REDIS_TTL_SEC).catch(() => {});
    return saved;
  }
  return null;
};

/**
 * The bundle for `lang`: { lang, version, strings (flat) }. Built on first request (only unseen strings
 * are sent to Google). The caller checks that the language is allowed.
 */
export const getBundle = async (lang) => {
  if (lang === 'en') {
    const { flat, hash } = englishSource();
    return { lang, version: hash, strings: flat };
  }
  let doc = await current(lang);
  if (!doc) {
    if (!building.has(lang)) building.set(lang, build(lang).finally(() => building.delete(lang)));
    doc = await building.get(lang);
  }
  return { lang, version: doc.version, strings: JSON.parse(doc.strings) };
};

/** Bundle status for the admin page (no Google calls). */
export const bundleStatus = async (langs) => {
  const sourceVersions = new Map(langs.map((l) => [l, sourceVersionOf(l)]));
  const [docs, overrides] = await Promise.all([
    TranslationBundle.find({ lang: { $in: langs } }).select('lang sourceVersion version count updatedAt').lean(),
    TranslationOverride.aggregate([{ $match: { lang: { $in: langs } } }, { $group: { _id: '$lang', n: { $sum: 1 } } }]),
  ]);
  const byLang = new Map(docs.map((d) => [d.lang, d]));
  const overrideCount = new Map(overrides.map((o) => [o._id, o.n]));
  return langs.map((lang) => {
    const d = byLang.get(lang);
    return {
      lang,
      prepared: Boolean(d && d.sourceVersion === sourceVersions.get(lang)),
      outdated: Boolean(d && d.sourceVersion !== sourceVersions.get(lang)),
      builtAt: d?.updatedAt || null,
      overrides: overrideCount.get(lang) || 0,
      handWritten: Object.keys(handWritten(lang)?.flat || {}).length,
    };
  });
};

/** Size of the English UI text, so the admin can see what a new language costs. */
export const sourceStats = () => {
  const { flat } = englishSource();
  const values = Object.values(flat);
  return { strings: values.length, characters: values.reduce((n, s) => n + s.length, 0) };
};

/** Every string of a language for the admin editor: [{ key, en, text, from: 'admin' | 'app' | 'machine' }]. */
export const bundleRows = async (lang) => {
  const { flat } = englishSource();
  const { strings } = await getBundle(lang);
  const hand = handWritten(lang)?.flat || {};
  const overrides = new Set((await TranslationOverride.find({ lang }).select('key').lean()).map((o) => o.key));
  return Object.keys(flat).map((key) => ({
    key,
    en: flat[key],
    text: strings[key] ?? flat[key],
    from: overrides.has(key) ? 'admin' : hand[key] ? 'app' : 'machine',
  }));
};

const forget = async (lang) => {
  await Promise.all([TranslationBundle.deleteOne({ lang }), redis.del(redisKey(lang)).catch(() => {})]);
};

/** Admin correction of one string (text null = go back to the automatic translation). */
export const setOverride = async (lang, key, text, adminId) => {
  if (!(key in englishSource().flat)) throw ApiError.notFound('STRING_NOT_FOUND', 'No such text in the app');
  const before = await TranslationOverride.findOne({ lang, key }).lean();
  if (text === null) await TranslationOverride.deleteOne({ lang, key });
  else await TranslationOverride.updateOne({ lang, key }, { $set: { text, updatedBy: adminId } }, { upsert: true });
  await forget(lang);
  return { before: before?.text ?? null, after: text };
};

/** Prepare a language now (so the first user doesn't wait). */
export const prepareBundle = async (lang) => {
  await forget(lang);
  return getBundle(lang);
};

/**
 * Translate the app's text for `lang` again from scratch (after Google improves, or a bad batch).
 * Only UI strings are forgotten — translated categories/pages stay cached. Admin corrections are kept.
 */
export const retranslateBundle = async (lang) => {
  const hashes = Object.values(englishSource().flat).map(sha1);
  await TranslationCache.deleteMany({ lang, hash: { $in: hashes } });
  return prepareBundle(lang);
};
