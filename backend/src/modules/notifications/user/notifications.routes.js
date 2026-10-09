import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { GROUPS } from '../catalog.js';
import { listNotifications, unreadCount, markRead, getPrefs, setPrefs } from '../notification.service.js';

const router = Router();
router.use(requireUser);

router.get(
  '/',
  validate({ query: z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }) }),
  asyncHandler(async (req, res) => ok(res, await listNotifications(req.user.id, req.query)))
);

router.get('/unread-count', asyncHandler(async (req, res) => ok(res, { count: await unreadCount(req.user.id) })));

/** Mark some (ids) or all (omit ids) notifications as read. */
router.post(
  '/read',
  validate({ body: z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(100).optional() }) }),
  asyncHandler(async (req, res) => ok(res, { count: await markRead(req.user.id, req.body.ids) }))
);

router.get('/preferences', asyncHandler(async (req, res) => ok(res, { groups: await getPrefs(req.user.id) })));

router.patch(
  '/preferences',
  validate({ body: z.object({ groups: z.record(z.enum(GROUPS), z.object({ push: z.boolean().optional(), email: z.boolean().optional() })) }) }),
  asyncHandler(async (req, res) => ok(res, { groups: await setPrefs(req.user.id, req.body.groups) }))
);

export default router;
