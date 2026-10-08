/**
 * The bidding rules as pure functions (no database), so they can be tested on their own.
 * All amounts are minor units.
 */

/** The platform's step for a given price: the last tier whose `from` is not above the price. The seller may only raise it. */
export const incrementFor = (priceMinor, tiers, sellerIncrementMinor = 0) => {
  let step = tiers[0]?.step ?? 1;
  for (const t of tiers) if (priceMinor >= t.from) step = t.step;
  return Math.max(step, sellerIncrementMinor || 0);
};

/** Lowest bid accepted right now. */
export const nextMinimum = ({ startingMinor, state, tiers, sellerIncrementMinor }) =>
  state.bidCount > 0 ? state.currentMinor + incrementFor(state.currentMinor, tiers, sellerIncrementMinor) : startingMinor;

/**
 * Work out what a new bid does. Returns the new state plus the bid records to store (oldest first).
 *
 *  - Without proxy bidding a bid is its own maximum, so the price always equals the leader's bid.
 *  - With proxy bidding, `maxMinor` is hidden: the system bids just enough to stay ahead.
 *  - Equal maximums: the earlier one wins.
 *
 * `bidderIsLeader` means the same person is already winning: they can only raise their private maximum.
 */
export const resolveBid = ({ startingMinor, reserveMinor, state, tiers, sellerIncrementMinor, bidderId, amountMinor, maxMinor }) => {
  const inc = (price) => incrementFor(price, tiers, sellerIncrementMinor);
  const max = Math.max(maxMinor ?? amountMinor, amountMinor);
  const leaderId = state.highestBidderId ? String(state.highestBidderId) : null;
  const records = [];
  let next = { ...state };

  const withReserve = (price, leaderMax) => (reserveMinor && leaderMax >= reserveMinor && price < reserveMinor ? reserveMinor : price);

  if (!leaderId) {
    const price = withReserve(amountMinor, max);
    records.push({ bidderId, amountMinor: price, maxMinor: max, kind: 'manual' });
    next = { ...next, currentMinor: price, highestBidderId: bidderId, leaderMaxMinor: max };
  } else if (leaderId === String(bidderId)) {
    // raising their own ceiling: the price they pay does not move
    next = { ...next, leaderMaxMinor: Math.max(state.leaderMaxMinor, max) };
    return { next, records, raisedOwnMax: true };
  } else if (max <= state.leaderMaxMinor) {
    // the leader keeps the lead; the newcomer is outbid at once
    records.push({ bidderId, amountMinor: Math.min(max, state.leaderMaxMinor), maxMinor: max, kind: 'manual' });
    const price = withReserve(Math.min(max + inc(max), state.leaderMaxMinor), state.leaderMaxMinor);
    records.push({ bidderId: leaderId, amountMinor: price, maxMinor: state.leaderMaxMinor, kind: 'auto' });
    next = { ...next, currentMinor: price };
    next.reserveMet = !reserveMinor || next.currentMinor >= reserveMinor;
    return { next, records, outbid: true };
  } else {
    // the newcomer takes the lead; the old leader's ceiling is used up to push the price
    if (state.leaderMaxMinor > state.currentMinor) records.push({ bidderId: leaderId, amountMinor: state.leaderMaxMinor, maxMinor: state.leaderMaxMinor, kind: 'auto' });
    const price = withReserve(Math.max(amountMinor, Math.min(max, state.leaderMaxMinor + inc(state.leaderMaxMinor))), max);
    records.push({ bidderId, amountMinor: price, maxMinor: max, kind: 'manual' });
    next = { ...next, currentMinor: price, highestBidderId: bidderId, leaderMaxMinor: max };
  }

  next.reserveMet = !reserveMinor || next.currentMinor >= reserveMinor;
  return { next, records };
};

/** Rebuild the standing after an admin voids bids: highest valid amount wins, earliest on a tie. */
export const recomputeState = (validBids, reserveMinor) => {
  if (!validBids.length) return { currentMinor: 0, highestBidId: null, highestBidderId: null, leaderMaxMinor: 0, bidCount: 0, bidderCount: 0, reserveMet: false };
  const top = validBids.reduce((a, b) => (b.amountMinor > a.amountMinor || (b.amountMinor === a.amountMinor && b.createdAt < a.createdAt) ? b : a));
  const leaderMax = Math.max(...validBids.filter((b) => String(b.bidderId) === String(top.bidderId)).map((b) => b.maxMinor ?? b.amountMinor));
  return {
    currentMinor: top.amountMinor,
    highestBidId: top._id,
    highestBidderId: top.bidderId,
    leaderMaxMinor: leaderMax,
    bidCount: validBids.length,
    bidderCount: new Set(validBids.map((b) => String(b.bidderId))).size,
    reserveMet: !reserveMinor || top.amountMinor >= reserveMinor,
  };
};

/** Anti-sniping: a bid inside the closing window pushes the end out; the end never moves earlier. */
export const extendedEnd = ({ endAt, now, rules, extensions }) => {
  const a = rules?.antiSniping;
  if (!a?.enabled) return null;
  if (extensions >= a.maxExtensions) return null;
  if (endAt.getTime() - now.getTime() > a.windowSec * 1000) return null;
  const candidate = new Date(now.getTime() + a.extendSec * 1000);
  return candidate > endAt ? candidate : null;
};
