import { getSettingValue } from '../settings/settings.service.js';
import { ApiError } from '../../core/utils/ApiError.js';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHONE = /(?:\+?\d[\s-]?){10,13}/; // 10+ digits, spaces or dashes allowed
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|net|org|co|io|me|xyz|info|link|ly)\b/i;

/** Whole-word, case-insensitive match against a list of words or phrases. */
const findWord = (text, words) => words.find((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, 'iu').test(text));

/**
 * Check user text against the admin's moderation rules.
 * Throws CONTENT_BLOCKED for refused content; returns { needsReview } for words that need a human look.
 * `where` adds context to the message ("ad", "message").
 */
export const checkContent = async (texts, { where = 'text', allowContact = false } = {}) => {
  const m = await getSettingValue('moderation');
  const text = texts.filter(Boolean).join('\n');
  const blocked = findWord(text, m.blockedWords);
  if (blocked) throw ApiError.badRequest('CONTENT_BLOCKED', `Your ${where} contains a word that is not allowed: "${blocked}"`);
  if (!allowContact && m.blockPhonesInText && PHONE.test(text)) {
    throw ApiError.badRequest('CONTENT_BLOCKED', `Please remove the phone number from your ${where} — buyers contact you through the app`);
  }
  if (!allowContact && m.blockLinksInText && LINK.test(text)) throw ApiError.badRequest('CONTENT_BLOCKED', `Links are not allowed in your ${where}`);
  return { needsReview: Boolean(findWord(text, m.reviewWords)) };
};
