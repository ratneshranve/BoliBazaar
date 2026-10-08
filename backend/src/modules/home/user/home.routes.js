import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { optionalUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { liveBanners } from '../../banners/banner.service.js';
import { topCategories } from '../../categories/category.service.js';
import { homeListings } from '../../listings/listing.service.js';
import { searchQuery } from '../../listings/listing.schema.js';
import { browseAuctions } from '../../auctions/auction.service.js';
import { homeAds } from '../../ads/ad.service.js';

const router = Router();

/**
 * Home feed: banners, top-level categories and ad rails ("nearby" when the app sends the user's place
 * and distance, "latest", paid "featured" ads, and live auctions).
 */
router.get(
  '/',
  optionalUser,
  validate({ query: searchQuery.pick({ lat: true, lng: true, scope: true, radiusKm: true, district: true, state: true, countryCode: true }) }),
  asyncHandler(async (req, res) => {
    const lang = req.ctx.lang;
    const radius = req.query.scope === 'radius' && req.query.radiusKm ? { lat: req.query.lat, lng: req.query.lng, radiusKm: req.query.radiusKm } : {};
    const [banners, categories, listings, auctions, ads] = await Promise.all([
      liveBanners(lang),
      topCategories(lang),
      homeListings(req.query, { viewerId: req.user?.id, lang }),
      browseAuctions({ status: 'live', page: 1, limit: 10, ...radius }, { lang }),
      homeAds(),
    ]);
    ok(res, { banners, ...ads, categories, featured: listings.featured, auctions: auctions.items, nearby: listings.nearby, latest: listings.latest });
  })
);

export default router;
