import mongoose from 'mongoose';
import { Auction, Bid } from './auction.model.js';
import { nextMinimum, resolveBid, extendedEnd, recomputeState } from './auction.rules.js';
import { buyNowOpen } from './auction.summary.js';
import { createDeal, restriction } from './deal.service.js';
import { assertNoOverdueCommission } from '../payments/pricing.service.js';
import { Listing } from '../listings/listing.model.js';
import { notify } from '../notifications/notification.service.js';
import { emitToRoom } from '../../realtime/index.js';
import { getSettingValue } from '../settings/settings.service.js';
import { redis } from '../../core/db/redis.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { oid, formatMoney } from './auction.util.js';

const { ObjectId } = mongoose.Types;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One bid at a time per auction: a short lock, plus the version check below as a second guard. */
const withLock = async (auctionId, fn) => {
  const key = `lock:auction:${auctionId}`;
  for (let i = 0; i < 25; i += 1) {
    if (await redis.set(key, '1', 'EX', 5, 'NX')) {
      try {
        return await fn();
      } finally {
        await redis.del(key);
      }
    }
    await sleep(40);
  }
  throw ApiError.conflict('AUCTION_BUSY', 'Many bids are coming in — please try again');
};

const titleOf = async (listingId) => (await Listing.findById(listingId).select('title').lean())?.title || '';

/** Public view of the standing, sent to everyone watching. Never includes who or any private maximum. */
export const publicState = (a) => ({
  auctionId: oid(a._id),
  status: a.status,
  endAt: a.endAt,
  currentMinor: a.state.bidCount > 0 ? a.state.currentMinor : null,
  bidCount: a.state.bidCount,
  bidderCount: a.state.bidderCount,
  reserveMet: a.reserveMinor ? Boolean(a.state.reserveMet) : null,
  nextMinimumMinor: a.status === 'live' ? nextMinimum({ startingMinor: a.startingMinor, state: a.state, tiers: a.rules.incrementTiers, sellerIncrementMinor: a.incrementMinor }) : null,
});

/**
 * Place a bid. Checks run in a fixed order and each failure has its own code.
 * `amount` is in major units (whole currency units only).
 */
export const placeBid = async (bidderId, auctionId, { amountMinor, maxMinor, confirmHigh }) => {
  const cfg = await getSettingValue('auctions');
  if (!cfg.enabled) throw ApiError.forbidden('AUCTIONS_DISABLED', 'Auctions are switched off right now');
  if ((await restriction(bidderId, 'buyer')).restricted) throw ApiError.forbidden('ACCOUNT_RESTRICTED', 'You cannot bid right now');
  await assertNoOverdueCommission(bidderId);

  if (cfg.bidIntervalSec > 0 && !(await redis.set(`bidrate:${auctionId}:${bidderId}`, '1', 'EX', Math.max(1, Math.ceil(cfg.bidIntervalSec)), 'NX'))) {
    throw ApiError.tooMany('RATE_LIMITED', 'Slow down — wait a moment before bidding again');
  }

  const result = await withLock(auctionId, async () => {
    const a = await Auction.findById(auctionId);
    if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
    const now = new Date();
    const plain = a.toObject();
    if (a.status !== 'live') throw ApiError.badRequest('AUCTION_NOT_LIVE', a.status === 'scheduled' ? 'This auction has not started yet' : 'This auction is not open for bids');
    if (now >= a.endAt) throw ApiError.badRequest('AUCTION_ENDED', 'This auction has ended');
    if (oid(a.sellerId) === oid(bidderId)) throw ApiError.forbidden('SELF_BID_NOT_ALLOWED', 'You cannot bid on your own auction');

    const min = nextMinimum({ startingMinor: a.startingMinor, state: plain.state, tiers: plain.rules.incrementTiers, sellerIncrementMinor: a.incrementMinor });
    if (amountMinor < min) throw ApiError.badRequest('BID_TOO_LOW', 'Your bid is below the minimum', { nextMinimumMinor: min });
    const base = a.state.bidCount > 0 ? a.state.currentMinor : a.startingMinor;
    if (!confirmHigh && amountMinor > base * a.rules.sanityCapMultiplier) {
      throw ApiError.badRequest('BID_TOO_HIGH_CONFIRM', 'This is much higher than the current bid — please confirm', { amountMinor });
    }

    const max = a.rules.proxyBidding ? Math.max(maxMinor ?? amountMinor, amountMinor) : amountMinor;
    const prevLeader = a.state.highestBidderId ? oid(a.state.highestBidderId) : null;
    const { next, records, raisedOwnMax } = resolveBid({
      startingMinor: a.startingMinor,
      reserveMinor: a.reserveMinor,
      state: plain.state,
      tiers: plain.rules.incrementTiers,
      sellerIncrementMinor: a.incrementMinor,
      bidderId: oid(bidderId),
      amountMinor,
      maxMinor: max,
    });

    // who is "Bidder n" in this auction: the order in which people first bid
    const involved = [...new Set(records.map((r) => oid(r.bidderId)).concat(oid(bidderId)))];
    const known = await Bid.find({ auctionId: a._id, bidderId: { $in: involved } }).select('bidderId alias').lean();
    const aliasOf = new Map(known.map((k) => [oid(k.bidderId), k.alias]));
    const isNewBidder = !aliasOf.has(oid(bidderId));
    if (isNewBidder) aliasOf.set(oid(bidderId), a.state.bidderCount + 1);
    const bidderCount = a.state.bidderCount + (isNewBidder ? 1 : 0);

    const docs = records.map((r) => ({ _id: new ObjectId(), auctionId: a._id, bidderId: r.bidderId, alias: aliasOf.get(oid(r.bidderId)), amountMinor: r.amountMinor, maxMinor: r.maxMinor, kind: r.kind }));
    const lastForLeader = [...docs].reverse().find((d) => oid(d.bidderId) === oid(next.highestBidderId));

    const set = {
      'state.currentMinor': next.currentMinor,
      'state.leaderMaxMinor': next.leaderMaxMinor,
      'state.highestBidderId': next.highestBidderId,
      'state.bidderCount': bidderCount,
      'state.reserveMet': raisedOwnMax ? a.state.reserveMet : Boolean(next.reserveMet),
      'state.lastBidAt': now,
    };
    if (lastForLeader) set['state.highestBidId'] = lastForLeader._id;

    let endAt = a.endAt;
    const extended = extendedEnd({ endAt: a.endAt, now, rules: a.rules, extensions: a.extensions });
    if (extended && !raisedOwnMax) {
      set.endAt = extended;
      endAt = extended;
    }

    const res = await Auction.updateOne(
      { _id: a._id, 'state.version': a.state.version, status: 'live', endAt: { $gt: now } },
      { $set: set, $inc: { 'state.bidCount': docs.length, 'state.version': 1, ...(extended && !raisedOwnMax ? { extensions: 1 } : {}) } }
    );
    if (!res.modifiedCount) throw ApiError.conflict('OUTBID_WHILE_PLACING', 'Someone bid at the same moment — please try again', { nextMinimumMinor: min });
    if (docs.length) await Bid.insertMany(docs);

    return { auctionId: a._id, listingId: a.listingId, currency: a.currency, prevLeader, newLeader: oid(next.highestBidderId), extended: Boolean(extended && !raisedOwnMax), endAt, raisedOwnMax };
  });

  const fresh = await Auction.findById(auctionId).lean();
  emitToRoom(`auction:${auctionId}`, 'auction:update', publicState(fresh));
  if (result.extended) await Listing.updateOne({ _id: result.listingId }, { $set: { expiresAt: result.endAt } });
  if (result.extended) emitToRoom(`auction:${auctionId}`, 'auction:extended', { auctionId: oid(auctionId), endAt: result.endAt });
  if (result.prevLeader && result.prevLeader !== result.newLeader) {
    await notify(result.prevLeader, 'auction.outbid', { title: await titleOf(result.listingId), amount: formatMoney(fresh.state.currentMinor, result.currency) }, { route: `/auctions/${auctionId}` });
  }
  return { ...publicState(fresh), isLeading: result.newLeader === oid(bidderId), extended: result.extended };
};

/** Pay the fixed price and end the auction now. Only offered before the first bid. */
export const buyNow = async (buyerId, auctionId) => {
  if ((await restriction(buyerId, 'buyer')).restricted) throw ApiError.forbidden('ACCOUNT_RESTRICTED', 'You cannot buy right now');
  const deal = await withLock(auctionId, async () => {
    const a = await Auction.findById(auctionId);
    if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
    if (oid(a.sellerId) === oid(buyerId)) throw ApiError.forbidden('SELF_BID_NOT_ALLOWED', 'You cannot buy your own auction');
    if (!buyNowOpen(a) || new Date() >= a.endAt) throw ApiError.badRequest('BUY_NOW_UNAVAILABLE', 'Buy now is no longer available');

    const now = new Date();
    const res = await Auction.updateOne(
      { _id: a._id, 'state.version': a.state.version, status: 'live', 'state.bidCount': 0 },
      { $set: { status: 'ended', outcome: 'bought_now', winnerId: buyerId, finalMinor: a.buyNowMinor, endedAt: now, 'state.currentMinor': a.buyNowMinor, 'state.highestBidderId': buyerId, 'state.bidCount': 1, 'state.bidderCount': 1 }, $inc: { 'state.version': 1 } }
    );
    if (!res.modifiedCount) throw ApiError.conflict('OUTBID_WHILE_PLACING', 'Someone bid at the same moment — buy now is no longer available');
    await Bid.create({ auctionId: a._id, bidderId: buyerId, alias: 1, amountMinor: a.buyNowMinor, kind: 'buy_now' });
    await Listing.updateOne({ _id: a.listingId }, { $set: { status: 'sold', soldAt: now } });
    const ended = await Auction.findById(a._id);
    return createDeal({ auction: ended, buyerId, amountMinor: a.buyNowMinor, source: 'buy_now' });
  });
  const fresh = await Auction.findById(auctionId).lean();
  emitToRoom(`auction:${auctionId}`, 'auction:update', publicState(fresh));
  emitToRoom(`auction:${auctionId}`, 'auction:ended', { auctionId: oid(auctionId), outcome: 'bought_now' });
  const title = await titleOf(fresh.listingId);
  await notify(fresh.sellerId, 'auction.seller_result', { title, result: `bought now for ${formatMoney(fresh.finalMinor, fresh.currency)}` }, { route: `/auctions/${auctionId}` });
  return deal;
};

/* ───── starting and ending ───── */

/** Move one auction from live to ended and decide the result. Safe to call twice. */
export const closeAuction = async (auctionId) => {
  const now = new Date();
  const a = await Auction.findOneAndUpdate({ _id: auctionId, status: 'live', endAt: { $lte: now } }, { $set: { status: 'ended', endedAt: now } }, { new: true });
  if (!a) return null;

  let outcome;
  if (a.state.bidCount === 0) outcome = 'no_bids';
  else if (a.reserveMinor && !a.state.reserveMet) outcome = 'reserve_not_met';
  else outcome = 'won';

  const update = { outcome };
  if (outcome === 'won') Object.assign(update, { winnerId: a.state.highestBidderId, finalMinor: a.state.currentMinor });
  await Auction.updateOne({ _id: a._id }, { $set: update });

  const title = await titleOf(a.listingId);
  const money = (n) => formatMoney(n, a.currency);
  let result;
  if (outcome === 'won') {
    await createDeal({ auction: a, buyerId: a.state.highestBidderId, amountMinor: a.state.currentMinor, source: 'win' });
    await Listing.updateOne({ _id: a.listingId }, { $set: { status: 'sold', soldAt: now } });
    await notify(a.state.highestBidderId, 'auction.won', { title, amount: money(a.state.currentMinor) }, { route: `/auctions/${a._id}` });
    result = `sold for ${money(a.state.currentMinor)}`;
  } else {
    result = outcome === 'no_bids' ? 'ended without any bids' : 'ended, but the reserve price was not met. You can offer it to the top bidder';
  }
  await notify(a.sellerId, 'auction.seller_result', { title, result }, { route: `/auctions/${a._id}` });

  const bidders = await Bid.distinct('bidderId', { auctionId: a._id, status: 'valid' });
  for (const b of bidders) if (oid(b) !== oid(a.state.highestBidderId) || outcome !== 'won') await notify(b, 'auction.lost', { title }, { route: `/auctions/${a._id}` });

  const fresh = await Auction.findById(a._id).lean();
  emitToRoom(`auction:${a._id}`, 'auction:update', publicState(fresh));
  emitToRoom(`auction:${a._id}`, 'auction:ended', { auctionId: oid(a._id), outcome });
  return fresh;
};

/** Called every few seconds: open auctions whose start time has come, close the ones whose time is up. */
export const sweepAuctions = async () => {
  const now = new Date();
  const started = await Auction.updateMany({ status: 'scheduled', startAt: { $lte: now } }, { $set: { status: 'live' } });
  if (started.modifiedCount) logger.info(`Auctions started: ${started.modifiedCount}`);
  const due = await Auction.find({ status: 'live', endAt: { $lte: now } }).select('_id').limit(50).lean();
  for (const { _id } of due) {
    try {
      await closeAuction(_id);
    } catch (err) {
      logger.error('Closing auction failed', { auctionId: oid(_id), err: err.message });
    }
  }
};

/* ───── admin: void a bid ───── */

export const voidBid = async (auctionId, bidId, reason) => {
  return withLock(auctionId, async () => {
    const a = await Auction.findById(auctionId);
    if (!a) throw ApiError.notFound('AUCTION_NOT_FOUND');
    if (!['live', 'suspended'].includes(a.status)) throw ApiError.badRequest('INVALID_STATE', 'Bids can only be voided while the auction is open');
    const bid = await Bid.findOneAndUpdate({ _id: bidId, auctionId, status: 'valid' }, { $set: { status: 'voided', voidReason: reason } });
    if (!bid) throw ApiError.notFound('BID_NOT_FOUND');
    const valid = await Bid.find({ auctionId, status: 'valid' }).lean();
    const next = recomputeState(valid, a.reserveMinor);
    const prevLeader = a.state.highestBidderId ? oid(a.state.highestBidderId) : null;
    await Auction.updateOne({ _id: a._id }, { $set: Object.fromEntries(Object.entries(next).map(([k, v]) => [`state.${k}`, v])), $inc: { 'state.version': 1 } });
    const fresh = await Auction.findById(a._id).lean();
    emitToRoom(`auction:${auctionId}`, 'auction:update', publicState(fresh));
    if (prevLeader && prevLeader !== oid(next.highestBidderId)) {
      await notify(prevLeader, 'auction.outbid', { title: await titleOf(a.listingId), amount: formatMoney(next.currentMinor, a.currency) }, { route: `/auctions/${auctionId}` });
    }
    return { bid: oid(bid._id), state: publicState(fresh) };
  });
};
