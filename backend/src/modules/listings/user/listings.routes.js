import { Router } from 'express';
import { searchAds } from '../../ads/ad.service.js';
import { Category } from '../../categories/category.model.js';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { idempotent } from '../../../core/middleware/idempotency.js';
import { requireUser, optionalUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, created } from '../../../core/utils/http.js';
import { listingInput, searchQuery } from '../listing.schema.js';
import {
  createListing, updateListing, pauseListing, resumeListing, markSold, renewListing, deleteListing,
  searchListings, listingDetail, listingForEdit, myListings, recordView, addFavourite, removeFavourite, myFavourites,
} from '../listing.service.js';

const router = Router();
const id = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
const paging = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(30).default(20) });

/* ───── browse & search (public) ───── */

router.get('/', optionalUser, validate({ query: searchQuery }), asyncHandler(async (req, res) => {
  const result = await searchListings(req.query, { viewerId: req.user?.id, lang: req.ctx.lang });
  if (req.query.page !== 1) return ok(res, result);
  // SOP 15.5: Sponsored Listings and Category Sponsorship, clearly labelled
  const cat = req.query.categoryId ? await Category.findById(req.query.categoryId).select('ancestors').lean() : null;
  const ads = await searchAds({ categoryPath: cat ? [...cat.ancestors, cat._id] : [], lang: req.ctx.lang, viewerPoint: req.query.lat !== undefined ? { lat: req.query.lat, lng: req.query.lng } : null });
  ok(res, { ...result, ...ads });
}));

/* ───── my account (must come before /:id) ───── */

router.get(
  '/mine',
  requireUser,
  validate({ query: paging.extend({ status: z.enum(['active', 'payment_pending', 'pending_review', 'rejected', 'expired', 'sold', 'paused']).optional() }) }),
  asyncHandler(async (req, res) => ok(res, await myListings(req.user.id, { ...req.query, lang: req.ctx.lang })))
);

router.get('/favourites', requireUser, validate({ query: paging }), asyncHandler(async (req, res) => ok(res, await myFavourites(req.user.id, { ...req.query, lang: req.ctx.lang }))));

/* ───── post / edit ───── */

router.post(
  '/',
  requireUser,
  requireActiveUser,
  limiter({ name: 'listing-create', windowMs: 24 * 60 * 60_000, max: 30, keyBy: (req) => req.user.id }),
  idempotent,
  validate({ body: listingInput }),
  asyncHandler(async (req, res) => {
    const doc = await createListing(req.user.id, req.body);
    created(res, { id: String(doc._id), listingNo: doc.listingNo, status: doc.status });
  })
);

router.get('/:id/edit', requireUser, validate({ params: id }), asyncHandler(async (req, res) => ok(res, await listingForEdit(req.user.id, req.params.id))));

router.put(
  '/:id',
  requireUser,
  requireActiveUser,
  idempotent,
  validate({ params: id, body: listingInput }),
  asyncHandler(async (req, res) => {
    const doc = await updateListing(req.user.id, req.params.id, req.body);
    ok(res, { id: String(doc._id), status: doc.status });
  })
);

const action = (path, fn) =>
  router.post(
    `/:id/${path}`,
    requireUser,
    requireActiveUser,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      const doc = await fn(req.user.id, req.params.id);
      ok(res, { id: String(doc._id), status: doc.status });
    })
  );
action('pause', pauseListing);
action('resume', resumeListing);
action('sold', markSold);
action('renew', renewListing);

router.delete(
  '/:id',
  requireUser,
  validate({ params: id }),
  asyncHandler(async (req, res) => {
    await deleteListing(req.user.id, req.params.id);
    ok(res, { deleted: true });
  })
);

/* ───── favourites ───── */

router.post('/:id/favourite', requireUser, validate({ params: id }), asyncHandler(async (req, res) => {
  await addFavourite(req.user.id, req.params.id);
  ok(res, { favourite: true });
}));
router.delete('/:id/favourite', requireUser, validate({ params: id }), asyncHandler(async (req, res) => {
  await removeFavourite(req.user.id, req.params.id);
  ok(res, { favourite: false });
}));

/* ───── detail (public) ───── */

router.get(
  '/:id',
  optionalUser,
  validate({
    params: id,
    query: z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const viewerPoint = req.query.lat !== undefined && req.query.lng !== undefined ? { lat: req.query.lat, lng: req.query.lng } : undefined;
    ok(res, await listingDetail(req.params.id, { viewerId: req.user?.id, lang: req.ctx.lang, viewerPoint }));
  })
);

router.post(
  '/:id/view',
  optionalUser,
  limiter({ name: 'listing-view', windowMs: 60_000, max: 60 }),
  validate({ params: id }),
  asyncHandler(async (req, res) => {
    await recordView(req.params.id, req.user?.id || req.ctx.deviceId || req.ip, req.user?.id);
    ok(res, { recorded: true });
  })
);

export default router;
