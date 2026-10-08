import { Auction, Bid, Deal, Strike } from './auction.model.js';
import { Listing } from '../listings/listing.model.js';
import { User } from '../users/user.model.js';
import { Conversation } from '../chat/chat.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { notify } from '../notifications/notification.service.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { oid, formatMoney, HOUR_MS } from './auction.util.js';

/* ───── strikes ───── */

const DAY_MS = 24 * HOUR_MS;

/** Is this person currently barred from bidding (role 'buyer') or from creating auctions (role 'seller')? */
export const restriction = async (userId, role) => {
  const { strikes } = await getSettingValue('auctions');
  const active = await Strike.find({ userId, role, removedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  if (active.length >= strikes.banAt) return { restricted: true, banned: true, until: null };
  if (active.length >= strikes.blockAt) {
    const until = new Date(active[0].createdAt.getTime() + strikes.blockDays * DAY_MS);
    if (until > new Date()) return { restricted: true, banned: false, until };
  }
  return { restricted: false };
};

export const addStrike = async (userId, role, dealId, reason) => {
  const { strikes } = await getSettingValue('auctions');
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + strikes.expireMonths);
  await Strike.create({ userId, role, dealId, reason, expiresAt });
  const r = await restriction(userId, role);
  const note = r.banned ? `${reason} You can no longer ${role === 'buyer' ? 'bid' : 'create auctions'}.` : r.restricted ? `${reason} You are blocked until ${r.until.toDateString()}.` : `${reason} This is a warning.`;
  await notify(userId, 'account.strike', { reason: note });
};

/* ───── deals ───── */

const push = (deal, event, by) => deal.timeline.push({ at: new Date(), event, by });

const titleOf = async (listingId) => (await Listing.findById(listingId).select('title').lean())?.title || '';

/** Open the chat between buyer and seller so they can arrange the handover. */
const ensureChat = (listingId, buyerId, sellerId) =>
  Conversation.findOneAndUpdate({ listingId, buyerId }, { $setOnInsert: { listingId, buyerId, sellerId } }, { upsert: true, new: true });

export const createDeal = async ({ auction, buyerId, amountMinor, source }) => {
  const hours = auction.rules.paymentWindowHours;
  const offerHours = auction.rules.offerWindowHours;
  const deal = await Deal.create({
    auctionId: auction._id,
    listingId: auction.listingId,
    sellerId: auction.sellerId,
    buyerId,
    amountMinor,
    currency: auction.currency,
    source,
    confirmBy: new Date(Date.now() + (source === 'offer' ? offerHours : hours) * HOUR_MS),
    timeline: [{ at: new Date(), event: source === 'offer' ? 'offer_made' : 'deal_created', by: 'system' }],
  });
  return deal;
};

const forUser = async (dealId, userId) => {
  const deal = await Deal.findById(dealId);
  if (!deal || (oid(deal.buyerId) !== oid(userId) && oid(deal.sellerId) !== oid(userId))) throw ApiError.notFound('DEAL_NOT_FOUND');
  return deal;
};

const finishOfferWin = async (deal) => {
  // an accepted offer makes that bidder the winner of the auction
  await Auction.updateOne({ _id: deal.auctionId }, { $set: { outcome: 'won', winnerId: deal.buyerId, finalMinor: deal.amountMinor } });
  await Listing.updateOne({ _id: deal.listingId }, { $set: { status: 'sold', soldAt: new Date() } });
};

/** Buyer says "I will proceed". Opens the chat and shares contact details. */
export const confirmDeal = async (userId, dealId) => {
  const deal = await forUser(dealId, userId);
  if (oid(deal.buyerId) !== oid(userId)) throw ApiError.forbidden('NOT_BUYER', 'Only the buyer can confirm');
  if (deal.status !== 'awaiting_confirmation') throw ApiError.badRequest('INVALID_STATE', 'This deal can no longer be confirmed');
  if (deal.confirmBy < new Date()) throw ApiError.badRequest('DEAL_EXPIRED', 'The time to confirm has passed');
  deal.status = 'in_progress';
  deal.confirmedAt = new Date();
  push(deal, 'buyer_confirmed', 'buyer');
  await deal.save();
  if (deal.source === 'offer') await finishOfferWin(deal);
  await ensureChat(deal.listingId, deal.buyerId, deal.sellerId);
  await notify(deal.sellerId, 'deal.update', { title: await titleOf(deal.listingId), status: 'confirmed by the buyer' }, { route: `/deals/${deal._id}` });
  return deal;
};

/** Buyer walks away before confirming, or seller backs out: the one who leaves gets a strike. */
export const cancelDeal = async (userId, dealId, reason) => {
  const deal = await forUser(dealId, userId);
  if (!['awaiting_confirmation', 'in_progress'].includes(deal.status)) throw ApiError.badRequest('INVALID_STATE', 'This deal can no longer be cancelled');
  const isBuyer = oid(deal.buyerId) === oid(userId);
  deal.status = isBuyer ? 'buyer_defaulted' : 'seller_defaulted';
  deal.disputeReason = reason;
  push(deal, isBuyer ? 'buyer_cancelled' : 'seller_cancelled', isBuyer ? 'buyer' : 'seller');
  await deal.save();
  await addStrike(userId, isBuyer ? 'buyer' : 'seller', deal._id, isBuyer ? 'You backed out of an auction you won.' : 'You cancelled an auction sale.');
  await Listing.updateOne({ _id: deal.listingId, status: 'sold', soldAt: { $exists: true } }, { $set: { status: 'expired' } });
  const other = isBuyer ? deal.sellerId : deal.buyerId;
  await notify(other, 'deal.update', { title: await titleOf(deal.listingId), status: 'cancelled' }, { route: `/deals/${deal._id}` });
  return deal;
};

/** Each side marks the handover done; when both have, the deal is completed. */
export const completeDeal = async (userId, dealId) => {
  const deal = await forUser(dealId, userId);
  if (deal.status !== 'in_progress') throw ApiError.badRequest('INVALID_STATE', 'Only a deal in progress can be completed');
  deal.completedBy[oid(deal.buyerId) === oid(userId) ? 'buyer' : 'seller'] = new Date();
  push(deal, 'marked_complete', oid(deal.buyerId) === oid(userId) ? 'buyer' : 'seller');
  if (deal.completedBy.buyer && deal.completedBy.seller) {
    deal.status = 'completed';
    push(deal, 'completed', 'system');
    const title = await titleOf(deal.listingId);
    await Promise.all([deal.buyerId, deal.sellerId].map((u) => notify(u, 'deal.update', { title, status: 'completed' }, { route: `/deals/${deal._id}` })));
  }
  await deal.save();
  return deal;
};

export const disputeDeal = async (userId, dealId, reason) => {
  const deal = await forUser(dealId, userId);
  if (deal.status !== 'in_progress') throw ApiError.badRequest('INVALID_STATE', 'Only a deal in progress can be disputed');
  deal.status = 'disputed';
  deal.disputeReason = reason;
  push(deal, 'dispute_raised', oid(deal.buyerId) === oid(userId) ? 'buyer' : 'seller');
  await deal.save();
  const other = oid(deal.buyerId) === oid(userId) ? deal.sellerId : deal.buyerId;
  await notify(other, 'deal.update', { title: await titleOf(deal.listingId), status: 'under dispute' }, { route: `/deals/${deal._id}` });
  return deal;
};

/** Seller offers the item to another bidder (reserve not met, or the winner defaulted). */
export const offerToBidder = async (sellerId, auctionId) => {
  const a = await Auction.findOne({ _id: auctionId, sellerId });
  if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
  if (a.status !== 'ended') throw ApiError.badRequest('INVALID_STATE', 'The auction has not ended');
  const r = await restriction(sellerId, 'seller');
  if (r.restricted) throw ApiError.forbidden('ACCOUNT_RESTRICTED', 'You cannot make offers right now');

  const deals = await Deal.find({ auctionId: a._id }).lean();
  if (deals.some((d) => ['awaiting_confirmation', 'in_progress', 'completed', 'disputed'].includes(d.status))) {
    throw ApiError.badRequest('DEAL_ACTIVE', 'There is already a deal for this auction');
  }
  const window = a.rules.paymentWindowHours * HOUR_MS;
  if (Date.now() > a.endedAt.getTime() + window * 2) throw ApiError.badRequest('OFFER_WINDOW_CLOSED', 'The time to make an offer has passed');
  if (!['reserve_not_met', 'won', 'bought_now'].includes(a.outcome)) throw ApiError.badRequest('NO_BIDDERS', 'Nobody bid on this auction');

  const tried = new Set(deals.map((d) => oid(d.buyerId)));
  const best = await Bid.aggregate([
    { $match: { auctionId: a._id, status: 'valid' } },
    { $group: { _id: '$bidderId', top: { $max: '$amountMinor' } } },
    { $sort: { top: -1 } },
  ]);
  for (const c of best) {
    if (tried.has(oid(c._id)) || (await restriction(c._id, 'buyer')).restricted) continue;
    const deal = await createDeal({ auction: a, buyerId: c._id, amountMinor: c.top, source: 'offer' });
    await notify(c._id, 'auction.offer', { title: await titleOf(a.listingId), amount: formatMoney(c.top, a.currency) }, { route: `/deals/${deal._id}` });
    return deal;
  }
  throw ApiError.badRequest('NO_BIDDERS', 'There is no other bidder to offer this to');
};

/** Winners who never confirm in time get a strike and the seller is told. Runs from the scheduler. */
export const expireStaleDeals = async () => {
  const stale = await Deal.find({ status: 'awaiting_confirmation', confirmBy: { $lt: new Date() } }).limit(50);
  for (const deal of stale) {
    const flipped = await Deal.findOneAndUpdate({ _id: deal._id, status: 'awaiting_confirmation' }, { $set: { status: 'buyer_defaulted' }, $push: { timeline: { at: new Date(), event: 'confirm_window_expired', by: 'system' } } }, { new: true });
    if (!flipped) continue;
    if (deal.source !== 'offer') await addStrike(deal.buyerId, 'buyer', deal._id, 'You did not confirm an auction you won in time.');
    await Listing.updateOne({ _id: deal.listingId, status: 'sold' }, { $set: { status: 'expired' } });
    await notify(deal.sellerId, 'deal.update', { title: await titleOf(deal.listingId), status: 'cancelled: the buyer did not confirm in time. You can offer the item to another bidder' }, { route: `/auctions/${deal.auctionId}` });
  }
};

/* ───── views ───── */

export const dealDto = async (deal, viewerId) => {
  const isBuyer = oid(deal.buyerId) === oid(viewerId);
  const [listing, counterpart] = await Promise.all([
    Listing.findById(deal.listingId).select('title media listingNo location').lean(),
    User.findById(isBuyer ? deal.sellerId : deal.buyerId).select('name avatar.url phone.e164').lean(),
  ]);
  const share = ['in_progress', 'completed', 'disputed'].includes(deal.status);
  const conversation = share ? await Conversation.findOne({ listingId: deal.listingId, buyerId: deal.buyerId }).select('_id').lean() : null;
  return {
    id: oid(deal._id),
    auctionId: oid(deal.auctionId),
    listing: listing ? { id: oid(listing._id), title: listing.title, cover: listing.media?.[0]?.url || null, listingNo: listing.listingNo } : null,
    role: isBuyer ? 'buyer' : 'seller',
    status: deal.status,
    source: deal.source,
    amountMinor: deal.amountMinor,
    currency: deal.currency,
    confirmBy: deal.status === 'awaiting_confirmation' ? deal.confirmBy : null,
    counterpart: counterpart ? { id: oid(counterpart._id), name: counterpart.name || null, avatar: counterpart.avatar?.url || null, phone: share ? counterpart.phone?.e164 : null } : null,
    // the exact pickup point is only for the buyer, and only once the deal is on
    pickup: share && isBuyer && listing?.location ? { label: listing.location.label, lat: listing.location.geo?.coordinates?.[1] ?? null, lng: listing.location.geo?.coordinates?.[0] ?? null } : null,
    conversationId: conversation ? oid(conversation._id) : null,
    iMarkedComplete: Boolean(deal.completedBy?.[isBuyer ? 'buyer' : 'seller']),
    timeline: deal.timeline.map((t) => ({ at: t.at, event: t.event, by: t.by })),
    createdAt: deal.createdAt,
  };
};

export const getDeal = async (userId, id) => dealDto(await forUser(id, userId), userId);

export const myDeals = async (userId, { role }) => {
  const filter = role === 'selling' ? { sellerId: userId } : role === 'buying' ? { buyerId: userId } : { $or: [{ sellerId: userId }, { buyerId: userId }] };
  const docs = await Deal.find(filter).sort({ createdAt: -1 }).limit(100);
  return Promise.all(docs.map((d) => dealDto(d, userId)));
};
