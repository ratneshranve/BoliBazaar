import { Auction, AuctionRegistration, AuctionWatch, Bid } from './auction.model.js';
import { restriction } from './deal.service.js';
import { oid, HOUR_MS } from './auction.util.js';
import { summaryOf } from './auction.summary.js';
import { Listing } from '../listings/listing.model.js';
import { cardDtos } from '../listings/listing.service.js';
import { User } from '../users/user.model.js';
import { ContentPage } from '../cms/page.model.js';
import { notify } from '../notifications/notification.service.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';

/**
 * Watching, bidder registration, inspection and reminders (docs/07 §10, §13).
 * Registration: register → accept the auction terms → pay the participation fee (if any) → approved automatically,
 * or by the seller / our team when the auction uses manual approval.
 */

const titleOf = async (listingId) => (await Listing.findById(listingId).select('title').lean())?.title || '';
const OPEN = ['scheduled', 'live'];

/* ───── watching ───── */

export const watch = async (userId, auctionId) => {
  const a = await Auction.findById(auctionId).select('status sellerId').lean();
  if (!a || !['scheduled', 'live', 'suspended'].includes(a.status)) throw ApiError.badRequest('AUCTION_NOT_OPEN', 'Only open auctions can be watched');
  await AuctionWatch.updateOne({ userId, auctionId }, { $setOnInsert: { userId, auctionId } }, { upsert: true });
  return { watching: true, watchers: await AuctionWatch.countDocuments({ auctionId }) };
};

export const unwatch = async (userId, auctionId) => {
  await AuctionWatch.deleteOne({ userId, auctionId });
  return { watching: false, watchers: await AuctionWatch.countDocuments({ auctionId }) };
};

/** My watchlist as cards (newest watched first). */
export const myWatchlist = async (userId, { lang }) => {
  const rows = await AuctionWatch.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  const auctions = await Auction.find({ _id: { $in: rows.map((r) => r.auctionId) } }).select('listingId').lean();
  const byAuction = new Map(auctions.map((a) => [oid(a._id), a.listingId]));
  const listings = new Map((await Listing.find({ _id: { $in: auctions.map((a) => a.listingId) } }).lean()).map((l) => [oid(l._id), l]));
  const ordered = rows.map((r) => listings.get(oid(byAuction.get(oid(r.auctionId))))).filter(Boolean);
  return cardDtos(ordered, { lang });
};

/* ───── registration ───── */

const regDto = (r) => (r ? { id: oid(r._id), status: r.status, feeMinor: r.feeMinor || 0, reason: r.status === 'rejected' ? r.decided?.reason || null : null, createdAt: r.createdAt } : null);

/** Approved when the auction approves automatically; otherwise it waits for the seller or our team. */
const settle = async (reg, auction) => {
  if (auction.registration?.approval === 'manual') {
    reg.status = 'pending';
    await reg.save();
    const who = await User.findById(reg.userId).select('name').lean();
    await notify(auction.sellerId, 'auction.registration_request', { title: await titleOf(auction.listingId), name: who?.name || 'A bidder' }, { route: `/auctions/${oid(auction._id)}` });
  } else {
    reg.status = 'approved';
    reg.decided = { by: 'auto', at: new Date() };
    await reg.save();
    await notify(reg.userId, 'auction.registration_approved', { title: await titleOf(auction.listingId) }, { route: `/auctions/${oid(auction._id)}` });
  }
  return reg;
};

export const register = async (userId, auctionId, { acceptTerms }) => {
  if (!acceptTerms) throw ApiError.badRequest('TERMS_REQUIRED', 'Accept the auction rules to register');
  const a = await Auction.findById(auctionId).lean();
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  if (!a.registration?.required) throw ApiError.badRequest('REGISTRATION_NOT_NEEDED', 'This auction does not need registration');
  if (!OPEN.includes(a.status) || new Date() >= a.endAt) throw ApiError.badRequest('REGISTRATION_CLOSED', 'Registration for this auction has closed');
  if (oid(a.sellerId) === oid(userId)) throw ApiError.forbidden('SELF_BID_NOT_ALLOWED', 'You cannot register for your own auction');
  if ((await restriction(userId, 'buyer')).restricted) throw ApiError.forbidden('ACCOUNT_RESTRICTED', 'You cannot bid right now');

  let reg = await AuctionRegistration.findOne({ auctionId, userId });
  if (reg?.status === 'rejected') throw ApiError.forbidden('REGISTRATION_REJECTED', 'Your registration for this auction was not approved');
  if (reg && ['approved', 'pending'].includes(reg.status)) return { registration: regDto(reg), payment: null };

  const guide = await ContentPage.findOne({ slug: 'auctions-guide' }).select('version').lean();
  const feeMinor = a.registration.feeMinor || 0;
  if (!reg) {
    try {
      reg = await AuctionRegistration.create({ auctionId, userId, status: 'awaiting_payment', termsVersion: guide?.version, feeMinor });
    } catch (err) {
      if (err.code !== 11000) throw err;
      reg = await AuctionRegistration.findOne({ auctionId, userId }); // two taps at once
    }
  } else {
    Object.assign(reg, { status: 'awaiting_payment', termsVersion: guide?.version, feeMinor });
    await reg.save();
  }
  if (feeMinor > 0) return { registration: regDto(reg), payment: { purpose: 'participation_fee', refId: oid(reg._id) } };
  return { registration: regDto(await settle(reg, a)), payment: null };
};

/** Payments call this once the participation fee is paid. */
export const participationPaid = async (payment) => {
  const reg = await AuctionRegistration.findOne({ _id: payment.refId, status: 'awaiting_payment' });
  if (!reg) return;
  reg.paymentId = payment._id;
  const a = await Auction.findById(reg.auctionId).lean();
  await settle(reg, a);
};

export const withdrawRegistration = async (userId, auctionId) => {
  const reg = await AuctionRegistration.findOne({ auctionId, userId });
  if (!reg || !['awaiting_payment', 'pending'].includes(reg.status)) throw ApiError.badRequest('INVALID_STATE', 'There is no open registration to withdraw');
  reg.status = 'withdrawn';
  await reg.save();
  return regDto(reg);
};

/** Seller (own auction) or our team approves / rejects a waiting registration. */
export const decideRegistration = async ({ by, sellerId, adminId }, regId, { action, reason }) => {
  const reg = await AuctionRegistration.findById(regId);
  if (!reg) throw ApiError.notFound('REGISTRATION_NOT_FOUND');
  const a = await Auction.findById(reg.auctionId).lean();
  if (by === 'seller' && oid(a?.sellerId) !== oid(sellerId)) throw ApiError.notFound('REGISTRATION_NOT_FOUND');
  if (reg.status !== 'pending' && !(by === 'admin' && reg.status === 'approved' && action === 'reject')) {
    throw ApiError.badRequest('NOT_PENDING', 'This registration was already decided');
  }
  if (action === 'reject' && !reason) throw ApiError.badRequest('REASON_REQUIRED', 'Give a reason');
  reg.status = action === 'approve' ? 'approved' : 'rejected';
  reg.decided = { by, adminId, at: new Date(), reason: action === 'reject' ? reason : undefined };
  await reg.save();
  const title = await titleOf(a.listingId);
  await notify(reg.userId, action === 'approve' ? 'auction.registration_approved' : 'auction.registration_rejected', { title, reason: reason || '' }, { route: `/auctions/${oid(a._id)}` });
  return regDto(reg);
};

/** Registrations of one auction with the bidder's trust signals (seller and admin views). */
export const registrationsOf = async (auctionId) => {
  const regs = await AuctionRegistration.find({ auctionId, status: { $ne: 'withdrawn' } }).sort({ createdAt: 1 }).lean();
  const users = new Map((await User.find({ _id: { $in: regs.map((r) => r.userId) } }).select('name createdAt phone.verifiedAt verification').lean()).map((u) => [oid(u._id), u]));
  return regs.map((r) => {
    const u = users.get(oid(r.userId));
    return {
      ...regDto(r),
      user: u ? { id: oid(u._id), name: u.name || null, memberSince: u.createdAt, phoneVerified: Boolean(u.phone?.verifiedAt), idVerified: Boolean(u.verification?.idVerifiedAt), businessVerified: Boolean(u.verification?.businessVerifiedAt) } : null,
      decidedBy: r.decided?.by || null,
    };
  });
};

export const sellerRegistrations = async (sellerId, auctionId) => {
  const a = await Auction.findOne({ _id: auctionId, sellerId }).select('_id').lean();
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  return registrationsOf(auctionId);
};

/** Bids and Buy now need an approved registration when the auction asks for one. */
export const assertMayBid = async (auction, userId) => {
  if (!auction.registration?.required) return;
  const reg = await AuctionRegistration.findOne({ auctionId: auction._id, userId }).select('status').lean();
  if (reg?.status !== 'approved') {
    throw ApiError.forbidden('REGISTRATION_REQUIRED', reg?.status === 'pending' ? 'Your registration is waiting for approval' : 'Register for this auction before bidding');
  }
};

/** What the viewer sees about registration, watching and inspection on the auction page. */
export const viewerExtras = async (a, viewerId, isSeller) => {
  const [watchers, watching, reg, waiting] = await Promise.all([
    AuctionWatch.countDocuments({ auctionId: a._id }),
    viewerId ? AuctionWatch.exists({ auctionId: a._id, userId: viewerId }) : null,
    viewerId && !isSeller && a.registration?.required ? AuctionRegistration.findOne({ auctionId: a._id, userId: viewerId }).lean() : null,
    isSeller && a.registration?.required ? AuctionRegistration.countDocuments({ auctionId: a._id, status: 'pending' }) : 0,
  ]);
  const insp = a.inspection;
  const hasInspection = Boolean(insp?.address || insp?.slots?.length);
  const mayInspect = isSeller || (viewerId && (!a.registration?.required || reg?.status === 'approved'));
  return {
    watchers,
    watching: Boolean(watching),
    registration: a.registration?.required
      ? { required: true, approval: a.registration.approval, feeMinor: a.registration.feeMinor || 0, mine: regDto(reg), waitingCount: isSeller ? waiting : undefined }
      : { required: false },
    inspection: hasInspection
      ? mayInspect
        ? { locked: false, address: insp.address || null, note: insp.note || null, slots: (insp.slots || []).map((s) => ({ from: s.from, to: s.to })) }
        : { locked: true, slotCount: insp.slots?.length || 0 }
      : null,
  };
};

export const updateInspection = async (sellerId, auctionId, input) => {
  const a = await Auction.findOne({ _id: auctionId, sellerId });
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  if (!['pending_review', 'rejected', 'scheduled', 'live', 'suspended'].includes(a.status)) throw ApiError.badRequest('INVALID_STATE', 'This auction is closed');
  a.inspection = cleanInspection(input, a.endAt);
  await a.save();
  return a.inspection;
};

/** Slots must end after they start; they are kept in time order. */
export const cleanInspection = (input, endAt) => {
  if (!input) return undefined;
  const slots = (input.slots || [])
    .filter((s) => s.from && s.to)
    .map((s) => ({ from: new Date(s.from), to: new Date(s.to) }))
    .sort((x, y) => x.from - y.from);
  slots.forEach((s) => {
    if (s.to <= s.from) throw ApiError.badRequest('VALIDATION_FAILED', 'Each viewing slot must end after it starts', { fields: { 'auction.inspection': 'Each viewing slot must end after it starts' } });
    if (endAt && s.from > endAt) throw ApiError.badRequest('VALIDATION_FAILED', 'Viewing slots must be before the auction ends', { fields: { 'auction.inspection': 'Viewing slots must be before the auction ends' } });
  });
  return { address: input.address || undefined, note: input.note || undefined, slots };
};

/** Auctions the user registered for, with how the registration stands. */
export const myRegistrations = async (userId, { lang }) => {
  const regs = await AuctionRegistration.find({ userId, status: { $ne: 'withdrawn' } }).sort({ createdAt: -1 }).limit(100).lean();
  const auctions = new Map((await Auction.find({ _id: { $in: regs.map((r) => r.auctionId) } }).lean()).map((a) => [oid(a._id), a]));
  const listings = new Map((await Listing.find({ _id: { $in: [...auctions.values()].map((a) => a.listingId) } }).select('title media').lean()).map((l) => [oid(l._id), l]));
  return regs
    .filter((r) => auctions.has(oid(r.auctionId)))
    .map((r) => {
      const a = auctions.get(oid(r.auctionId));
      const l = listings.get(oid(a.listingId));
      return { ...summaryOf(a), listingId: oid(a.listingId), title: l?.title, cover: l?.media?.[0]?.url || null, registration: regDto(r) };
    });
};

/* ───── reminders (called by the auction scheduler) ───── */

const audience = async (a, { bidders = false } = {}) => {
  const [w, r, b] = await Promise.all([
    AuctionWatch.distinct('userId', { auctionId: a._id }),
    AuctionRegistration.distinct('userId', { auctionId: a._id, status: { $in: ['approved', 'pending'] } }),
    bidders ? Bid.distinct('bidderId', { auctionId: a._id, status: 'valid' }) : [],
  ]);
  return [...new Set([...w, ...r, ...b].map(oid))].filter((u) => u !== oid(a.sellerId));
};

/** Claim one reminder for one auction (only one server sends it), then tell everyone interested. */
const remind = async (filter, key, event, opts) => {
  const due = await Auction.find({ ...filter, remindersSent: { $ne: key } }).select('_id listingId sellerId').limit(50).lean();
  for (const a of due) {
    const claimed = await Auction.updateOne({ _id: a._id, remindersSent: { $ne: key } }, { $push: { remindersSent: key } });
    if (!claimed.modifiedCount) continue;
    try {
      const people = await audience(a, opts);
      if (!people.length) continue;
      const title = await titleOf(a.listingId);
      for (const u of people) await notify(u, event, { title }, { route: `/auctions/${oid(a._id)}` });
    } catch (err) {
      logger.error('Auction reminder failed', { auctionId: oid(a._id), key, err: err.message });
    }
  }
};

export const sendReminders = async () => {
  const now = Date.now();
  await remind({ status: 'scheduled', startAt: { $lte: new Date(now + 10 * 60_000) } }, 'starting_soon', 'auction.starting_soon');
  await remind({ status: 'live' }, 'started', 'auction.started');
  await remind({ status: 'live', endAt: { $gt: new Date(now), $lte: new Date(now + HOUR_MS) } }, 'ending_soon', 'auction.ending_soon', { bidders: true });
};
