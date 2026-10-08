import { z } from 'zod';
import { Banner } from './banner.model.js';
import { Category } from '../categories/category.model.js';
import { Media } from '../uploads/media.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { translateForReader } from '../categories/category.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

export const bannerInput = z
  .object({
    title: z.string().trim().max(80).optional().default(''),
    subtitle: z.string().trim().max(160).optional().default(''),
    image: z.object({ url: z.string().url(), mediaId: objectId.optional() }),
    action: z.object({ type: z.enum(['none', 'category']), categoryId: objectId.nullable().optional() }).default({ type: 'none' }),
    order: z.number().int().min(0).max(100000).default(0),
    status: z.enum(['active', 'paused']).default('active'),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
  })
  .refine((b) => b.action.type !== 'category' || b.action.categoryId, { message: 'Choose a category', path: ['action', 'categoryId'] })
  .refine((b) => !b.startAt || !b.endAt || new Date(b.endAt) > new Date(b.startAt), { message: 'End must be after start', path: ['endAt'] });

const prepare = async (input) => {
  if (input.image.mediaId && !(await Media.exists({ _id: input.image.mediaId }))) throw ApiError.badRequest('MEDIA_INVALID', 'Uploaded image not found');
  if (input.action.type === 'category' && !(await Category.exists({ _id: input.action.categoryId }))) throw ApiError.badRequest('CATEGORY_NOT_FOUND', 'Category not found');
  return {
    title: input.title || undefined,
    subtitle: input.subtitle || undefined,
    image: input.image,
    action: input.action.type === 'category' ? { type: 'category', categoryId: input.action.categoryId } : { type: 'none' },
    order: input.order,
    status: input.status,
    startAt: input.startAt ? new Date(input.startAt) : undefined,
    endAt: input.endAt ? new Date(input.endAt) : undefined,
  };
};

export const createBanner = async (input) => Banner.create(await prepare(input));

export const updateBanner = async (id, input) => {
  const doc = await Banner.findById(id);
  if (!doc) throw ApiError.notFound('BANNER_NOT_FOUND');
  const before = doc.toObject();
  doc.set({ title: undefined, subtitle: undefined, startAt: undefined, endAt: undefined, 'action.categoryId': undefined });
  doc.set(await prepare(input));
  await doc.save();
  return { before, doc };
};

export const deleteBanner = async (id) => {
  const doc = await Banner.findByIdAndDelete(id);
  if (!doc) throw ApiError.notFound('BANNER_NOT_FOUND');
  return doc.toObject();
};

export const adminBannerDto = (b) => ({
  id: String(b._id),
  title: b.title || '',
  subtitle: b.subtitle || '',
  image: { url: b.image.url, mediaId: b.image.mediaId ? String(b.image.mediaId) : undefined },
  action: { type: b.action?.type || 'none', categoryId: b.action?.categoryId ? String(b.action.categoryId) : null },
  order: b.order,
  status: b.status,
  startAt: b.startAt || null,
  endAt: b.endAt || null,
});

/** Banners currently live (active + inside their schedule), translated for the reader. */
export const liveBanners = async (lang) => {
  const now = new Date();
  const docs = await Banner.find({
    status: 'active',
    $and: [{ $or: [{ startAt: null }, { startAt: { $exists: false } }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $exists: false } }, { endAt: { $gte: now } }] }],
  })
    .sort({ order: 1, createdAt: -1 })
    .lean();
  const texts = docs.flatMap((b) => [b.title || '', b.subtitle || '']);
  const tr = await translateForReader(texts, lang);
  return docs.map((b, i) => ({
    id: String(b._id),
    image: b.image.url,
    title: tr[i * 2] || null,
    subtitle: tr[i * 2 + 1] || null,
    action: b.action?.type === 'category' ? { type: 'category', categoryId: String(b.action.categoryId) } : { type: 'none' },
  }));
};
