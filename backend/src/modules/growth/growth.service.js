import { SavedSearch, Broadcast } from './growth.model.js';
import { searchListings, cardDtos } from '../listings/listing.service.js';
import { Listing } from '../listings/listing.model.js';
import { User } from '../users/user.model.js';
import { Payment } from '../payments/payment.model.js';
import { Bid } from '../auctions/auction.model.js';
import { Conversation } from '../chat/chat.model.js';
import { Category } from '../categories/category.model.js';
import { notify } from '../notifications/notification.service.js';
import { getSettingValue } from '../settings/settings.service.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { escapeRegex } from '../../core/utils/http.js';
import { logger } from '../../core/utils/logger.js';

const oid = (v) => String(v);
const DAY_MS = 24 * 60 * 60 * 1000;

/* ───────── saved searches ───────── */

const MAX_SAVED = 20;

export const saveSearch = async (userId, { name, query, alerts }) => {
  if ((await SavedSearch.countDocuments({ userId })) >= MAX_SAVED) throw ApiError.badRequest('LIMIT_REACHED', `You can save up to ${MAX_SAVED} searches`);
  const s = await SavedSearch.create({ userId, name, query, alerts });
  return savedDto(s);
};

const savedDto = (s) => ({ id: oid(s._id), name: s.name, query: s.query, alerts: s.alerts, createdAt: s.createdAt });

export const mySearches = async (userId) => (await SavedSearch.find({ userId }).sort({ createdAt: -1 }).lean()).map(savedDto);

export const updateSearch = async (userId, id, patch) => {
  const s = await SavedSearch.findOneAndUpdate({ _id: id, userId }, { $set: patch }, { new: true });
  if (!s) throw ApiError.notFound('SEARCH_NOT_FOUND');
  return savedDto(s);
};

export const deleteSearch = async (userId, id) => {
  const r = await SavedSearch.deleteOne({ _id: id, userId });
  if (!r.deletedCount) throw ApiError.notFound('SEARCH_NOT_FOUND');
};

/**
 * Tell people about new ads matching their saved searches (one alert per search per run).
 * Runs from the scheduler; each search remembers when it was last checked.
 */
export const runSearchAlerts = async ({ batch = 200 } = {}) => {
  const searches = await SavedSearch.find({ alerts: true, lastCheckedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }).sort({ lastCheckedAt: 1 }).limit(batch).lean();
  let sent = 0;
  for (const s of searches) {
    const checkedAt = new Date();
    try {
      const { items } = await searchListings({ ...s.query, sort: 'newest', page: 1, limit: 20 }, { viewerId: s.userId });
      const fresh = await Listing.find({ _id: { $in: items.map((i) => i.id) }, publishedAt: { $gt: s.lastCheckedAt }, ownerId: { $ne: s.userId } }).select('_id').lean();
      if (fresh.length) {
        await notify(s.userId, 'search.match', { name: s.name, count: fresh.length }, { route: `/saved-searches/${s._id}` });
        sent += 1;
      }
    } catch (err) {
      logger.warn('Saved search check failed', { id: oid(s._id), err: err.message });
    }
    await SavedSearch.updateOne({ _id: s._id }, { $set: { lastCheckedAt: checkedAt } });
  }
  return sent;
};

/* ───────── public seller profile ───────── */

export const sellerProfile = async (publicId, { lang, page = 1, limit = 20 }) => {
  const u = await User.findOne({ publicId, status: { $nin: ['banned', 'deleted', 'pending_deletion'] } }).select('publicId name avatar about createdAt phone.verifiedAt verification seller').lean();
  if (!u) throw ApiError.notFound('USER_NOT_FOUND', 'This profile is not available');
  const now = new Date();
  const live = { ownerId: u._id, status: 'published', expiresAt: { $gt: now } };
  const [docs, activeCount, soldCount] = await Promise.all([
    Listing.find(live).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean(),
    Listing.countDocuments(live),
    Listing.countDocuments({ ownerId: u._id, status: 'sold' }),
  ]);
  return {
    profile: {
      publicId: u.publicId,
      name: u.name || null,
      avatar: u.avatar?.url || null,
      about: u.about || null,
      memberSince: u.createdAt,
      badges: { phone: Boolean(u.phone?.verifiedAt), id: Boolean(u.verification?.idVerifiedAt), business: Boolean(u.verification?.businessVerifiedAt) },
      businessName: u.verification?.businessVerifiedAt ? u.verification.businessName || null : null,
      activeCount,
      soldCount,
    },
    items: await cardDtos(docs.slice(0, limit), { lang }),
    page,
    hasMore: docs.length > limit,
  };
};

/* ───────── broadcasts ───────── */

const segmentFilter = async ({ segment, state }) => {
  const base = { status: { $in: ['active', 'limited'] } };
  if (segment === 'sellers') return { ...base, _id: { $in: await Listing.distinct('ownerId', { status: 'published' }) } };
  if (segment === 'state') return { ...base, 'homeLocation.address.state': new RegExp(`^${escapeRegex(state)}$`, 'i') };
  if (segment === 'inactive') return { ...base, $or: [{ lastActiveAt: { $lt: new Date(Date.now() - 30 * DAY_MS) } }, { lastActiveAt: null }] };
  return base;
};

export const audienceSize = async (seg) => User.countDocuments(await segmentFilter(seg));

/** Saves the broadcast and sends it in the background (in batches, so a big audience does not block the server). */
export const startBroadcast = async (adminId, input) => {
  if (input.segment === 'state' && !input.state) throw ApiError.badRequest('VALIDATION_FAILED', 'Choose the state', { fields: { state: 'Required' } });
  const filter = await segmentFilter(input);
  const b = await Broadcast.create({ ...input, createdBy: adminId, audience: await User.countDocuments(filter) });
  (async () => {
    let sent = 0;
    try {
      for await (const u of User.find(filter).select('_id').lean().cursor()) {
        await notify(u._id, 'broadcast', { title: input.title, body: input.body }, { route: input.route || undefined });
        sent += 1;
        if (sent % 200 === 0) await Broadcast.updateOne({ _id: b._id }, { $set: { sentCount: sent } });
      }
      await Broadcast.updateOne({ _id: b._id }, { $set: { status: 'sent', sentCount: sent, finishedAt: new Date() } });
    } catch (err) {
      logger.error('Broadcast failed', { id: oid(b._id), err: err.message });
      await Broadcast.updateOne({ _id: b._id }, { $set: { status: 'failed', sentCount: sent, finishedAt: new Date() } });
    }
  })();
  return b;
};

/* ───────── analytics ───────── */

const daily = (model, match, dateField = 'createdAt', sumField) =>
  model.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } }, n: sumField ? { $sum: `$${sumField}` } : { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

/** Day-by-day activity and a few totals for the admin Analytics page. */
export const analytics = async (days) => {
  const since = new Date(Date.now() - days * DAY_MS);
  const [signups, listings, bids, chats, revenue, topCats, totals] = await Promise.all([
    daily(User, { createdAt: { $gte: since } }),
    daily(Listing, { createdAt: { $gte: since }, status: { $ne: 'deleted' } }),
    daily(Bid, { createdAt: { $gte: since }, status: 'valid' }),
    daily(Conversation, { createdAt: { $gte: since } }),
    daily(Payment, { paidAt: { $gte: since }, status: { $in: ['paid', 'partially_refunded', 'refunded'] } }, 'paidAt', 'totalMinor'),
    Listing.aggregate([{ $match: { createdAt: { $gte: since }, status: { $ne: 'deleted' } } }, { $group: { _id: '$categoryId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    Promise.all([User.countDocuments({ createdAt: { $gte: since } }), Listing.countDocuments({ createdAt: { $gte: since }, status: { $ne: 'deleted' } }), Bid.countDocuments({ createdAt: { $gte: since }, status: 'valid' }), Conversation.countDocuments({ createdAt: { $gte: since } }), Listing.countDocuments({ soldAt: { $gte: since } })]),
  ]);
  const names = new Map((await Category.find({ _id: { $in: topCats.map((c) => c._id) } }).select('name').lean()).map((c) => [oid(c._id), c.name]));
  // one row per day, including days with nothing
  const keys = [];
  for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + DAY_MS)) keys.push(d.toISOString().slice(0, 10));
  const pick = (rows) => new Map(rows.map((r) => [r._id, r.n]));
  const [s, l, b, c, r] = [signups, listings, bids, chats, revenue].map(pick);
  const { currency } = await getSettingValue('marketplace');
  return {
    days,
    currency,
    totals: { signups: totals[0], listings: totals[1], bids: totals[2], chats: totals[3], sold: totals[4], revenueMinor: revenue.reduce((a, x) => a + x.n, 0) },
    series: keys.map((k) => ({ date: k, signups: s.get(k) || 0, listings: l.get(k) || 0, bids: b.get(k) || 0, chats: c.get(k) || 0, revenueMinor: r.get(k) || 0 })),
    topCategories: topCats.map((x) => ({ id: oid(x._id), name: names.get(oid(x._id)) || '—', listings: x.n })),
  };
};

/* ───────── sitemap ───────── */

export const sitemapXml = async (webUrl) => {
  const now = new Date();
  const [ads, sellers] = await Promise.all([
    Listing.find({ status: 'published', expiresAt: { $gt: now } }).sort({ publishedAt: -1 }).limit(40000).select('_id updatedAt').lean(),
    User.find({ status: 'active' }).sort({ createdAt: -1 }).limit(5000).select('publicId updatedAt').lean(),
  ]);
  const url = (loc, lastmod) => `<url><loc>${webUrl}${loc}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[url('/'), url('/auctions'), ...ads.map((a) => url(`/listing/${a._id}`, a.updatedAt)), ...sellers.map((u) => url(`/u/${u.publicId}`, u.updatedAt))].join('')}</urlset>`;
};
