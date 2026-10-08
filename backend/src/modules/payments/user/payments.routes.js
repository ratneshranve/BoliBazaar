import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { integrations } from '../../../core/config/env.js';
import { getSettingValue } from '../../settings/settings.service.js';
import { Listing } from '../../listings/listing.model.js';
import { PURPOSES } from '../payment.model.js';
import { quote, listingQuota, activePlan, factorOf, commissionRuleFor, commissionText } from '../pricing.service.js';
import { createOrder, verifyCheckout, markFailed, myPayments, getPayment, myCommissions, invoiceHtml } from '../payment.service.js';
import { ApiError } from '../../../core/utils/ApiError.js';

const router = Router();
router.use(requireUser);

const id = z.string().regex(/^[a-f0-9]{24}$/);
const orderInput = z.object({
  purpose: z.enum(PURPOSES),
  refId: id.optional(),
  productCode: z.string().max(40).optional(),
});

/** What can be bought: promotion packages, plans, tax, and whether online payment is available. */
router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const [m, { currency }, plan] = await Promise.all([getSettingValue('monetization'), getSettingValue('marketplace'), activePlan(req.user.id)]);
    ok(res, {
      currency,
      factor: factorOf(currency),
      taxPercent: m.taxPercent,
      taxLabel: m.taxLabel,
      promotions: m.promotions,
      plans: m.plans,
      freePlan: { name: m.freePlanName, freeAdsPer30Days: m.listingFee.freeAdsPer30Days, listingFeeOn: m.listingFee.enabled },
      myPlan: plan ? { code: plan.planCode, name: plan.planName, endAt: plan.endAt, extraFreeAds: plan.extraFreeAds, credits: plan.credits || {} } : null,
      auctionCommission: commissionText(await commissionRuleFor([]), currency),
      paymentsAvailable: integrations.razorpay.configured,
    });
  })
);

/** Free ads left in a category (the Sell screen warns before the limit). */
router.get(
  '/quota',
  validate({ query: z.object({ categoryId: id.optional() }) }),
  asyncHandler(async (req, res) => {
    let path = [];
    if (req.query.categoryId) {
      const { Category } = await import('../../categories/category.model.js');
      const c = await Category.findById(req.query.categoryId).select('ancestors').lean();
      if (!c) throw ApiError.notFound('CATEGORY_NOT_FOUND');
      path = [...c.ancestors, c._id];
    }
    const q = await listingQuota(req.user.id, path);
    const { currency } = await getSettingValue('marketplace');
    ok(res, { ...q, currency, factor: factorOf(currency), feeMinor: Math.round(q.fee * factorOf(currency)), pendingPayment: await Listing.countDocuments({ ownerId: req.user.id, status: 'payment_pending' }) });
  })
);

router.post('/quote', validate({ body: orderInput }), asyncHandler(async (req, res) => ok(res, await quote({ userId: req.user.id, ...req.body }))));
router.post('/orders', requireActiveUser, validate({ body: orderInput }), asyncHandler(async (req, res) => ok(res, await createOrder(req.user.id, req.body), undefined, 201)));
router.post(
  '/verify',
  validate({ body: z.object({ orderId: z.string().min(5).max(60), paymentId: z.string().min(5).max(60), signature: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => ok(res, await verifyCheckout(req.user.id, req.body)))
);
router.post(
  '/failed',
  validate({ body: z.object({ orderId: z.string().min(5).max(60), reason: z.string().max(200).optional() }) }),
  asyncHandler(async (req, res) => {
    await markFailed(req.user.id, req.body.orderId, req.body.reason);
    ok(res, { saved: true });
  })
);

router.get('/', validate({ query: z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }) }), asyncHandler(async (req, res) => ok(res, await myPayments(req.user.id, req.query))));
router.get('/commissions', asyncHandler(async (req, res) => ok(res, await myCommissions(req.user.id))));
router.get('/:id', validate({ params: z.object({ id }) }), asyncHandler(async (req, res) => ok(res, await getPayment(req.user.id, req.params.id))));
router.get(
  '/:id/invoice',
  validate({ params: z.object({ id }) }),
  asyncHandler(async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    res.send(await invoiceHtml(req.user.id, req.params.id));
  })
);

export default router;
