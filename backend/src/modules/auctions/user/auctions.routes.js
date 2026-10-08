import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser, optionalUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { getSettingValue } from '../../settings/settings.service.js';
import { minorFactor } from '../../listings/listing.service.js';
import { auctionInput, bidInput } from '../auction.schema.js';
import { createAuction, updateAuction, cancelBySeller, addNote, auctionDetail, bidHistory, browseAuctions, myAuctions } from '../auction.service.js';
import { placeBid, buyNow } from '../bidding.service.js';
import { confirmDeal, cancelDeal, completeDeal, disputeDeal, offerToBidder, getDeal, myDeals } from '../deal.service.js';
import { Auction } from '../auction.model.js';

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);
const idParam = z.object({ id });
const num = z.coerce.number();

router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['live', 'scheduled', 'ended']).default('live'),
      categoryId: id.optional(),
      q: z.string().trim().max(100).optional(),
      lat: num.min(-90).max(90).optional(),
      lng: num.min(-180).max(180).optional(),
      radiusKm: num.min(1).max(1000).optional(),
      page: z.coerce.number().int().min(1).max(500).default(1),
      limit: z.coerce.number().int().min(1).max(30).default(20),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await browseAuctions(req.query, { lang: req.ctx.lang })))
);

router.get('/mine', requireUser, validate({ query: z.object({ role: z.enum(['selling', 'bidding']).default('bidding') }) }), asyncHandler(async (req, res) => ok(res, await myAuctions(req.user.id, { role: req.query.role }))));

/* deals (after an auction is won) */
router.get('/deals', requireUser, validate({ query: z.object({ role: z.enum(['buying', 'selling', 'all']).default('all') }) }), asyncHandler(async (req, res) => ok(res, await myDeals(req.user.id, req.query))));
router.get('/deals/:id', requireUser, validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await getDeal(req.user.id, req.params.id))));
const dealAction = (fn, body) =>
  [requireUser, validate({ params: idParam, ...(body ? { body } : {}) }), asyncHandler(async (req, res) => {
    const deal = await fn(req.user.id, req.params.id, req.body?.reason);
    ok(res, await getDeal(req.user.id, deal._id));
  })];
router.post('/deals/:id/confirm', ...dealAction(confirmDeal));
router.post('/deals/:id/complete', ...dealAction(completeDeal));
router.post('/deals/:id/cancel', ...dealAction(cancelDeal, z.object({ reason: z.string().trim().min(3).max(500) })));
router.post('/deals/:id/dispute', ...dealAction(disputeDeal, z.object({ reason: z.string().trim().min(10).max(1000) })));

/* create / manage (seller) */
router.post('/', requireUser, requireActiveUser, validate({ body: auctionInput }), asyncHandler(async (req, res) => ok(res, await createAuction(req.user.id, req.body), undefined, 201)));
router.put('/:id', requireUser, requireActiveUser, validate({ params: idParam, body: auctionInput }), asyncHandler(async (req, res) => ok(res, await updateAuction(req.user.id, req.params.id, req.body))));
router.delete('/:id', requireUser, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await cancelBySeller(req.user.id, req.params.id);
  ok(res, { cancelled: true });
}));
router.post('/:id/notes', requireUser, validate({ params: idParam, body: z.object({ text: z.string().trim().min(3).max(500) }) }), asyncHandler(async (req, res) => {
  await addNote(req.user.id, req.params.id, req.body.text);
  ok(res, { saved: true });
}));
router.post('/:id/offer', requireUser, requireActiveUser, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const deal = await offerToBidder(req.user.id, req.params.id);
  ok(res, await getDeal(req.user.id, deal._id));
}));

/* view & bid */
router.get('/:id', optionalUser, validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await auctionDetail(req.params.id, req.user?.id))));
router.get('/:id/bids', optionalUser, validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await bidHistory(req.params.id, req.user?.id))));

router.post(
  '/:id/bids',
  requireUser,
  requireActiveUser,
  validate({ params: idParam, body: bidInput }),
  asyncHandler(async (req, res) => {
    const a = await Auction.findById(req.params.id).select('currency').lean();
    const f = minorFactor(a?.currency || (await getSettingValue('marketplace')).currency);
    ok(res, await placeBid(req.user.id, req.params.id, { amountMinor: req.body.amount * f, maxMinor: req.body.maxAmount != null ? req.body.maxAmount * f : undefined, confirmHigh: req.body.confirmHigh }));
  })
);

router.post('/:id/buy-now', requireUser, requireActiveUser, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const deal = await buyNow(req.user.id, req.params.id);
  ok(res, await getDeal(req.user.id, deal._id));
}));

export default router;
