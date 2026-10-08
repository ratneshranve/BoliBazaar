import { Router } from 'express';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { User } from '../../users/user.model.js';
import { Listing } from '../../listings/listing.model.js';

const router = Router();

/** KPI summary. New KPIs are added here as later phases introduce listings, auctions, payments. */
router.get(
  '/summary',
  requirePermission('dashboard.view'),
  asyncHandler(async (req, res) => {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since1 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, activeUsers30d, newUsers24h, suspended, liveListings, pendingListings, totalListings] = await Promise.all([
      User.countDocuments({ status: { $ne: 'deleted' } }),
      User.countDocuments({ lastActiveAt: { $gte: since30 } }),
      User.countDocuments({ createdAt: { $gte: since1 } }),
      User.countDocuments({ status: { $in: ['suspended', 'banned'] } }),
      Listing.countDocuments({ status: 'published', expiresAt: { $gt: new Date() } }),
      Listing.countDocuments({ status: 'pending_review' }),
      Listing.countDocuments({ status: { $ne: 'deleted' } }),
    ]);

    const signups = await User.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    ok(res, {
      kpis: { totalUsers, activeUsers30d, newUsers24h, suspended, liveListings, pendingListings, totalListings },
      charts: { signups: signups.map((s) => ({ date: s._id, count: s.count })) },
    });
  })
);

export default router;
