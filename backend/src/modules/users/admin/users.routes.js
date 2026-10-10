import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta, escapeRegex } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { User } from '../user.model.js';
import { Session } from '../../auth/auth.models.js';
import { revokeSession } from '../../auth/auth.service.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { emitToUser, disconnectSession } from '../../../realtime/index.js';
import { Listing } from '../../listings/listing.model.js';
import { Auction } from '../../auctions/auction.model.js';
import { controlAuction } from '../../auctions/auction.service.js';

/** A ban takes the user's ads down (reversibly) and cancels their open auctions (bidders are told). */
const applyBan = async (userId, reason) => {
  const now = new Date();
  const hidden = await Listing.updateMany(
    { ownerId: userId, listingType: { $ne: 'auction' }, status: { $in: ['published', 'paused', 'pending_review', 'payment_pending'] } },
    { $set: { status: 'removed', hiddenByBan: true, moderation: { reviewedAt: now, reason: 'Account banned' } } }
  );
  const open = await Auction.find({ sellerId: userId, status: { $in: ['pending_review', 'scheduled', 'live', 'suspended'] } }).select('_id').lean();
  for (const a of open) await controlAuction(a._id, { action: 'cancel', reason: reason || 'Seller account closed' });
  return { hiddenAds: hidden.modifiedCount, cancelledAuctions: open.length };
};

/** Lifting a ban puts back the ads it took down (those whose time has not run out). */
const liftBan = async (userId) => {
  const now = new Date();
  const back = await Listing.updateMany({ ownerId: userId, hiddenByBan: true, expiresAt: { $gt: now } }, { $set: { status: 'published' }, $unset: { hiddenByBan: 1, moderation: 1 } });
  await Listing.updateMany({ ownerId: userId, hiddenByBan: true }, { $set: { status: 'expired' }, $unset: { hiddenByBan: 1 } });
  return { restoredAds: back.modifiedCount };
};

const router = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/);

const maskPhone = (e164) => (e164 ? `${e164.slice(0, -6)}****${e164.slice(-2)}` : null);

const rowDto = (u, sensitive) => ({
  id: String(u._id),
  publicId: u.publicId,
  name: u.name || null,
  avatar: u.avatar?.url || null,
  phone: sensitive ? u.phone?.e164 : maskPhone(u.phone?.e164),
  phoneVerified: Boolean(u.phone?.verifiedAt),
  email: u.email?.address ? (sensitive ? u.email.address : u.email.address.replace(/^(.).+(@.+)$/, '$1***$2')) : null,
  countryCode: u.countryCode,
  sellerType: u.seller?.type,
  status: u.status,
  suspendedUntil: u.suspendedUntil,
  lastActiveAt: u.lastActiveAt,
  createdAt: u.createdAt,
});

router.get(
  '/',
  requirePermission('users.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = {};
    if (req.query.status) f.status = String(req.query.status);
    if (req.query.sellerType) f['seller.type'] = String(req.query.sellerType);
    if (req.query.q) {
      const re = new RegExp(escapeRegex(req.query.q), 'i');
      f.$or = [{ name: re }, { 'phone.e164': re }, { 'email.address': re }, { publicId: re }];
    }
    if (req.query.from || req.query.to) {
      f.createdAt = {};
      if (req.query.from) f.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) f.createdAt.$lte = new Date(req.query.to);
    }
    const sensitive = req.admin.isSuper || req.admin.permissions.has('users.view_sensitive');
    const [items, total] = await Promise.all([
      User.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
      User.countDocuments(f),
    ]);
    ok(res, items.map((u) => rowDto(u, sensitive)), pageMeta(paging, total));
  })
);

router.get(
  '/:id',
  requirePermission('users.view'),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.params.id).lean();
    if (!u) throw ApiError.notFound('USER_NOT_FOUND');
    const sensitive = req.admin.isSuper || req.admin.permissions.has('users.view_sensitive');
    const sessions = await Session.find({ userId: u._id, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('platform deviceName appVersion lastUsedAt createdAt')
      .lean();
    if (sensitive) await auditAdmin(req, { action: 'users.view_sensitive', entityType: 'User', entityId: u._id });
    ok(res, {
      ...rowDto(u, sensitive),
      about: u.about,
      language: u.language,
      timezone: u.timezone,
      homeLocation: u.homeLocation,
      privacy: u.privacy,
      statusReason: u.statusReason,
      consents: u.consents,
      profileCompletedAt: u.profileCompletedAt,
      sessions,
    });
  })
);

router.patch(
  '/:id/status',
  requirePermission('users.suspend'),
  validate({
    params: z.object({ id: objectId }),
    body: z
      .object({
        status: z.enum(['active', 'limited', 'suspended', 'banned']),
        reason: z.string().trim().min(3).max(500),
        suspendedUntil: z.string().datetime().optional(),
      })
      .refine((b) => b.status !== 'suspended' || b.suspendedUntil, { message: 'suspendedUntil required', path: ['suspendedUntil'] }),
  }),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.params.id);
    if (!u) throw ApiError.notFound('USER_NOT_FOUND');
    const before = { status: u.status, statusReason: u.statusReason, suspendedUntil: u.suspendedUntil };
    u.status = req.body.status;
    u.statusReason = req.body.status === 'active' ? undefined : req.body.reason;
    u.suspendedUntil = req.body.status === 'suspended' ? new Date(req.body.suspendedUntil) : undefined;
    await u.save();

    let effects = {};
    if (req.body.status === 'banned' && before.status !== 'banned') {
      const sessions = await Session.find({ userId: u._id, revokedAt: null });
      await Promise.all(sessions.map((s) => revokeSession(s, 'banned')));
      await Promise.all(sessions.map((s) => disconnectSession(String(s._id))));
      effects = await applyBan(u._id, req.body.reason);
    } else if (before.status === 'banned' && req.body.status !== 'banned') {
      effects = await liftBan(u._id);
    }
    emitToUser(String(u._id), 'account:status', { status: u.status });
    await auditAdmin(req, {
      action: 'users.status',
      entityType: 'User',
      entityId: u._id,
      before,
      after: { status: u.status, suspendedUntil: u.suspendedUntil, ...effects },
      reason: req.body.reason,
    });
    ok(res, { ...rowDto(u.toObject(), false), effects });
  })
);

router.post(
  '/:id/force-logout',
  requirePermission('users.suspend'),
  validate({ params: z.object({ id: objectId }), body: z.object({ reason: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    const sessions = await Session.find({ userId: req.params.id, revokedAt: null });
    await Promise.all(sessions.map((s) => revokeSession(s, 'admin_force_logout')));
    await auditAdmin(req, { action: 'users.force_logout', entityType: 'User', entityId: req.params.id, reason: req.body.reason });
    ok(res, { revoked: sessions.length });
  })
);

export default router;
