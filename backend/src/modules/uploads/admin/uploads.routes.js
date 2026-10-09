import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../../core/middleware/auth.js';
import { validate } from '../../../core/middleware/common.js';
import { asyncHandler, created } from '../../../core/utils/http.js';
import { singleFile, savePublicImage } from '../uploads.service.js';

const router = Router();

router.post(
  '/image',
  requirePermission('settings.edit', 'cms.edit', 'categories.edit', 'ads.edit', 'auctions.decide'),
  singleFile,
  validate({ body: z.object({ purpose: z.enum(['banner', 'branding', 'category', 'cms', 'listing']) }) }), // listing: photos for Admin-Managed auctions
  asyncHandler(async (req, res) =>
    created(res, await savePublicImage({ file: req.file, ownerType: 'admin', ownerId: req.admin.id, purpose: req.body.purpose }))
  )
);

export default router;
