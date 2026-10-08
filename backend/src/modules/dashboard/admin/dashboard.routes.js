import { Router } from 'express';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { User } from '../../users/user.model.js';
import { Listing } from '../../listings/listing.model.js';
import { Auction, Deal } from '../../auctions/auction.model.js';
import { Payment, Promotion, Subscription } from '../../payments/payment.model.js';
import { Ad } from '../../ads/ad.model.js';

const router = Router();

/** KPI summary. New KPIs are added here as later phases introduce listings, auctions, payments. */
router.get(
  '/summary',
  requirePermission('dashboard.view'),
  asyncHandler(async (req, res) => {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since1 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, activeUsers30d, newUsers24h, suspended, liveListings, pendingListings, totalListings, liveAuctions, pendingAuctions, openDisputes] = await Promise.all([
      User.countDocuments({ status: { $ne: 'deleted' } }),
      User.countDocuments({ lastActiveAt: { $gte: since30 } }),
      User.countDocuments({ createdAt: { $gte: since1 } }),
      User.countDocuments({ status: { $in: ['suspended', 'banned'] } }),
      Listing.countDocuments({ status: 'published', expiresAt: { $gt: new Date() } }),
      Listing.countDocuments({ status: 'pending_review' }),
      Listing.countDocuments({ status: { $ne: 'deleted' } }),
      Auction.countDocuments({ status: 'live' }),
      Auction.countDocuments({ status: 'pending_review' }),
      Deal.countDocuments({ status: 'disputed' }),
    ]);

    const [pay30, ads30, activePromotions, activePlans] = await Promise.all([
      Payment.aggregate([{ $match: { paidAt: { $gte: since30 }, status: { $in: ['paid', 'partially_refunded', 'refunded'] } } }, { $group: { _id: null, net: { $sum: { $subtract: ['$totalMinor', '$refundedMinor'] } }, currency: { $first: '$currency' } } }]),
      Ad.aggregate([{ $match: { paid: true, paidAt: { $gte: since30 } } }, { $group: { _id: null, net: { $sum: '$priceMinor' }, currency: { $first: '$currency' } } }]),
      Promotion.countDocuments({ endAt: { $gt: new Date() } }),
      Subscription.countDocuments({ startAt: { $lte: new Date() }, endAt: { $gt: new Date() } }),
    ]);
    const revenue30dMinor = (pay30[0]?.net || 0) + (ads30[0]?.net || 0);
    const revenueCurrency = pay30[0]?.currency || ads30[0]?.currency || null;

    const signups = await User.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    ok(res, {
      kpis: { totalUsers, activeUsers30d, newUsers24h, suspended, liveListings, pendingListings, totalListings, liveAuctions, pendingAuctions, openDisputes, revenue30dMinor, activePromotions, activePlans }, revenueCurrency,
      charts: { signups: signups.map((s) => ({ date: s._id, count: s.count })) },
    });
  })
);

export default router;
