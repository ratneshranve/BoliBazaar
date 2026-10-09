import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta, escapeRegex } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { AUCTION_STATUSES, DEAL_STATUSES, Deal, Strike } from '../auction.model.js';
import { adminList, adminDetail, reviewAuction, controlAuction, createManagedAuction } from '../auction.service.js';
import { auctionInput } from '../auction.schema.js';
import { voidBid } from '../bidding.service.js';
import { addStrike } from '../deal.service.js';
import { raiseCommission } from '../../payments/payment.service.js';
import { Listing } from '../../listings/listing.model.js';
import { User } from '../../users/user.model.js';
import { notify } from '../../notifications/notification.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);
const idParam = z.object({ id });
const reason = z.string().trim().min(3).max(500);

const who = async (ids) =>
  new Map((await User.find({ _id: { $in: ids } }).select('name phone.e164').lean()).map((u) => [String(u._id), { id: String(u._id), name: u.name || null, phone: u.phone?.e164 || null }]));

/* ───── deals ───── */
router.get(
  '/deals',
  requirePermission('auctions.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = DEAL_STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
    const [docs, total] = await Promise.all([Deal.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(), Deal.countDocuments(f)]);
    const users = await who(docs.flatMap((d) => [d.buyerId, d.sellerId]));
    const titles = new Map((await Listing.find({ _id: { $in: docs.map((d) => d.listingId) } }).select('title').lean()).map((l) => [String(l._id), l.title]));
    ok(
      res,
      docs.map((d) => ({
        id: String(d._id),
        auctionId: String(d.auctionId),
        title: titles.get(String(d.listingId)) || null,
        buyer: users.get(String(d.buyerId)),
        seller: users.get(String(d.sellerId)),
        amountMinor: d.amountMinor,
        currency: d.currency,
        source: d.source,
        status: d.status,
        confirmBy: d.confirmBy,
        disputeReason: d.disputeReason || null,
        resolution: d.resolution || null,
        timeline: d.timeline,
        createdAt: d.createdAt,
      })),
      pageMeta(paging, total)
    );
  })
);

/** Settle a deal: completed or cancelled, optionally giving one side a strike. */
router.post(
  '/deals/:id/resolve',
  requirePermission('auctions.decide'),
  validate({ params: idParam, body: z.object({ outcome: z.enum(['completed', 'cancelled']), note: reason, strike: z.enum(['buyer', 'seller']).nullable().optional() }) }),
  asyncHandler(async (req, res) => {
    const deal = await Deal.findById(req.params.id);
    if (!deal) throw ApiError.notFound('DEAL_NOT_FOUND');
    if (!['disputed', 'in_progress', 'awaiting_confirmation'].includes(deal.status)) throw ApiError.badRequest('INVALID_STATE', 'This deal is already closed');
    const before = { status: deal.status };
    deal.status = req.body.outcome;
    deal.resolution = { by: req.admin.id, note: req.body.note, at: new Date() };
    deal.timeline.push({ at: new Date(), event: `resolved_${req.body.outcome}`, by: 'admin' });
    await deal.save();
    if (deal.status === 'completed') await raiseCommission(deal);
    if (req.body.strike) await addStrike(req.body.strike === 'buyer' ? deal.buyerId : deal.sellerId, req.body.strike, deal._id, `Decided by our team: ${req.body.note}`);
    const title = (await Listing.findById(deal.listingId).select('title').lean())?.title;
    for (const u of [deal.buyerId, deal.sellerId]) await notify(u, 'deal.update', { title, status: req.body.outcome }, { route: `/deals/${deal._id}` });
    await auditAdmin(req, { action: 'deal.resolve', entityType: 'Deal', entityId: deal._id, before, after: { status: deal.status, strike: req.body.strike || null }, reason: req.body.note });
    ok(res, { id: String(deal._id), status: deal.status });
  })
);

/* ───── strikes ───── */
router.get(
  '/strikes',
  requirePermission('auctions.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = req.query.active === 'false' ? {} : { removedAt: null, expiresAt: { $gt: new Date() } };
    const [docs, total] = await Promise.all([Strike.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(), Strike.countDocuments(f)]);
    const users = await who(docs.map((d) => d.userId));
    ok(
      res,
      docs.map((s) => ({ id: String(s._id), user: users.get(String(s.userId)), role: s.role, reason: s.reason, dealId: s.dealId ? String(s.dealId) : null, createdAt: s.createdAt, expiresAt: s.expiresAt, removedAt: s.removedAt || null })),
      pageMeta(paging, total)
    );
  })
);

router.delete(
  '/strikes/:id',
  requirePermission('auctions.decide'),
  validate({ params: idParam, body: z.object({ reason }) }),
  asyncHandler(async (req, res) => {
    const s = await Strike.findOneAndUpdate({ _id: req.params.id, removedAt: null }, { $set: { removedAt: new Date(), removedBy: req.admin.id } });
    if (!s) throw ApiError.notFound('STRIKE_NOT_FOUND');
    await auditAdmin(req, { action: 'strike.remove', entityType: 'Strike', entityId: s._id, before: { removedAt: null }, after: { removedAt: new Date() }, reason: req.body.reason });
    ok(res, { removed: true });
  })
);

/* ───── auctions ───── */

/** Find the seller account for an Admin-Managed auction by phone number or name. */
router.get(
  '/sellers',
  requirePermission('auctions.decide'),
  validate({ query: z.object({ q: z.string().trim().min(2).max(60) }) }),
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    const digits = q.replace(/\D/g, '');
    const or = [{ name: new RegExp(escapeRegex(q), 'i') }];
    if (digits.length >= 4) or.push({ 'phone.e164': new RegExp(digits) });
    const users = await User.find({ $or: or, status: { $in: ['active', 'limited'] } }).select('name phone.e164 publicId').limit(10).lean();
    ok(res, users.map((u) => ({ id: String(u._id), name: u.name || null, phone: u.phone?.e164 || null, publicId: u.publicId })));
  })
);

/** Admin-Managed auction (SOP §6.2): created by our team for a seller; opens without review. */
router.post(
  '/',
  requirePermission('auctions.decide'),
  validate({ body: auctionInput.extend({ sellerId: id, note: z.string().trim().max(500).optional() }) }),
  asyncHandler(async (req, res) => {
    const a = await createManagedAuction(req.admin.id, req.body);
    await auditAdmin(req, { action: 'auction.create_managed', entityType: 'Auction', entityId: a._id, before: null, after: { status: a.status, sellerId: req.body.sellerId, startAt: a.startAt, endAt: a.endAt } });
    ok(res, { id: String(a._id), status: a.status });
  })
);
router.get(
  '/',
  requirePermission('auctions.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const { rows, total, counts } = await adminList({ status: AUCTION_STATUSES.includes(req.query.status) ? req.query.status : undefined, q: req.query.q, page: paging.page, limit: paging.limit });
    ok(res, rows, { ...pageMeta(paging, total), ...counts });
  })
);

router.get('/:id', requirePermission('auctions.view'), validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await adminDetail(req.params.id))));

router.post(
  '/:id/decision',
  requirePermission('auctions.decide'),
  validate({
    params: idParam,
    body: z
      .object({ action: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() })
      .refine((b) => b.action === 'approve' || (b.reason && b.reason.length >= 3), { message: 'A reason is required', path: ['reason'] }),
  }),
  asyncHandler(async (req, res) => {
    const a = await reviewAuction(req.admin.id, req.params.id, req.body.action, req.body.reason);
    await auditAdmin(req, { action: `auction.${req.body.action}`, entityType: 'Auction', entityId: a._id, before: { status: 'pending_review' }, after: { status: a.status }, reason: req.body.reason });
    ok(res, { id: String(a._id), status: a.status });
  })
);

router.post(
  '/:id/control',
  requirePermission('auctions.control'),
  validate({
    params: idParam,
    body: z
      .object({ action: z.enum(['suspend', 'resume', 'extend', 'cancel']), minutes: z.number().int().min(1).max(10080).optional(), reason })
      .refine((b) => b.action !== 'extend' || b.minutes, { message: 'How many minutes?', path: ['minutes'] }),
  }),
  asyncHandler(async (req, res) => {
    const { before, after } = await controlAuction(req.params.id, req.body);
    await auditAdmin(req, { action: `auction.${req.body.action}`, entityType: 'Auction', entityId: req.params.id, before, after, reason: req.body.reason });
    ok(res, after);
  })
);

router.post(
  '/:id/bids/:bidId/void',
  requirePermission('auctions.void_bid'),
  validate({ params: z.object({ id, bidId: id }), body: z.object({ reason }) }),
  asyncHandler(async (req, res) => {
    const out = await voidBid(req.params.id, req.params.bidId, req.body.reason);
    await auditAdmin(req, { action: 'auction.void_bid', entityType: 'Bid', entityId: req.params.bidId, before: { status: 'valid' }, after: { status: 'voided' }, reason: req.body.reason });
    ok(res, out);
  })
);

export default router;
