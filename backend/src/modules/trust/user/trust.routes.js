import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser } from '../../../core/middleware/auth.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { REPORT_TARGETS, CASE_TYPES, VERIFICATION_TYPES } from '../trust.model.js';
import { createReport, myReports, createCase, myCases, getMyCase, userReply, userCloseCase, submitVerification, myVerification } from '../trust.service.js';
import { requestDeletion, cancelDeletion, deletionBlockers, exportMyData, DELETION_GRACE_DAYS } from '../account.service.js';

const router = Router();
// only these paths need a login (this router is mounted at the API root)
router.use(['/reports', '/cases', '/verification', '/account'], requireUser);

const id = z.string().regex(/^[a-f0-9]{24}$/);
const idParam = z.object({ id });

/* reports */
router.post(
  '/reports',
  limiter({ name: 'report', windowMs: 60 * 60 * 1000, max: 20, keyBy: (req) => req.user.id }), // stops report spam
  validate({ body: z.object({ targetType: z.enum(REPORT_TARGETS), targetId: id, reason: z.string().trim().min(2).max(80), details: z.string().trim().max(1000).optional() }) }),
  asyncHandler(async (req, res) => ok(res, await createReport(req.user.id, req.body), undefined, 201))
);
router.get('/reports', asyncHandler(async (req, res) => ok(res, await myReports(req.user.id))));

/* help desk */
router.get('/cases', asyncHandler(async (req, res) => ok(res, await myCases(req.user.id))));
router.post(
  '/cases',
  limiter({ name: 'case', windowMs: 60 * 60 * 1000, max: 10, keyBy: (req) => req.user.id }),
  validate({
    body: z.object({
      type: z.enum(CASE_TYPES),
      subject: z.string().trim().min(5).max(140),
      message: z.string().trim().min(10).max(4000),
      related: z.object({ listingId: id.optional(), auctionId: id.optional(), dealId: id.optional(), paymentId: id.optional(), userId: id.optional() }).optional(),
      amountLost: z.number().min(0).max(1e12).optional(),
      mediaIds: z.array(id).max(10).optional(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await createCase(req.user.id, req.body), undefined, 201))
);
router.get('/cases/:id', validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await getMyCase(req.user.id, req.params.id))));
router.post('/cases/:id/reply', validate({ params: idParam, body: z.object({ text: z.string().trim().min(1).max(4000) }) }), asyncHandler(async (req, res) => ok(res, await userReply(req.user.id, req.params.id, req.body.text))));
router.post('/cases/:id/close', validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await userCloseCase(req.user.id, req.params.id))));

/* verification badges */
router.get('/verification', asyncHandler(async (req, res) => ok(res, await myVerification(req.user.id))));
router.post(
  '/verification',
  validate({
    body: z
      .object({ type: z.enum(VERIFICATION_TYPES), docType: z.string().trim().min(2).max(60), docNumber: z.string().trim().max(30).optional(), businessName: z.string().trim().max(120).optional(), mediaIds: z.array(id).min(1).max(5) })
      .refine((b) => b.type !== 'business' || (b.businessName && b.businessName.length >= 2), { message: 'Enter the business name', path: ['businessName'] }),
  }),
  asyncHandler(async (req, res) => ok(res, await submitVerification(req.user.id, req.body), undefined, 201))
);

/* privacy: my data, delete my account */
router.get('/account/export', asyncHandler(async (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  ok(res, await exportMyData(req.user.id));
}));
router.get('/account/deletion', asyncHandler(async (req, res) => ok(res, { graceDays: DELETION_GRACE_DAYS, blockers: await deletionBlockers(req.user.id), pending: req.user.status === 'pending_deletion' })));
router.post('/account/deletion', asyncHandler(async (req, res) => ok(res, await requestDeletion(req.user.id))));
router.delete('/account/deletion', asyncHandler(async (req, res) => {
  await cancelDeletion(req.user.id);
  ok(res, { cancelled: true });
}));

export default router;
