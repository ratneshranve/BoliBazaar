import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { LEAD_TYPES } from '../lead.model.js';
import { createLead, listReceived, listSent, setStatus, withdraw, unseenCount } from '../lead.service.js';

const router = Router();
router.use(requireUser);

const id = z.string().regex(/^[a-f0-9]{24}$/);
const paging = { page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) };

/** Apply for a job ad / send an enquiry to a service ad (the ad decides which). */
router.post(
  '/',
  requireActiveUser,
  validate({ body: z.object({ listingId: id, message: z.string().trim().min(5).max(1000) }) }),
  asyncHandler(async (req, res) => ok(res, await createLead(req.user.id, req.body.listingId, req.body.message)))
);

router.get('/sent', validate({ query: z.object(paging) }), asyncHandler(async (req, res) => ok(res, await listSent(req.user.id, req.query))));

router.get(
  '/received',
  validate({ query: z.object({ ...paging, listingId: id.optional(), type: z.enum(LEAD_TYPES).optional() }) }),
  asyncHandler(async (req, res) => ok(res, await listReceived(req.user.id, req.query)))
);

router.get('/received/unseen-count', asyncHandler(async (req, res) => ok(res, { count: await unseenCount(req.user.id) })));

router.patch(
  '/:id/status',
  validate({ params: z.object({ id }), body: z.object({ status: z.enum(['seen', 'shortlisted', 'declined']) }) }),
  asyncHandler(async (req, res) => ok(res, await setStatus(req.user.id, req.params.id, req.body.status)))
);

router.delete('/:id', validate({ params: z.object({ id }) }), asyncHandler(async (req, res) => {
  await withdraw(req.user.id, req.params.id);
  ok(res, { withdrawn: true });
}));

export default router;
