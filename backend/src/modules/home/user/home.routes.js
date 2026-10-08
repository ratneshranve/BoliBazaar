import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { optionalUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { liveBanners } from '../../banners/banner.service.js';
import { topCategories } from '../../categories/category.service.js';
import { homeListings } from '../../listings/listing.service.js';
import { searchQuery } from '../../listings/listing.schema.js';

const router = Router();

/**
 * Home feed: banners, top-level categories and ad rails ("nearby" when the app sends the user's place
 * and distance, and "latest"). Phase 5 adds auction rails.
 */
router.get(
  '/',
  optionalUser,
  validate({ query: searchQuery.pick({ lat: true, lng: true, scope: true, radiusKm: true, district: true, state: true, countryCode: true }) }),
  asyncHandler(async (req, res) => {
    const lang = req.ctx.lang;
    const [banners, categories, listings] = await Promise.all([
      liveBanners(lang),
      topCategories(lang),
      homeListings(req.query, { viewerId: req.user?.id, lang }),
    ]);
    ok(res, { banners, categories, nearby: listings.nearby, latest: listings.latest });
  })
);

export default router;
