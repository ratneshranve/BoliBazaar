import { z } from 'zod';
import { ContentPage, PAGE_SLUGS, CONSENT_SLUGS } from './page.model.js';
import { ApiError } from '../../core/utils/ApiError.js';

const langKey = z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, 'Invalid language code');

export const pageInput = z.object({
  title: z.record(langKey, z.string().trim().max(120)),
  body: z.record(langKey, z.string().max(100_000)),
});

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v.trim() !== ''));

export const getPageDoc = (slug) => ContentPage.findOne({ slug }).lean();

/** Admin save. Bumps `version` when the body text changed (or on first publish). */
export const savePage = async (slug, input, adminId) => {
  if (!PAGE_SLUGS.includes(slug)) throw ApiError.notFound('PAGE_NOT_FOUND');
  const title = clean(input.title);
  const body = clean(input.body);
  if (!body.en) throw ApiError.badRequest('VALIDATION_FAILED', 'English text is required', { fields: { 'body.en': 'Required' } });
  if (!title.en) throw ApiError.badRequest('VALIDATION_FAILED', 'English title is required', { fields: { 'title.en': 'Required' } });

  const existing = await ContentPage.findOne({ slug });
  const before = existing ? { title: existing.title, body: existing.body, version: existing.version } : null;
  const bodyChanged = !existing || JSON.stringify(existing.body) !== JSON.stringify(body);

  const doc = existing || new ContentPage({ slug });
  doc.title = title;
  doc.body = body;
  doc.updatedBy = adminId;
  if (bodyChanged) {
    doc.version = (doc.version || 0) + 1;
    doc.publishedAt = new Date();
  }
  doc.markModified('title');
  doc.markModified('body');
  await doc.save();
  return { before, after: { title: doc.title, body: doc.body, version: doc.version }, doc };
};

/** Pick the user's language, falling back to English. */
const pick = (map, lang) => (lang && map?.[lang]) || map?.en || null;

export const pageForUser = async (slug, lang) => {
  if (!PAGE_SLUGS.includes(slug)) throw ApiError.notFound('PAGE_NOT_FOUND');
  const doc = await getPageDoc(slug);
  if (!doc || !doc.body?.en) throw ApiError.notFound('PAGE_NOT_PUBLISHED', 'This page has not been published yet');
  const language = doc.body[lang] ? lang : 'en';
  return {
    slug,
    title: pick(doc.title, lang),
    body: pick(doc.body, lang),
    language,
    version: doc.version,
    updatedAt: doc.updatedAt,
  };
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
