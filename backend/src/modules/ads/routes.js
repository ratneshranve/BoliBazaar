import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../core/middleware/common.js';
import { requirePermission } from '../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta } from '../../core/utils/http.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { Ad, AD_TYPES } from './ad.model.js';
import { recordClick } from './ad.service.js';
import { Listing } from '../listings/listing.model.js';
import { Category } from '../categories/category.model.js';
import { User } from '../users/user.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { factorOf } from '../payments/pricing.service.js';
import { auditAdmin } from '../audit/audit.service.js';

const id = z.string().regex(/^[a-f0-9]{24}$/);

/* ───── user API: count a tap on an ad ───── */
export const userAdRoutes = Router();
userAdRoutes.post('/ads/:id/click', validate({ params: z.object({ id }) }), asyncHandler(async (req, res) => {
  await recordClick(req.params.id);
  ok(res, { counted: true });
}));

/* ───── admin: Ads Manager (SOP 15.5) ───── */
export const adminAdRoutes = Router();

const adInput = z
  .object({
    type: z.enum(AD_TYPES),
    advertiser: z.object({ name: z.string().trim().min(2).max(120), contact: z.string().trim().max(160).optional() }),
    title: z.string().trim().max(80).optional(),
    subtitle: z.string().trim().max(160).optional(),
    image: z.object({ url: z.string().url(), mediaId: id.optional() }).nullable().optional(),
    route: z.string().trim().regex(/^\/[\w\-/?=&.]*$/, 'An app path such as /search?q=bike').max(200).optional(),
    listingNo: z.string().trim().max(20).optional(), // sponsored listing, by ad number
    categoryId: id.optional(),
    sellerPublicId: z.string().trim().max(40).optional(), // business promotion
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    status: z.enum(['active', 'paused']).default('active'),
    price: z.number().min(0).max(1e10),
    paid: z.boolean().default(false),
    paymentNote: z.string().trim().max(200).optional(),
  })
  .refine((a) => a.endAt > a.startAt, { message: 'End must be after start', path: ['endAt'] })
  .refine((a) => !['banner', 'category_sponsorship'].includes(a.type) || a.image?.url, { message: 'Upload the ad picture', path: ['image'] })
  .refine((a) => a.type !== 'sponsored_listing' || a.listingNo, { message: 'Enter the ad number to sponsor', path: ['listingNo'] })
  .refine((a) => a.type !== 'category_sponsorship' || a.categoryId, { message: 'Choose the category', path: ['categoryId'] })
  .refine((a) => a.type !== 'business_promotion' || a.sellerPublicId, { message: "Enter the business's profile id", path: ['sellerPublicId'] });

/** Turn the form into stored fields, checking the linked ad / category / business exist. */
const toDoc = async (input) => {
  const { currency } = await getSettingValue('marketplace');
  const doc = {
    type: input.type,
    advertiser: input.advertiser,
    title: input.title,
    subtitle: input.subtitle,
    image: input.image || undefined,
    route: input.route,
    startAt: input.startAt,
    endAt: input.endAt,
    status: input.status,
    priceMinor: Math.round(input.price * factorOf(currency)),
    currency,
    paid: input.paid,
    paymentNote: input.paymentNote,
    listingId: undefined,
    categoryId: undefined,
    sellerId: undefined,
  };
  if (input.type === 'sponsored_listing') {
    const l = await Listing.findOne({ listingNo: input.listingNo.toUpperCase() }).select('_id').lean();
    if (!l) throw ApiError.badRequest('VALIDATION_FAILED', 'No ad with that number', { fields: { listingNo: 'Not found' } });
    doc.listingId = l._id;
  }
  if (input.type === 'category_sponsorship') {
    if (!(await Category.exists({ _id: input.categoryId }))) throw ApiError.badRequest('VALIDATION_FAILED', 'Category not found', { fields: { categoryId: 'Not found' } });
    doc.categoryId = input.categoryId;
  }
  if (input.type === 'business_promotion') {
    const u = await User.findOne({ publicId: input.sellerPublicId }).select('_id').lean();
    if (!u) throw ApiError.badRequest('VALIDATION_FAILED', 'No profile with that id', { fields: { sellerPublicId: 'Not found' } });
    doc.sellerId = u._id;
  }
  return doc;
};

const adDto = async (a) => {
  const [listing, category, seller] = await Promise.all([
    a.listingId ? Listing.findById(a.listingId).select('listingNo title').lean() : null,
    a.categoryId ? Category.findById(a.categoryId).select('name').lean() : null,
    a.sellerId ? User.findById(a.sellerId).select('publicId name').lean() : null,
  ]);
  const now = new Date();
  return {
    id: String(a._id),
    type: a.type,
    advertiser: a.advertiser,
    title: a.title || null,
    subtitle: a.subtitle || null,
    image: a.image?.url ? a.image : null,
    route: a.route || null,
    listing: listing ? { id: String(listing._id), listingNo: listing.listingNo, title: listing.title } : null,
    category: category ? { id: String(category._id), name: category.name } : null,
    seller: seller ? { publicId: seller.publicId, name: seller.name } : null,
    startAt: a.startAt,
    endAt: a.endAt,
    status: a.status,
    running: a.status === 'active' && a.startAt <= now && a.endAt > now,
    priceMinor: a.priceMinor,
    currency: a.currency,
    factor: factorOf(a.currency || 'INR'),
    paid: a.paid,
    paidAt: a.paidAt || null,
    paymentNote: a.paymentNote || null,
    impressions: a.impressions,
    clicks: a.clicks,
  };
};

adminAdRoutes.get(
  '/ads',
  requirePermission('ads.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = AD_TYPES.includes(req.query.type) ? { type: req.query.type } : {};
    const [docs, total] = await Promise.all([Ad.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(), Ad.countDocuments(f)]);
    ok(res, await Promise.all(docs.map(adDto)), pageMeta(paging, total));
  })
);

adminAdRoutes.post(
  '/ads',
  requirePermission('ads.edit'),
  validate({ body: adInput }),
  asyncHandler(async (req, res) => {
    const doc = await toDoc(req.body);
    const a = await Ad.create({ ...doc, paidAt: doc.paid ? new Date() : undefined, createdBy: req.admin.id });
    await auditAdmin(req, { action: 'ads.create', entityType: 'Ad', entityId: a._id, after: { type: a.type, advertiser: a.advertiser.name, priceMinor: a.priceMinor } });
    ok(res, await adDto(a.toObject()), undefined, 201);
  })
);

adminAdRoutes.put(
  '/ads/:id',
  requirePermission('ads.edit'),
  validate({ params: z.object({ id }), body: adInput }),
  asyncHandler(async (req, res) => {
    const before = await Ad.findById(req.params.id).lean();
    if (!before) throw ApiError.notFound('AD_NOT_FOUND');
    const doc = await toDoc(req.body);
    const paidAt = doc.paid ? before.paidAt || new Date() : undefined;
    const a = await Ad.findByIdAndUpdate(req.params.id, { $set: { ...doc, paidAt } }, { new: true }).lean();
    await auditAdmin(req, { action: 'ads.update', entityType: 'Ad', entityId: a._id, before: { status: before.status, paid: before.paid, priceMinor: before.priceMinor }, after: { status: a.status, paid: a.paid, priceMinor: a.priceMinor } });
    ok(res, await adDto(a));
  })
);
