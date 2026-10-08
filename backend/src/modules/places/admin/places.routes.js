import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { autocomplete, placeDetails } from '../places.service.js';

const router = Router();

/** Used by Admin › Settings › Location to pick "popular places" from the real map. */
router.get(
  '/autocomplete',
  requirePermission('settings.edit'),
  validate({ query: z.object({ q: z.string().trim().min(2).max(100) }) }),
  asyncHandler(async (req, res) => ok(res, await autocomplete(req.query.q)))
);

router.get(
  '/details/:placeId',
  requirePermission('settings.edit'),
  validate({ params: z.object({ placeId: z.string().min(5).max(300) }) }),
  asyncHandler(async (req, res) => ok(res, await placeDetails(req.params.placeId)))
);

export default router;
