import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { integrations } from '../../../core/config/env.js';
import { settingKeys } from '../settings.schemas.js';
import { getSetting, updateSetting } from '../settings.service.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { LANGUAGE_CATALOGUE } from '../../i18n/catalogue.js';

const router = Router();

/** Which integrations have credentials in backend .env (values never exposed). */
router.get('/integrations', requirePermission('settings.view'), (req, res) =>
  ok(res, {
    sms: { provider: integrations.sms.provider, configured: true },
    firebase: integrations.firebase,
    cloudinary: integrations.cloudinary,
    translate: integrations.translate,
    maps: integrations.maps,
    razorpay: integrations.razorpay,
    email: integrations.email,
    storageProviders: [
      { id: 'cloudinary', available: integrations.cloudinary.configured },
      { id: 'local', available: true },
    ],
  })
);

/** Languages an admin can switch on */
router.get('/language-catalogue', requirePermission('settings.view'), (req, res) => ok(res, LANGUAGE_CATALOGUE));

router.get(
  '/:key',
  requirePermission('settings.view'),
  validate({ params: z.object({ key: z.enum(settingKeys) }) }),
  asyncHandler(async (req, res) => ok(res, await getSetting(req.params.key)))
);

router.put(
  '/:key',
  requirePermission('settings.edit'),
  validate({ params: z.object({ key: z.enum(settingKeys) }), body: z.object({ value: z.unknown(), reason: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const { before, after, version } = await updateSetting(req.params.key, req.body.value, req.admin.id);
    await auditAdmin(req, { action: 'settings.update', entityType: 'Setting', entityId: req.params.key, before, after, reason: req.body.reason });
    ok(res, { value: after, version });
  })
);

export default router;
