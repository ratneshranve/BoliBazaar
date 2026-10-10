import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta, escapeRegex } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { redis } from '../../../core/db/redis.js';
import { Listing, LISTING_STATUSES } from '../listing.model.js';
import { Category } from '../../categories/category.model.js';
import { User } from '../../users/user.model.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { notify } from '../../notifications/notification.service.js';

const router = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const idParam = z.object({ id: objectId });
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_SEC = 120; // a moderator's hold on an ad they opened; refreshed while the review window stays open

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

/** Same filters for the table and the CSV export. */
const filterOf = (q) => {
  const f = {};
  if (q.status && LISTING_STATUSES.includes(q.status)) f.status = q.status;
  if (q.categoryId && /^[a-f0-9]{24}$/.test(q.categoryId)) f.categoryPath = q.categoryId;
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    f.$or = [{ title: re }, { listingNo: re }];
  }
  return f;
};

/* ───── review lock: two moderators never decide the same ad at once ───── */

const lockKey = (id) => `lock:listing-review:${id}`;
const readLock = async (id) => {
  const raw = await redis.get(lockKey(id));
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
/** Take the lock (or keep it); returns who holds it. */
const takeLock = async (id, admin) => {
  const mine = JSON.stringify({ id: admin.id, name: admin.name || 'Another admin' });
  if (await redis.set(lockKey(id), mine, 'EX', LOCK_SEC, 'NX')) return { mine: true, by: null };
  const holder = await readLock(id);
  if (holder?.id === admin.id) {
    await redis.set(lockKey(id), mine, 'EX', LOCK_SEC);
    return { mine: true, by: null };
  }
  return { mine: false, by: holder?.name || 'Another admin' };
};
const assertNotLockedByOther = async (id, admin) => {
  const holder = await readLock(id);
  if (holder && holder.id !== admin.id) throw ApiError.conflict('LISTING_LOCKED', `${holder.name} is reviewing this ad right now`, { by: holder.name });
};

/* ───── list / export / detail ───── */

router.get(
  '/',
  requirePermission('listings.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = filterOf(req.query);
    // oldest first for the review queue, newest first otherwise
    const sort = f.status === 'pending_review' ? { createdAt: 1 } : { createdAt: -1 };
    const [docs, total, pending] = await Promise.all([
      Listing.find(f).sort(sort).skip(paging.skip).limit(paging.limit).lean(),
      Listing.countDocuments(f),
      Listing.countDocuments({ status: 'pending_review' }),
    ]);
    const owners = new Map((await User.find({ _id: { $in: docs.map((d) => d.ownerId) } }).select('name phone.e164').lean()).map((u) => [String(u._id), u]));
    const locks = await Promise.all(docs.map((d) => readLock(String(d._id))));
    ok(
      res,
      docs.map((d, i) => ({ ...row(d, owners.get(String(d.ownerId))), lockedBy: locks[i] && locks[i].id !== req.admin.id ? locks[i].name : null })),
      { ...pageMeta(paging, total), pending }
    );
  })
);

/** CSV of the listings matching the current filters (max 20,000 rows). */
router.get(
  '/export.csv',
  requirePermission('listings.export'),
  asyncHandler(async (req, res) => {
    const docs = await Listing.find({ status: { $ne: 'deleted' }, ...filterOf(req.query) }).sort({ createdAt: -1 }).limit(20000).lean();
    const [owners, cats] = await Promise.all([
      User.find({ _id: { $in: [...new Set(docs.map((d) => String(d.ownerId)))] } }).select('name phone.e164').lean(),
      Category.find({ _id: { $in: [...new Set(docs.map((d) => String(d.categoryId)))] } }).select('name').lean(),
    ]);
    const ownerOf = new Map(owners.map((u) => [String(u._id), u]));
    const catOf = new Map(cats.map((c) => [String(c._id), c.name]));
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const amount = (p) => {
      if (p.amountMinor == null) return '';
      const digits = new Intl.NumberFormat('en', { style: 'currency', currency: p.currency }).resolvedOptions().maximumFractionDigits;
      return (p.amountMinor / 10 ** digits).toFixed(digits);
    };
    const lines = [['Ad no', 'Title', 'Type', 'Category', 'Status', 'Price type', 'Price', 'Currency', 'Seller', 'Seller phone', 'Place', 'State', 'Posted', 'Published', 'Expires', 'Views', 'Favourites'].join(',')];
    for (const l of docs) {
      const o = ownerOf.get(String(l.ownerId));
      lines.push(
        [l.listingNo, l.title, l.listingType, catOf.get(String(l.categoryId)), l.status, l.price.type, amount(l.price), l.price.currency, o?.name, o?.phone?.e164, l.location?.label, l.location?.address?.state, l.createdAt?.toISOString(), l.publishedAt?.toISOString(), l.expiresAt?.toISOString(), l.stats?.views || 0, l.stats?.favourites || 0]
          .map(cell)
          .join(',')
      );
    }
    await auditAdmin(req, { action: 'listings.export', entityType: 'Listing', entityId: 'csv', after: { rows: docs.length, filters: filterOf(req.query) } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="listings-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\n')); // BOM so Excel reads Hindi and ₹ correctly
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
    // opening a pending ad takes the review lock (moderators only)
    const moderator = req.admin.isSuper || req.admin.permissions?.has('listings.moderate');
    const lock = l.status === 'pending_review' && moderator ? await takeLock(req.params.id, req.admin) : { mine: true, by: null };
    ok(res, {
      ...row(l, owner),
      description: l.description,
      condition: l.condition || null,
      media: (l.media || []).map((m) => m.url),
      video: l.video?.url || null,
      category: category?.name,
      attributes: Object.entries(l.attributes || {}).map(([key, value]) => ({ key, label: defs.get(key)?.label || key, value })),
      location: { label: l.location?.label, address: l.location?.address, lat: l.location?.geo?.coordinates?.[1], lng: l.location?.geo?.coordinates?.[0] },
      moderation: l.moderation || null,
      ownerStatus: owner?.status,
      lock,
    });
  })
);

/** Keep holding the lock while the review window is open (called every minute), or let it go. */
router.post('/:id/lock', requirePermission('listings.moderate'), validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await takeLock(req.params.id, req.admin))));
router.delete(
  '/:id/lock',
  requirePermission('listings.moderate'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const holder = await readLock(req.params.id);
    if (holder?.id === req.admin.id) await redis.del(lockKey(req.params.id));
    ok(res, { released: true });
  })
);

/* ───── decisions ───── */

/** approve | reject | remove one ad; audited and the seller is told. */
const decide = async (req, id, action, reason) => {
  const l = await Listing.findById(id);
  if (!l || l.status === 'deleted') throw ApiError.notFound('LISTING_NOT_FOUND');
  if (l.listingType === 'auction') throw ApiError.badRequest('USE_AUCTION_FLOW', 'Auctions are reviewed under Auctions');
  await assertNotLockedByOther(id, req.admin);
  const before = { status: l.status };

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
  await redis.del(lockKey(id));
  await auditAdmin(req, { action: `listing.${action}`, entityType: 'Listing', entityId: l._id, before, after: { status: l.status }, reason });
  const event = { approve: 'listing.approved', reject: 'listing.rejected', remove: 'listing.removed' }[action];
  await notify(l.ownerId, event, { title: l.title, reason }, { route: `/listing/${l._id}` });
  return { id: String(l._id), status: l.status };
};

const decisionBody = z
  .object({ action: z.enum(['approve', 'reject', 'remove']), reason: z.string().trim().max(500).optional() })
  .refine((b) => b.action === 'approve' || (b.reason && b.reason.length >= 3), { message: 'A reason is required', path: ['reason'] });

router.post(
  '/:id/decision',
  requirePermission('listings.moderate'),
  validate({ params: idParam, body: decisionBody }),
  asyncHandler(async (req, res) => ok(res, await decide(req, req.params.id, req.body.action, req.body.reason)))
);

/** The same decision for many ads (max 100). Each ad is handled on its own; failures are reported, not fatal. */
router.post(
  '/bulk',
  requirePermission('listings.moderate'),
  validate({ body: decisionBody.and(z.object({ ids: z.array(objectId).min(1).max(100) })) }),
  asyncHandler(async (req, res) => {
    const results = [];
    for (const id of [...new Set(req.body.ids)]) {
      try {
        results.push({ id, ok: true, ...(await decide(req, id, req.body.action, req.body.reason)) });
      } catch (err) {
        results.push({ id, ok: false, code: err.code || 'ERROR', message: err.message });
      }
    }
    ok(res, { done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
  })
);

export default router;
