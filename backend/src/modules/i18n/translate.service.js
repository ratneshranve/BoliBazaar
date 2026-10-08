import crypto from 'node:crypto';
import { env, integrations } from '../../core/config/env.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { getSettingValue } from '../settings/settings.service.js';
import { TranslationCache } from './translation.model.js';

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const MAX_ITEMS_PER_CALL = 100;
const MAX_CHARS_PER_CALL = 25_000;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

export const translationConfigured = () => integrations.translate.configured;

/* Protect {{placeholders}} and HTML-escape so the API only changes human text. */
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const protect = (s) => escapeHtml(s).replace(/\{\{[^}]+\}\}/g, (m) => `<span translate="no">${m}</span>`);
const restore = (s) =>
  s
    .replace(/<span translate="no">(\{\{[^}]+\}\})<\/span>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const callGoogle = async (texts, target) => {
  const res = await fetch(`${ENDPOINT}?key=${env.GOOGLE_TRANSLATE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts.map(protect), source: 'en', target, format: 'html' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Translate ${res.status}: ${json?.error?.message || 'request failed'}`);
  return json.data.translations.map((t) => restore(t.translatedText));
};

/** Languages the admin has enabled (besides English). */
export const enabledLanguageCodes = async () => (await getSettingValue('languages')).enabled;

export const assertLanguageEnabled = async (lang) => {
  const enabled = await enabledLanguageCodes();
  if (!enabled.includes(lang)) throw ApiError.badRequest('LANGUAGE_NOT_ENABLED', 'This language is not enabled');
};

/**
 * Translate English texts into `lang`. Returns an array aligned with `texts`.
 * Throws ApiError(TRANSLATION_NOT_CONFIGURED) when no translation key is set in backend .env.
 */
export const translateTexts = async (texts, lang) => {
  if (lang === 'en' || !lang) return texts;
  if (!translationConfigured()) throw ApiError.unavailable('TRANSLATION_NOT_CONFIGURED', 'Set GOOGLE_TRANSLATE_API_KEY in backend .env');

  const out = new Array(texts.length);
  const unique = [...new Set(texts.filter((t) => t && t.trim() !== ''))];
  const hashes = new Map(unique.map((t) => [t, sha1(t)]));

  const cached = await TranslationCache.find({ lang, hash: { $in: [...hashes.values()] } }).lean();
  const byHash = new Map(cached.map((c) => [c.hash, c.text]));

  const missing = unique.filter((t) => !byHash.has(hashes.get(t)));
  // chunk by item count and total characters
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const t of missing) {
    if (cur.length && (cur.length >= MAX_ITEMS_PER_CALL || chars + t.length > MAX_CHARS_PER_CALL)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) chunks.push(cur);

  for (const chunk of chunks) {
    const translated = await callGoogle(chunk, lang);
    const docs = chunk.map((source, i) => ({ lang, hash: hashes.get(source), source, text: translated[i] }));
    docs.forEach((d) => byHash.set(d.hash, d.text));
    await TranslationCache.insertMany(docs, { ordered: false }).catch((e) => {
      if (e?.code !== 11000 && !e?.writeErrors) logger.warn('Translation cache write failed', { err: e.message });
    });
  }

  texts.forEach((t, i) => {
    out[i] = !t || t.trim() === '' ? t : byHash.get(hashes.get(t)) ?? t;
  });
  return out;
};

/** Translate multi-line text line by line (keeps blank lines and paragraph structure). */
export const translateBlock = async (text, lang) => {
  const lines = text.split('\n');
  const idx = [];
  lines.forEach((l, i) => l.trim() !== '' && idx.push(i));
  const translated = await translateTexts(idx.map((i) => lines[i]), lang);
  idx.forEach((lineNo, k) => {
    lines[lineNo] = translated[k];
  });
  return lines.join('\n');
};
