import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { eventKeys } from '../catalog.js';
import { listTemplates, saveTemplate } from '../notification.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();

router.get('/templates', requirePermission('notifications.view'), asyncHandler(async (req, res) => ok(res, await listTemplates())));

router.put(
  '/templates/:event',
  requirePermission('notifications.edit'),
  validate({
    params: z.object({ event: z.enum(eventKeys) }),
    body: z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(400), enabled: z.boolean() }),
  }),
  asyncHandler(async (req, res) => {
    const { before, after } = await saveTemplate(req.params.event, req.body, req.admin.id);
    await auditAdmin(req, { action: 'notification.template', entityType: 'NotificationTemplate', entityId: req.params.event, before, after });
    ok(res, { saved: true });
  })
);

export default router;
