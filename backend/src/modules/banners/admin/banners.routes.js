import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, created } from '../../../core/utils/http.js';
import { Banner } from '../banner.model.js';
import { bannerInput, createBanner, updateBanner, deleteBanner, adminBannerDto } from '../banner.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });

router.get('/', requirePermission('cms.view'), asyncHandler(async (req, res) => ok(res, (await Banner.find().sort({ order: 1, createdAt: -1 }).lean()).map(adminBannerDto))));

router.post(
  '/',
  requirePermission('cms.edit'),
  validate({ body: bannerInput }),
  asyncHandler(async (req, res) => {
    const doc = await createBanner(req.body);
    await auditAdmin(req, { action: 'banner.create', entityType: 'Banner', entityId: doc._id, after: { status: doc.status } });
    created(res, adminBannerDto(doc.toObject()));
  })
);

router.put(
  '/:id',
  requirePermission('cms.edit'),
  validate({ params: idParam, body: bannerInput }),
  asyncHandler(async (req, res) => {
    const { before, doc } = await updateBanner(req.params.id, req.body);
    await auditAdmin(req, { action: 'banner.update', entityType: 'Banner', entityId: doc._id, before: { status: before.status, order: before.order }, after: { status: doc.status, order: doc.order } });
    ok(res, adminBannerDto(doc.toObject()));
  })
);

router.delete(
  '/:id',
  requirePermission('cms.edit'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await deleteBanner(req.params.id);
    await auditAdmin(req, { action: 'banner.delete', entityType: 'Banner', entityId: req.params.id });
    ok(res, { deleted: true });
  })
);

export default router;
