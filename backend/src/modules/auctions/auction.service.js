import mongoose from 'mongoose';
import { Auction, Bid, Deal } from './auction.model.js';
import { incrementFor, nextMinimum } from './auction.rules.js';
import { summaryOf, buyNowOpen } from './auction.summary.js';
import { restriction } from './deal.service.js';
import { publicState } from './bidding.service.js';
import { oid, snapshotRules, formatMoney, HOUR_MS } from './auction.util.js';
import { Listing } from '../listings/listing.model.js';
import { createAuctionItem, updateAuctionItem, cardDtos, minorFactor } from '../listings/listing.service.js';
import { User } from '../users/user.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { notify } from '../notifications/notification.service.js';
import { emitToRoom } from '../../realtime/index.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { escapeRegex } from '../../core/utils/http.js';

const { ObjectId } = mongoose.Types;
const EARTH_KM = 6378.137;

const bad = (field, message) => ApiError.badRequest('VALIDATION_FAILED', message, { fields: { [`auction.${field}`]: message } });

/** Check the seller's numbers against the admin rules and turn them into minor units. */
const auctionFields = async (s) => {
  const cfg = await getSettingValue('auctions');
  if (!cfg.enabled) throw ApiError.forbidden('AUCTIONS_DISABLED', 'Auctions are switched off right now');
  const { currency } = await getSettingValue('marketplace');
  const f = minorFactor(currency);
  const m = (n) => (n == null ? undefined : Math.round(n * f));

  if (s.reservePrice != null && s.reservePrice < s.startingBid) throw bad('reservePrice', 'Reserve price must be at least the starting bid');
  if (s.buyNowPrice != null) {
    const floor = Math.max(s.startingBid, s.reservePrice ?? 0) * (1 + cfg.buyNowMinAbovePercent / 100);
    if (s.buyNowPrice < floor) throw bad('buyNowPrice', `Buy-now price must be at least ${formatMoney(Math.ceil(floor) * f, currency)}`);
  }
  const rules = snapshotRules(cfg, currency);
  const platformStep = incrementFor(m(s.startingBid), rules.incrementTiers);
  if (s.increment != null && m(s.increment) < platformStep) throw bad('increment', `Bid step must be at least ${formatMoney(platformStep, currency)}`);
  if (s.durationHours < cfg.minDurationHours) throw bad('durationHours', `An auction must run for at least ${cfg.minDurationHours} hour(s)`);
  if (s.durationHours > cfg.maxDurationDays * 24) throw bad('durationHours', `An auction can run for at most ${cfg.maxDurationDays} days`);
  if (s.startAt && s.startAt.getTime() < Date.now() + cfg.startLeadMinutes * 60_000) throw bad('startAt', `Pick a start at least ${cfg.startLeadMinutes} minutes from now`);

  const durationMs = Math.round(s.durationHours * HOUR_MS);
  const startAt = s.startAt || new Date();
  return {
    currency,
    rules,
    fields: {
      currency,
      startingMinor: m(s.startingBid),
      reserveMinor: m(s.reservePrice ?? undefined) || undefined,
      buyNowMinor: m(s.buyNowPrice ?? undefined) || undefined,
      incrementMinor: m(s.increment ?? undefined) || undefined,
      durationMs,
      startAt,
      endAt: new Date(startAt.getTime() + durationMs),
    },
  };
};

const itemOf = (input) => ({ ...input, auction: undefined, price: { type: 'fixed', amount: input.auction.startingBid } });

/* ───── seller ───── */

export const createAuction = async (sellerId, input) => {
  if ((await restriction(sellerId, 'seller')).restricted) throw ApiError.forbidden('ACCOUNT_RESTRICTED', 'You cannot create auctions right now');
  const { rules, fields } = await auctionFields(input.auction);
  const listing = await createAuctionItem(sellerId, itemOf(input));
  try {
    const rest = fields;
    const a = await Auction.create({ listingId: listing._id, sellerId, status: 'pending_review', rules, ...rest });
    return sellerView(a, listing);
  } catch (err) {
    await Listing.deleteOne({ _id: listing._id });
    throw err;
  }
};

const mine = async (sellerId, id) => {
  const a = await Auction.findOne({ _id: id, sellerId });
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  return a;
};

/** Change an auction that has not been approved yet (it goes back for review). */
export const updateAuction = async (sellerId, id, input) => {
  const a = await mine(sellerId, id);
  if (!['pending_review', 'rejected'].includes(a.status)) throw ApiError.badRequest('AUCTION_LOCKED', 'An approved auction cannot be edited — add a note instead');
  const listing = await Listing.findById(a.listingId);
  if (String(listing.categoryId) !== input.categoryId) throw ApiError.badRequest('CATEGORY_LOCKED', 'Create a new auction to change the category');
  const { rules, fields } = await auctionFields(input.auction);
  await updateAuctionItem(listing, sellerId, itemOf(input));
  const rest = fields;
  Object.assign(a, rest, { rules, status: 'pending_review', moderation: undefined });
  await a.save();
  await Listing.updateOne({ _id: listing._id }, { $set: { status: 'pending_review' }, $unset: { moderation: 1 } });
  return sellerView(a, listing);
};

/** The seller may cancel until the first bid. After that only the admin can. */
export const cancelBySeller = async (sellerId, id) => {
  const a = await mine(sellerId, id);
  if (!['pending_review', 'rejected', 'scheduled', 'live'].includes(a.status)) throw ApiError.badRequest('INVALID_STATE', 'This auction can no longer be cancelled');
  if (a.state.bidCount > 0) throw ApiError.badRequest('HAS_BIDS', 'This auction already has bids — contact support to cancel it');
  const res = await Auction.updateOne({ _id: a._id, 'state.bidCount': 0, status: a.status }, { $set: { status: 'cancelled' }, $inc: { 'state.version': 1 } });
  if (!res.modifiedCount) throw ApiError.conflict('AUCTION_CHANGED', 'Someone just bid — please refresh');
  await Listing.updateOne({ _id: a.listingId }, { $set: { status: 'deleted' } });
  emitToRoom(`auction:${a._id}`, 'auction:ended', { auctionId: oid(a._id), outcome: null, cancelled: true });
};

/** Extra information added after bidding has started (the original details stay locked). */
export const addNote = async (sellerId, id, text) => {
  const a = await mine(sellerId, id);
  if (!['scheduled', 'live'].includes(a.status)) throw ApiError.badRequest('INVALID_STATE', 'Notes can be added while the auction is open');
  if (a.notes.length >= 10) throw ApiError.badRequest('TOO_MANY_NOTES', 'At most 10 notes');
  a.notes.push({ text, at: new Date() });
  await a.save();
};

/* ───── views ───── */

const sellerView = (a, listing) => ({
  ...summaryOf(a),
  listingId: oid(a.listingId),
  title: listing?.title,
  reserveMinor: a.reserveMinor ?? null,
  incrementMinor: a.incrementMinor ?? null,
  durationHours: a.durationMs / HOUR_MS,
  rejectReason: a.status === 'rejected' ? a.moderation?.reason || null : null,
});

/** The auction page: standing, rules, and the viewer's own position. */
export const auctionDetail = async (id, viewerId) => {
  const a = await Auction.findById(id).lean();
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  const isSeller = viewerId && oid(a.sellerId) === oid(viewerId);
  if (!isSeller && ['pending_review', 'rejected', 'cancelled'].includes(a.status)) throw ApiError.notFound('AUCTION_NOT_FOUND');

  const tiers = a.rules.incrementTiers;
  let me = null;
  if (viewerId && !isSeller) {
    const myBids = await Bid.find({ auctionId: a._id, bidderId: viewerId, status: 'valid' }).sort({ amountMinor: -1 }).lean();
    if (myBids.length) {
      const leading = oid(a.state.highestBidderId) === oid(viewerId);
      me = {
        alias: myBids[0].alias,
        highestMinor: myBids[0].amountMinor,
        isLeading: leading,
        maxMinor: leading && a.rules.proxyBidding ? a.state.leaderMaxMinor : null,
        won: a.status === 'ended' && oid(a.winnerId) === oid(viewerId),
      };
    }
  }
  const deal = viewerId
    ? await Deal.findOne({ auctionId: a._id, $or: [{ buyerId: viewerId }, { sellerId: viewerId }] }).sort({ createdAt: -1 }).select('_id status').lean()
    : null;
  const activeDeal = await Deal.exists({ auctionId: a._id, status: { $in: ['awaiting_confirmation', 'in_progress', 'completed', 'disputed'] } });

  return {
    ...summaryOf(a),
    ...publicState(a),
    listingId: oid(a.listingId),
    serverTime: new Date(),
    currency: a.currency,
    factor: minorFactor(a.currency),
    stepMinor: incrementFor(a.state.bidCount ? a.state.currentMinor : a.startingMinor, tiers, a.incrementMinor),
    rules: { proxyBidding: Boolean(a.rules.proxyBidding), antiSniping: a.rules.antiSniping, paymentWindowHours: a.rules.paymentWindowHours },
    notes: a.notes,
    finalMinor: a.finalMinor ?? null,
    isSeller: Boolean(isSeller),
    ...(isSeller ? { reserveMinor: a.reserveMinor ?? null, rejectReason: a.status === 'rejected' ? a.moderation?.reason || null : null } : {}),
    canOffer: Boolean(isSeller && a.status === 'ended' && !activeDeal && a.outcome !== 'no_bids'),
    me,
    deal: deal ? { id: oid(deal._id), status: deal.status } : null,
  };
};

/** Bid history with aliases only ("Bidder 2"), newest first. */
export const bidHistory = async (id, viewerId, { limit = 50 } = {}) => {
  const a = await Auction.findById(id).select('status sellerId').lean();
  if (!a || (['pending_review', 'rejected'].includes(a.status) && oid(a.sellerId) !== oid(viewerId))) throw ApiError.notFound('AUCTION_NOT_FOUND');
  const bids = await Bid.find({ auctionId: id, status: 'valid' }).sort({ _id: -1 }).limit(limit).lean();
  return bids.map((b) => ({ id: oid(b._id), alias: b.alias, amountMinor: b.amountMinor, kind: b.kind, at: b.createdAt, mine: Boolean(viewerId && oid(b.bidderId) === oid(viewerId)) }));
};

/** Cards for auctions, in the order given. */
const cardsFor = async (auctions, { lang, viewerPoint }) => {
  const listings = new Map((await Listing.find({ _id: { $in: auctions.map((a) => a.listingId) } }).lean()).map((l) => [oid(l._id), l]));
  const ordered = auctions.map((a) => listings.get(oid(a.listingId))).filter(Boolean);
  return cardDtos(ordered, { lang, viewerPoint });
};

/** Browse: live (ending soonest first), upcoming (starting soonest first), or recently ended. */
export const browseAuctions = async (q, { lang } = {}) => {
  const status = q.status || 'live';
  const filter = { status };
  const hasPoint = q.lat !== undefined && q.lng !== undefined;
  if (q.categoryId || q.q || (hasPoint && q.radiusKm)) {
    const lf = { listingType: 'auction', status: { $in: ['published', 'sold'] } };
    if (q.categoryId) lf.categoryPath = new ObjectId(q.categoryId);
    for (const token of (q.q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) (lf.$and ||= []).push({ searchText: new RegExp(escapeRegex(token)) });
    if (hasPoint && q.radiusKm) lf.publicGeo = { $geoWithin: { $centerSphere: [[q.lng, q.lat], q.radiusKm / EARTH_KM] } };
    filter.listingId = { $in: await Listing.find(lf).distinct('_id') };
  }
  const sort = status === 'scheduled' ? { startAt: 1 } : status === 'ended' ? { endedAt: -1 } : { endAt: 1 };
  const docs = await Auction.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit + 1).lean();
  const items = await cardsFor(docs.slice(0, q.limit), { lang, viewerPoint: hasPoint ? { lat: q.lat, lng: q.lng } : null });
  return { items, page: q.page, hasMore: docs.length > q.limit };
};

/** "My auctions": ones I sell, or ones I bid on with how I stand. */
export const myAuctions = async (userId, { role, lang }) => {
  if (role === 'selling') {
    const docs = await Auction.find({ sellerId: userId, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(100).lean();
    const listings = new Map((await Listing.find({ _id: { $in: docs.map((a) => a.listingId) } }).select('title media').lean()).map((l) => [oid(l._id), l]));
    return docs.map((a) => ({ ...sellerView(a, listings.get(oid(a.listingId))), cover: listings.get(oid(a.listingId))?.media?.[0]?.url || null }));
  }
  const ids = await Bid.distinct('auctionId', { bidderId: userId, status: 'valid' });
  const docs = await Auction.find({ _id: { $in: ids } }).sort({ endAt: -1 }).limit(100).lean();
  const listings = new Map((await Listing.find({ _id: { $in: docs.map((a) => a.listingId) } }).select('title media').lean()).map((l) => [oid(l._id), l]));
  return docs.map((a) => {
    const l = listings.get(oid(a.listingId));
    const leading = oid(a.state.highestBidderId) === oid(userId);
    const standing = a.status === 'ended' ? (oid(a.winnerId) === oid(userId) ? 'won' : 'lost') : a.status === 'cancelled' ? 'cancelled' : leading ? 'leading' : 'outbid';
    return { ...summaryOf(a), listingId: oid(a.listingId), title: l?.title, cover: l?.media?.[0]?.url || null, standing };
  });
};

/* ───── admin ───── */

const syncListingEnd = (a) => Listing.updateOne({ _id: a.listingId }, { $set: { expiresAt: a.endAt } });

export const reviewAuction = async (adminId, id, action, reason) => {
  const a = await Auction.findById(id);
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  if (a.status !== 'pending_review') throw ApiError.badRequest('INVALID_STATE', 'Only an auction waiting for review can be approved or rejected');
  const listing = await Listing.findById(a.listingId).select('title').lean();
  const now = new Date();
  if (action === 'approve') {
    const cfg = await getSettingValue('auctions');
    a.rules = snapshotRules(cfg, a.currency); // the rules in force today stay with this auction
    if (a.startAt < now) a.startAt = now;
    a.endAt = new Date(a.startAt.getTime() + a.durationMs);
    a.originalEndAt = a.endAt;
    a.status = a.startAt > now ? 'scheduled' : 'live';
    a.moderation = { reviewedBy: adminId, reviewedAt: now };
    await a.save();
    await Listing.updateOne({ _id: a.listingId }, { $set: { status: 'published', publishedAt: now, expiresAt: a.endAt, moderation: { reviewedBy: adminId, reviewedAt: now } } });
    await notify(a.sellerId, 'auction.approved', { title: listing?.title }, { route: `/auctions/${a._id}` });
  } else {
    a.status = 'rejected';
    a.moderation = { reviewedBy: adminId, reviewedAt: now, reason };
    await a.save();
    await Listing.updateOne({ _id: a.listingId }, { $set: { status: 'rejected', moderation: { reviewedBy: adminId, reviewedAt: now, reason } } });
    await notify(a.sellerId, 'auction.rejected', { title: listing?.title, reason }, { route: '/my-auctions' });
  }
  return a;
};

/** suspend | resume | extend | cancel — each audited by the route. */
export const controlAuction = async (id, { action, minutes, reason }) => {
  const a = await Auction.findById(id);
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  const now = new Date();
  const before = { status: a.status, endAt: a.endAt };

  if (action === 'suspend') {
    if (a.status !== 'live') throw ApiError.badRequest('INVALID_STATE', 'Only a live auction can be suspended');
    a.status = 'suspended';
    a.suspendedAt = now;
  } else if (action === 'resume') {
    if (a.status !== 'suspended') throw ApiError.badRequest('INVALID_STATE', 'Only a suspended auction can be resumed');
    // bidders get back the time the auction was frozen
    a.endAt = new Date(Math.max(a.endAt.getTime(), now.getTime()) + (now.getTime() - a.suspendedAt.getTime()));
    a.status = 'live';
    a.suspendedAt = undefined;
  } else if (action === 'extend') {
    if (!['live', 'scheduled', 'suspended'].includes(a.status)) throw ApiError.badRequest('INVALID_STATE', 'Only an open auction can be extended');
    a.endAt = new Date(a.endAt.getTime() + minutes * 60_000);
  } else if (action === 'cancel') {
    if (['ended', 'cancelled'].includes(a.status)) throw ApiError.badRequest('INVALID_STATE', 'This auction is already closed');
    a.status = 'cancelled';
  }
  a.state.version += 1;
  await a.save();
  await syncListingEnd(a);

  const fresh = a.toObject();
  emitToRoom(`auction:${a._id}`, 'auction:update', publicState(fresh));
  if (action === 'cancel') {
    await Listing.updateOne({ _id: a.listingId }, { $set: { status: 'removed', moderation: { reason } } });
    emitToRoom(`auction:${a._id}`, 'auction:ended', { auctionId: oid(a._id), outcome: null, cancelled: true });
    const title = (await Listing.findById(a.listingId).select('title').lean())?.title;
    const people = [a.sellerId, ...(await Bid.distinct('bidderId', { auctionId: a._id }))];
    for (const u of people) await notify(u, 'auction.cancelled', { title, reason }, { route: `/auctions/${a._id}` });
  }
  return { before, after: { status: a.status, endAt: a.endAt } };
};

export const adminList = async ({ status, q, page, limit }) => {
  const f = {};
  if (status) f.status = status;
  if (q) f.listingId = { $in: await Listing.find({ listingType: 'auction', $or: [{ title: new RegExp(escapeRegex(q), 'i') }, { listingNo: new RegExp(escapeRegex(q), 'i') }] }).distinct('_id') };
  const sort = status === 'pending_review' ? { createdAt: 1 } : status === 'live' ? { endAt: 1 } : { createdAt: -1 };
  const [docs, total, pending, live] = await Promise.all([
    Auction.find(f).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Auction.countDocuments(f),
    Auction.countDocuments({ status: 'pending_review' }),
    Auction.countDocuments({ status: 'live' }),
  ]);
  const listings = new Map((await Listing.find({ _id: { $in: docs.map((a) => a.listingId) } }).select('title listingNo media').lean()).map((l) => [oid(l._id), l]));
  const sellers = new Map((await User.find({ _id: { $in: docs.map((a) => a.sellerId) } }).select('name phone.e164').lean()).map((u) => [oid(u._id), u]));
  return {
    rows: docs.map((a) => {
      const l = listings.get(oid(a.listingId));
      const s = sellers.get(oid(a.sellerId));
      return {
        ...summaryOf(a),
        title: l?.title,
        listingNo: l?.listingNo,
        cover: l?.media?.[0]?.url || null,
        currency: a.currency,
        factor: minorFactor(a.currency),
        reserveMinor: a.reserveMinor ?? null,
        seller: s ? { id: oid(s._id), name: s.name || null, phone: s.phone?.e164 } : null,
        createdAt: a.createdAt,
      };
    }),
    total,
    counts: { pending, live },
  };
};

/** Everything about one auction, including who placed each bid. */
export const adminDetail = async (id) => {
  const a = await Auction.findById(id).lean();
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  const [listing, bids, deals] = await Promise.all([
    Listing.findById(a.listingId).lean(),
    Bid.find({ auctionId: a._id }).sort({ _id: -1 }).limit(500).lean(),
    Deal.find({ auctionId: a._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const userIds = [a.sellerId, ...bids.map((b) => b.bidderId), ...deals.map((d) => d.buyerId)];
  const users = new Map((await User.find({ _id: { $in: userIds } }).select('name phone.e164').lean()).map((u) => [oid(u._id), u]));
  const who = (uid) => ({ id: oid(uid), name: users.get(oid(uid))?.name || null, phone: users.get(oid(uid))?.phone?.e164 || null });
  return {
    ...summaryOf(a),
    currency: a.currency,
    factor: minorFactor(a.currency),
    reserveMinor: a.reserveMinor ?? null,
    incrementMinor: a.incrementMinor ?? null,
    durationHours: a.durationMs / HOUR_MS,
    originalEndAt: a.originalEndAt || null,
    extensions: a.extensions,
    rules: a.rules,
    state: { ...a.state, highestBidder: a.state.highestBidderId ? who(a.state.highestBidderId) : null },
    winner: a.winnerId ? who(a.winnerId) : null,
    finalMinor: a.finalMinor ?? null,
    notes: a.notes,
    moderation: a.moderation || null,
    seller: who(a.sellerId),
    listing: listing
      ? { id: oid(listing._id), title: listing.title, listingNo: listing.listingNo, description: listing.description, media: (listing.media || []).map((m) => m.url), place: listing.location?.label }
      : null,
    bids: bids.map((b) => ({ id: oid(b._id), alias: b.alias, bidder: who(b.bidderId), amountMinor: b.amountMinor, maxMinor: b.maxMinor ?? null, kind: b.kind, status: b.status, voidReason: b.voidReason || null, at: b.createdAt })),
    deals: deals.map((d) => ({ id: oid(d._id), buyer: who(d.buyerId), amountMinor: d.amountMinor, source: d.source, status: d.status, confirmBy: d.confirmBy, createdAt: d.createdAt })),
    buyNowOpen: buyNowOpen(a),
    nextMinimumMinor: a.status === 'live' ? nextMinimum({ startingMinor: a.startingMinor, state: a.state, tiers: a.rules.incrementTiers, sellerIncrementMinor: a.incrementMinor }) : null,
  };
};

export { syncListingEnd };

/** The seller's own numbers, in major units, for the edit form. */
export const auctionForEdit = async (sellerId, id) => {
  const a = await mine(sellerId, id);
  const f = minorFactor(a.currency);
  const major = (n) => (n == null ? null : n / f);
  return {
    id: oid(a._id),
    listingId: oid(a.listingId),
    status: a.status,
    auction: {
      startingBid: major(a.startingMinor),
      reservePrice: major(a.reserveMinor),
      buyNowPrice: major(a.buyNowMinor),
      increment: major(a.incrementMinor),
      startAt: a.status === 'pending_review' || a.status === 'rejected' ? a.startAt : null,
      durationHours: a.durationMs / HOUR_MS,
    },
  };
};
