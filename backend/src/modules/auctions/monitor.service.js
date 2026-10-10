import mongoose from 'mongoose';
import { Auction, AuctionWatch, Bid, Strike } from './auction.model.js';
import { oid } from './auction.util.js';
import { Listing } from '../listings/listing.model.js';
import { minorFactor } from '../listings/listing.service.js';
import { User } from '../users/user.model.js';
import { Session } from '../auth/auth.models.js';
import { emitToRoom } from '../../realtime/index.js';

/**
 * Admin live monitor and the suspicious-bidding queue (docs/07 §14, SOP §18 "Suspicious Bid Monitoring").
 * Signals are computed from what we already store (bids, sessions, strikes); nothing here changes an auction.
 */

const { Schema } = mongoose;
const MIN = 60_000;
const DAY_MS = 24 * 60 * MIN;
export const ADMIN_ROOM = 'admin:auctions';

/** An admin marked one signal of one auction as checked. */
const reviewSchema = new Schema(
  { auctionId: { type: Schema.Types.ObjectId, required: true }, key: { type: String, required: true }, by: { type: Schema.Types.ObjectId, ref: 'AdminUser' }, note: String },
  { timestamps: { createdAt: true, updatedAt: false } }
);
reviewSchema.index({ auctionId: 1, key: 1 }, { unique: true });
export const SuspicionReview = mongoose.model('SuspicionReview', reviewSchema);

const names = async (ids) => new Map((await User.find({ _id: { $in: ids } }).select('name phone.e164 createdAt').lean()).map((u) => [oid(u._id), u]));
const who = (map, id) => ({ id: oid(id), name: map.get(oid(id))?.name || null, phone: map.get(oid(id))?.phone?.e164 || null });

/* ───── live monitor ───── */

/** Every live auction with how fast bids are coming in, plus the latest bids across all of them. */
export const monitorSnapshot = async () => {
  const live = await Auction.find({ status: { $in: ['live', 'suspended'] } }).sort({ endAt: 1 }).limit(200).lean();
  const ids = live.map((a) => a._id);
  const since = new Date(Date.now() - 10 * MIN);
  const [velocity, watchers, recent, listings] = await Promise.all([
    Bid.aggregate([{ $match: { auctionId: { $in: ids }, createdAt: { $gte: since }, status: 'valid' } }, { $group: { _id: '$auctionId', n: { $sum: 1 } } }]),
    AuctionWatch.aggregate([{ $match: { auctionId: { $in: ids } } }, { $group: { _id: '$auctionId', n: { $sum: 1 } } }]),
    Bid.find({ auctionId: { $in: ids } }).sort({ _id: -1 }).limit(50).lean(),
    Listing.find({ _id: { $in: live.map((a) => a.listingId) } }).select('title listingNo media').lean(),
  ]);
  const v = new Map(velocity.map((x) => [oid(x._id), x.n]));
  const w = new Map(watchers.map((x) => [oid(x._id), x.n]));
  const l = new Map(listings.map((x) => [oid(x._id), x]));
  const auctionOf = new Map(live.map((a) => [oid(a._id), a]));
  const people = await names([...new Set([...recent.map((b) => oid(b.bidderId)), ...live.map((a) => oid(a.state.highestBidderId)).filter((x) => x !== 'undefined')])]);
  const flagged = new Map((await suspiciousQueue({ includeReviewed: false, auctionIds: ids })).map((q) => [q.auctionId, q.signals.length]));
  return {
    serverTime: new Date(),
    auctions: live.map((a) => ({
      id: oid(a._id),
      title: l.get(oid(a.listingId))?.title || '',
      listingNo: l.get(oid(a.listingId))?.listingNo || '',
      cover: l.get(oid(a.listingId))?.media?.[0]?.url || null,
      status: a.status,
      endAt: a.endAt,
      currency: a.currency,
      factor: minorFactor(a.currency),
      currentMinor: a.state.bidCount ? a.state.currentMinor : null,
      startingMinor: a.startingMinor,
      bidCount: a.state.bidCount,
      bidderCount: a.state.bidderCount,
      bidsLast10Min: v.get(oid(a._id)) || 0,
      watchers: w.get(oid(a._id)) || 0,
      extensions: a.extensions,
      reserveMet: a.reserveMinor ? Boolean(a.state.reserveMet) : null,
      leader: a.state.highestBidderId ? who(people, a.state.highestBidderId) : null,
      flags: flagged.get(oid(a._id)) || 0,
    })),
    recentBids: recent.map((b) => bidEvent(b, auctionOf.get(oid(b.auctionId)), l.get(oid(auctionOf.get(oid(b.auctionId))?.listingId)), people)),
  };
};

const bidEvent = (b, a, listing, people) => ({
  id: oid(b._id),
  auctionId: oid(b.auctionId),
  title: listing?.title || '',
  alias: b.alias,
  bidder: who(people, b.bidderId),
  amountMinor: b.amountMinor,
  currency: a?.currency,
  factor: a ? minorFactor(a.currency) : 1,
  kind: b.kind,
  status: b.status,
  at: b.createdAt,
});

/** Called after bids are saved: pushes them (with real identities) to admins watching the monitor. */
export const pushBidsToAdmins = async (auctionId) => {
  const [a, bids] = await Promise.all([Auction.findById(auctionId).lean(), Bid.find({ auctionId }).sort({ _id: -1 }).limit(5).lean()]);
  if (!a) return;
  const [listing, people] = await Promise.all([Listing.findById(a.listingId).select('title').lean(), names(bids.map((b) => b.bidderId))]);
  emitToRoom(ADMIN_ROOM, 'admin:bids', {
    auctionId: oid(a._id),
    currentMinor: a.state.currentMinor,
    bidCount: a.state.bidCount,
    bidderCount: a.state.bidderCount,
    endAt: a.endAt,
    extensions: a.extensions,
    bids: bids.map((b) => bidEvent(b, a, listing, people)),
  });
};

/* ───── suspicious bidding ───── */

const SIGNAL_TEXT = {
  shared_device_with_seller: 'Bidder used the same device as the seller',
  shared_ip_with_seller: 'Bidder used the same internet address (IP) as the seller',
  shared_device_bidders: 'Several bidders used the same device',
  focus_on_seller: 'Bidder bids mostly on this seller’s auctions',
  new_account: 'Account less than 3 days old is bidding',
  repeat_defaulter: 'Bidder has failed to complete won auctions before',
  price_outlier: 'Price is far above similar auctions',
};

/**
 * Auctions that are live or ended in the last 14 days, each with the signals that look wrong.
 * `includeReviewed` false hides signals an admin already marked as checked.
 */
export const suspiciousQueue = async ({ includeReviewed = false, auctionIds } = {}) => {
  const filter = auctionIds
    ? { _id: { $in: auctionIds } }
    : { $or: [{ status: { $in: ['live', 'suspended'] } }, { status: 'ended', endedAt: { $gte: new Date(Date.now() - 14 * DAY_MS) } }] };
  const auctions = await Auction.find({ ...filter, 'state.bidCount': { $gt: 0 } }).limit(300).lean();
  if (!auctions.length) return [];
  const ids = auctions.map((a) => a._id);
  const bids = await Bid.find({ auctionId: { $in: ids }, status: 'valid' }).select('auctionId bidderId amountMinor createdAt').lean();
  const biddersOf = new Map();
  bids.forEach((b) => {
    const k = oid(b.auctionId);
    if (!biddersOf.has(k)) biddersOf.set(k, new Set());
    biddersOf.get(k).add(oid(b.bidderId));
  });
  const allBidders = [...new Set(bids.map((b) => oid(b.bidderId)))];
  const allPeople = [...new Set([...allBidders, ...auctions.map((a) => oid(a.sellerId))])];

  const [sessions, users, strikes, history] = await Promise.all([
    Session.find({ userId: { $in: allPeople } }).select('userId deviceId ip').lean(),
    User.find({ _id: { $in: allPeople } }).select('name phone.e164 createdAt').lean(),
    Strike.aggregate([{ $match: { userId: { $in: allBidders.map((x) => new mongoose.Types.ObjectId(x)) }, role: 'buyer', removedAt: null } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]),
    // each bidder's auctions over the last 90 days, by seller (for "bids mostly on one seller")
    Bid.aggregate([
      { $match: { bidderId: { $in: allBidders.map((x) => new mongoose.Types.ObjectId(x)) }, createdAt: { $gte: new Date(Date.now() - 90 * DAY_MS) } } },
      { $group: { _id: { bidder: '$bidderId', auction: '$auctionId' } } },
      { $lookup: { from: 'auctions', localField: '_id.auction', foreignField: '_id', as: 'a' } },
      { $unwind: '$a' },
      { $group: { _id: { bidder: '$_id.bidder', seller: '$a.sellerId' }, n: { $sum: 1 } } },
    ]),
  ]);
  const devices = new Map();
  const ips = new Map();
  sessions.forEach((s) => {
    const u = oid(s.userId);
    if (s.deviceId) (devices.get(u) || devices.set(u, new Set()).get(u)).add(s.deviceId);
    if (s.ip) (ips.get(u) || ips.set(u, new Set()).get(u)).add(s.ip);
  });
  const shares = (map, a, b) => [...(map.get(a) || [])].some((x) => map.get(b)?.has(x));
  const people = new Map(users.map((u) => [oid(u._id), u]));
  const strikesOf = new Map(strikes.map((s) => [oid(s._id), s.n]));
  const perSeller = new Map(); // bidder → { total, bySeller: Map }
  history.forEach((h) => {
    const b = oid(h._id.bidder);
    const e = perSeller.get(b) || { total: 0, bySeller: new Map() };
    e.total += h.n;
    e.bySeller.set(oid(h._id.seller), h.n);
    perSeller.set(b, e);
  });

  // category medians of final prices (ended + won in the last 180 days) for the outlier check
  const listings = new Map((await Listing.find({ _id: { $in: auctions.map((a) => a.listingId) } }).select('title listingNo categoryId').lean()).map((l) => [oid(l._id), l]));
  const catIds = [...new Set([...listings.values()].map((l) => oid(l.categoryId)))];
  const medians = new Map();
  for (const c of catIds) {
    const done = await Auction.aggregate([
      { $match: { status: 'ended', outcome: { $in: ['won', 'bought_now'] }, endedAt: { $gte: new Date(Date.now() - 180 * DAY_MS) } } },
      { $lookup: { from: 'listings', localField: 'listingId', foreignField: '_id', as: 'l' } },
      { $match: { 'l.categoryId': new mongoose.Types.ObjectId(c) } },
      { $project: { finalMinor: 1 } },
      { $sort: { finalMinor: 1 } },
    ]);
    if (done.length >= 5) medians.set(c, done[Math.floor(done.length / 2)].finalMinor);
  }

  const reviewed = includeReviewed ? new Map() : new Map((await SuspicionReview.find({ auctionId: { $in: ids } }).lean()).map((r) => [`${oid(r.auctionId)}:${r.key}`, r]));
  const out = [];
  for (const a of auctions) {
    const seller = oid(a.sellerId);
    const bidders = [...(biddersOf.get(oid(a._id)) || [])];
    const signals = [];
    const add = (type, userIds, detail) => {
      const key = `${type}:${[...userIds].sort().join(',')}`;
      if (reviewed.has(`${oid(a._id)}:${key}`)) return;
      signals.push({ key, type, text: SIGNAL_TEXT[type], detail: detail || null, users: userIds.map((u) => ({ id: u, name: people.get(u)?.name || null, phone: people.get(u)?.phone?.e164 || null })) });
    };
    for (const b of bidders) {
      if (shares(devices, b, seller)) add('shared_device_with_seller', [b, seller]);
      else if (shares(ips, b, seller)) add('shared_ip_with_seller', [b, seller]);
      const ps = perSeller.get(b);
      const here = ps?.bySeller.get(seller) || 0;
      if (ps && ps.total >= 3 && here / ps.total >= 0.8) add('focus_on_seller', [b], `${here} of ${ps.total} auctions in 90 days`);
      const u = people.get(b);
      if (u && Date.now() - new Date(u.createdAt).getTime() < 3 * DAY_MS) add('new_account', [b], `joined ${new Date(u.createdAt).toISOString().slice(0, 10)}`);
      if ((strikesOf.get(b) || 0) >= 2) add('repeat_defaulter', [b], `${strikesOf.get(b)} active strikes`);
    }
    // bidders sharing a device with each other
    for (let i = 0; i < bidders.length; i += 1) {
      for (let j = i + 1; j < bidders.length; j += 1) if (shares(devices, bidders[i], bidders[j])) add('shared_device_bidders', [bidders[i], bidders[j]]);
    }
    const l = listings.get(oid(a.listingId));
    const median = l && medians.get(oid(l.categoryId));
    const price = a.finalMinor || a.state.currentMinor;
    if (median && price >= median * 3) add('price_outlier', [], `${(price / median).toFixed(1)}× the category median`);
    if (signals.length) {
      out.push({
        auctionId: oid(a._id),
        title: l?.title || '',
        listingNo: l?.listingNo || '',
        status: a.status,
        seller: { id: seller, name: people.get(seller)?.name || null },
        bidCount: a.state.bidCount,
        currentMinor: price,
        currency: a.currency,
        factor: minorFactor(a.currency),
        signals,
      });
    }
  }
  return out.sort((x, y) => y.signals.length - x.signals.length);
};

export const markReviewed = async (adminId, auctionId, key, note) =>
  SuspicionReview.updateOne({ auctionId, key }, { $setOnInsert: { auctionId, key, by: adminId, note } }, { upsert: true });
