import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { listChildren, searchLocations, reverseGeocode, getLocation, locationDto } from '../location.service.js';

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);

/** Search any place by name (or PIN code). */
router.get(
  '/search',
  limiter({ name: 'loc-search', windowMs: 60_000, max: 60 }),
  validate({ query: z.object({ q: z.string().trim().min(2).max(100), countryCode: z.string().length(2).toUpperCase().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await searchLocations(req.query.q, { countryCode: req.query.countryCode })))
);

/** Browse: countries when no parentId, otherwise the places inside it. */
router.get(
  '/children',
  validate({ query: z.object({ parentId: id.optional() }) }),
  asyncHandler(async (req, res) => ok(res, await listChildren(req.query.parentId)))
);

/** "Use my current location": nearest known place to GPS coordinates. */
router.get(
  '/reverse',
  limiter({ name: 'loc-reverse', windowMs: 60_000, max: 20 }),
  validate({ query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }) }),
  asyncHandler(async (req, res) => ok(res, await reverseGeocode(req.query.lat, req.query.lng)))
);

router.get(
  '/:id',
  validate({ params: z.object({ id }) }),
  asyncHandler(async (req, res) => ok(res, locationDto(await getLocation(req.params.id))))
);

export default router;
