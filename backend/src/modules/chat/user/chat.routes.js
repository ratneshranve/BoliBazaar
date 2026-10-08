import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import {
  startConversation, sendMessage, listConversations, conversationDetail, listMessages,
  markConversationRead, unreadMessageCount, blockUser, unblockUser, listBlocked,
} from '../chat.service.js';

const router = Router();
router.use(requireUser);

const id = z.string().regex(/^[a-f0-9]{24}$/);
const idParam = z.object({ id });

router.get('/', asyncHandler(async (req, res) => ok(res, await listConversations(req.user.id))));
router.get('/unread-count', asyncHandler(async (req, res) => ok(res, { count: await unreadMessageCount(req.user.id) })));

/** Start (or reopen) a chat about an ad. */
router.post(
  '/start',
  requireActiveUser,
  validate({ body: z.object({ listingId: id }) }),
  asyncHandler(async (req, res) => ok(res, { id: await startConversation(req.user.id, req.body.listingId) }))
);

router.get('/blocked', asyncHandler(async (req, res) => ok(res, await listBlocked(req.user.id))));
router.put('/blocked/:id', requireActiveUser, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await blockUser(req.user.id, req.params.id);
  ok(res, { blocked: true });
}));
router.delete('/blocked/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  await unblockUser(req.user.id, req.params.id);
  ok(res, { blocked: false });
}));

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await conversationDetail(req.user.id, req.params.id))));

router.get(
  '/:id/messages',
  validate({ params: idParam, query: z.object({ before: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }) }),
  asyncHandler(async (req, res) => ok(res, await listMessages(req.user.id, req.params.id, req.query)))
);

router.post(
  '/:id/messages',
  requireActiveUser,
  validate({ params: idParam, body: z.object({ text: z.string().trim().min(1).max(1000) }) }),
  asyncHandler(async (req, res) => ok(res, await sendMessage(req.user.id, req.params.id, req.body.text)))
);

router.post('/:id/read', validate({ params: idParam }), asyncHandler(async (req, res) => {
  await markConversationRead(req.user.id, req.params.id);
  ok(res, { read: true });
}));

export default router;
