import { z } from 'zod';
import { ContentPage, PAGE_SLUGS, CONSENT_SLUGS } from './page.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { enabledLanguageCodes, translateTexts, translateBlock } from '../i18n/translate.service.js';

/** Admin writes English only. Other languages are produced automatically for the reader. */
export const pageInput = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(100_000),
});

export const getPageDoc = (slug) => ContentPage.findOne({ slug }).lean();

/** Admin save. Bumps `version` when the text changed (or on first publish). */
export const savePage = async (slug, input, adminId) => {
  if (!PAGE_SLUGS.includes(slug)) throw ApiError.notFound('PAGE_NOT_FOUND');
  const existing = await ContentPage.findOne({ slug });
  const before = existing ? { title: existing.title, body: existing.body, version: existing.version } : null;
  const changed = !existing || existing.body?.en !== input.body;

  const doc = existing || new ContentPage({ slug });
  doc.title = { en: input.title };
  doc.body = { en: input.body };
  doc.updatedBy = adminId;
  if (changed) {
    doc.version = (doc.version || 0) + 1;
    doc.publishedAt = new Date();
  }
  doc.markModified('title');
  doc.markModified('body');
  await doc.save();
  return { before, after: { title: doc.title, body: doc.body, version: doc.version }, doc };
};

/** The page in the reader's language: translated automatically when it isn't English. */
export const pageForUser = async (slug, lang) => {
  if (!PAGE_SLUGS.includes(slug)) throw ApiError.notFound('PAGE_NOT_FOUND');
  const doc = await getPageDoc(slug);
  if (!doc || !doc.body?.en) throw ApiError.notFound('PAGE_NOT_PUBLISHED', 'This page has not been published yet');

  let title = doc.title.en;
  let body = doc.body.en;
  let language = 'en';

  if (lang && lang !== 'en' && (await enabledLanguageCodes()).includes(lang)) {
    try {
      [title] = await translateTexts([doc.title.en], lang);
      body = await translateBlock(doc.body.en, lang);
      language = lang;
    } catch (err) {
      // Translation is best-effort: the reader still gets the English original.
      logger.warn('Page translation failed, serving English', { slug, lang, err: err.message });
      title = doc.title.en;
      body = doc.body.en;
    }
  }
  return { slug, title, body, language, version: doc.version, updatedAt: doc.updatedAt };
};

/** Current versions of the documents users must accept. null = not published yet. */
export const legalVersions = async () => {
  const docs = await ContentPage.find({ slug: { $in: CONSENT_SLUGS } }).lean();
  const v = (slug) => {
    const d = docs.find((x) => x.slug === slug);
    return d?.body?.en ? d.version : null;
  };
  return { terms: { version: v('terms') }, privacy: { version: v('privacy') } };
};
