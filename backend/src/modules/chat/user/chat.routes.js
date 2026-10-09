import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { privateFilePath } from '../../../core/services/storage.js';
import {
  startConversation, sendMessage, listConversations, conversationDetail, listMessages,
  markConversationRead, unreadMessageCount, blockUser, unblockUser, listBlocked,
  makeOffer, respondToOffer, chatFile,
} from '../chat.service.js';

const router = Router();
router.use(requireUser);

const id = z.string().regex(/^[a-f0-9]{24}$/);
const idParam = z.object({ id });
const amount = z.number().positive().max(1_000_000_000_000); // major units, e.g. 42000 rupees

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

/** Text, and/or up to N uploaded photos/files (mediaIds from /uploads). */
router.post(
  '/:id/messages',
  requireActiveUser,
  limiter({ name: 'chat-send', windowMs: 60_000, max: 60, keyBy: (req) => req.user.id }),
  validate({
    params: idParam,
    body: z
      .object({ text: z.string().trim().max(1000).default(''), mediaIds: z.array(id).max(10).default([]) })
      .refine((b) => b.text.length > 0 || b.mediaIds.length > 0, { message: 'Write a message or attach a file', path: ['text'] }),
  }),
  asyncHandler(async (req, res) => ok(res, await sendMessage(req.user.id, req.params.id, req.body)))
);

/** Download a private file sent in this chat (only the two people in it). */
router.get(
  '/:id/files/:mediaId',
  validate({ params: z.object({ id, mediaId: id }) }),
  asyncHandler(async (req, res) => {
    const { media, name } = await chatFile(req.user.id, req.params.id, req.params.mediaId);
    res.setHeader('Content-Type', media.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(privateFilePath(media.key));
  })
);

/** Buyer makes a price offer. */
router.post(
  '/:id/offers',
  requireActiveUser,
  limiter({ name: 'chat-offer', windowMs: 60 * 60_000, max: 30, keyBy: (req) => req.user.id }),
  validate({ params: idParam, body: z.object({ amount }) }),
  asyncHandler(async (req, res) => ok(res, await makeOffer(req.user.id, req.params.id, req.body.amount)))
);

/** accept / decline / counter (receiver) or withdraw (maker). */
router.post(
  '/:id/offers/:messageId',
  requireActiveUser,
  validate({
    params: z.object({ id, messageId: id }),
    body: z
      .object({ action: z.enum(['accept', 'decline', 'counter', 'withdraw']), amount: amount.optional() })
      .refine((b) => b.action !== 'counter' || b.amount, { message: 'Enter the counter-offer amount', path: ['amount'] }),
  }),
  asyncHandler(async (req, res) => ok(res, await respondToOffer(req.user.id, req.params.id, req.params.messageId, req.body)))
);

router.post('/:id/read', validate({ params: idParam }), asyncHandler(async (req, res) => {
  await markConversationRead(req.user.id, req.params.id);
  ok(res, { read: true });
}));

export default router;
