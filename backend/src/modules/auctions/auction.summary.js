import { Auction } from './auction.model.js';

/** What a card or detail page shows about an auction (never the hidden reserve or anyone's identity). */
export const summaryOf = (a) => ({
  id: String(a._id),
  status: a.status,
  startAt: a.startAt,
  endAt: a.endAt,
  startingMinor: a.startingMinor,
  currentMinor: a.state.bidCount > 0 ? a.state.currentMinor : null,
  bidCount: a.state.bidCount,
  bidderCount: a.state.bidderCount,
  hasReserve: Boolean(a.reserveMinor),
  reserveMet: a.reserveMinor ? Boolean(a.state.reserveMet) : null,
  buyNowMinor: buyNowOpen(a) ? a.buyNowMinor : null,
  outcome: a.outcome || null,
});

/** Buy-now disappears once a bid reaches it, and once the reserve is met (seller cannot be undercut). */
export const buyNowOpen = (a) =>
  Boolean(a.buyNowMinor) && a.status === 'live' && a.state.currentMinor < a.buyNowMinor && (!a.reserveMinor || !a.state.reserveMet) && a.state.bidCount === 0;

export const auctionSummaries = async (listingIds) => {
  if (!listingIds.length) return new Map();
  const docs = await Auction.find({ listingId: { $in: listingIds } }).lean();
  return new Map(docs.map((a) => [String(a.listingId), summaryOf(a)]));
};
