import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta, escapeRegex } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { Listing, LISTING_STATUSES } from '../listing.model.js';
import { Category } from '../../categories/category.model.js';
import { User } from '../../users/user.model.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { notify } from '../../notifications/notification.service.js';

const router = Router();
const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
const DAY_MS = 24 * 60 * 60 * 1000;

const row = (l, owner) => ({
  id: String(l._id),
  listingNo: l.listingNo,
  title: l.title,
  status: l.status,
  listingType: l.listingType,
  cover: l.media?.[0]?.url || null,
  price: { type: l.price.type, amountMinor: l.price.amountMinor ?? null, currency: l.price.currency },
  place: l.location?.label,
  owner: owner ? { id: String(owner._id), name: owner.name || null, phone: owner.phone?.e164 } : null,
  createdAt: l.createdAt,
  publishedAt: l.publishedAt || null,
  expiresAt: l.expiresAt || null,
  views: l.stats?.views || 0,
});

router.get(
  '/',
  requirePermission('listings.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = {};
    if (req.query.status && LISTING_STATUSES.includes(req.query.status)) f.status = req.query.status;
    if (req.query.categoryId && /^[a-f0-9]{24}$/.test(req.query.categoryId)) f.categoryPath = req.query.categoryId;
    if (req.query.q) {
      const re = new RegExp(escapeRegex(req.query.q), 'i');
      f.$or = [{ title: re }, { listingNo: re }];
    }
    // oldest first for the review queue, newest first otherwise
    const sort = f.status === 'pending_review' ? { createdAt: 1 } : { createdAt: -1 };
    const [docs, total, pending] = await Promise.all([
      Listing.find(f).sort(sort).skip(paging.skip).limit(paging.limit).lean(),
      Listing.countDocuments(f),
      Listing.countDocuments({ status: 'pending_review' }),
    ]);
    const owners = new Map((await User.find({ _id: { $in: docs.map((d) => d.ownerId) } }).select('name phone.e164').lean()).map((u) => [String(u._id), u]));
    ok(res, docs.map((d) => row(d, owners.get(String(d.ownerId)))), { ...pageMeta(paging, total), pending });
  })
);

router.get(
  '/:id',
  requirePermission('listings.view'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const l = await Listing.findById(req.params.id).lean();
    if (!l) throw ApiError.notFound('LISTING_NOT_FOUND');
    const [owner, category] = await Promise.all([User.findById(l.ownerId).select('name phone.e164 publicId status').lean(), Category.findById(l.categoryId).select('name attributes').lean()]);
    const defs = new Map((category?.attributes || []).map((a) => [a.key, a]));
    ok(res, {
      ...row(l, owner),
      description: l.description,
      condition: l.condition || null,
      media: (l.media || []).map((m) => m.url),
      category: category?.name,
      attributes: Object.entries(l.attributes || {}).map(([key, value]) => ({ key, label: defs.get(key)?.label || key, value })),
      location: { label: l.location?.label, address: l.location?.address, lat: l.location?.geo?.coordinates?.[1], lng: l.location?.geo?.coordinates?.[0] },
      moderation: l.moderation || null,
      ownerStatus: owner?.status,
    });
  })
);

/** approve | reject (reason required) | remove (reason required) */
router.post(
  '/:id/decision',
  requirePermission('listings.moderate'),
  validate({
    params: idParam,
    body: z
      .object({ action: z.enum(['approve', 'reject', 'remove']), reason: z.string().trim().max(500).optional() })
      .refine((b) => b.action === 'approve' || (b.reason && b.reason.length >= 3), { message: 'A reason is required', path: ['reason'] }),
  }),
  asyncHandler(async (req, res) => {
    const l = await Listing.findById(req.params.id);
    if (!l || l.status === 'deleted') throw ApiError.notFound('LISTING_NOT_FOUND');
    const before = { status: l.status };
    const { action, reason } = req.body;

    if (action === 'approve') {
      if (!['pending_review', 'rejected'].includes(l.status)) throw ApiError.badRequest('INVALID_STATE', 'Only a pending ad can be approved');
      const category = await Category.findById(l.categoryId).select('rules').lean();
      const now = new Date();
      l.status = 'published';
      l.publishedAt = now;
      l.expiresAt = new Date(now.getTime() + (category?.rules?.validityDays ?? 30) * DAY_MS);
    } else if (action === 'reject') {
      if (l.status !== 'pending_review') throw ApiError.badRequest('INVALID_STATE', 'Only a pending ad can be rejected');
      l.status = 'rejected';
    } else {
      if (['removed', 'sold'].includes(l.status)) throw ApiError.badRequest('INVALID_STATE', `This ad is already ${l.status}`);
      l.status = 'removed';
    }
    l.moderation = { reviewedBy: req.admin.id, reviewedAt: new Date(), reason };
    await l.save();
    await auditAdmin(req, { action: `listing.${action}`, entityType: 'Listing', entityId: l._id, before, after: { status: l.status }, reason });
    const event = { approve: 'listing.approved', reject: 'listing.rejected', remove: 'listing.removed' }[action];
    await notify(l.ownerId, event, { title: l.title, reason }, { route: `/listing/${l._id}` });
    ok(res, { id: String(l._id), status: l.status });
  })
);

export default router;
