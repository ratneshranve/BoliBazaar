import { Router } from 'express';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { liveBanners } from '../../banners/banner.service.js';
import { topCategories } from '../../categories/category.service.js';

const router = Router();

/**
 * Home feed. Phase 2: banners + top-level categories.
 * Phase 3 adds listing sections (nearby, latest, featured), Phase 5 adds auction sections.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [banners, categories] = await Promise.all([liveBanners(req.ctx.lang), topCategories(req.ctx.lang)]);
    ok(res, { banners, categories });
  })
);

export default router;
