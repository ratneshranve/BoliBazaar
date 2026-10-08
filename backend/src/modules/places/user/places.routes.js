import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { autocomplete, placeDetails, reverseGeocode } from '../places.service.js';

const router = Router();
const token = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional();

/** Suggestions while typing (village, town, PIN, landmark…). Send the same sessionToken until a place is chosen. */
router.get(
  '/autocomplete',
  limiter({ name: 'places-ac', windowMs: 60_000, max: 90 }),
  validate({ query: z.object({ q: z.string().trim().min(2).max(100), sessionToken: token }) }),
  asyncHandler(async (req, res) => ok(res, await autocomplete(req.query.q, { sessionToken: req.query.sessionToken, lang: req.ctx.lang })))
);

/** Coordinates and address for a chosen suggestion. */
router.get(
  '/details/:placeId',
  limiter({ name: 'places-detail', windowMs: 60_000, max: 40 }),
  validate({ params: z.object({ placeId: z.string().min(5).max(300) }), query: z.object({ sessionToken: token }) }),
  asyncHandler(async (req, res) => ok(res, await placeDetails(req.params.placeId, { sessionToken: req.query.sessionToken, lang: req.ctx.lang })))
);

/** GPS fix or dragged map pin → readable place. */
router.get(
  '/reverse',
  limiter({ name: 'places-reverse', windowMs: 60_000, max: 30 }),
  validate({ query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }) }),
  asyncHandler(async (req, res) => ok(res, await reverseGeocode(req.query.lat, req.query.lng, { lang: req.ctx.lang })))
);

export default router;
