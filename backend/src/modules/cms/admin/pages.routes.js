import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { PAGE_SLUGS } from '../page.model.js';
import { getPageDoc, savePage, pageInput } from '../page.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const slugParam = z.object({ slug: z.enum(PAGE_SLUGS) });

const dto = (slug, d) => ({
  slug,
  title: d?.title || {},
  body: d?.body || {},
  version: d?.version || 0,
  publishedAt: d?.publishedAt || null,
  updatedAt: d?.updatedAt || null,
});

router.get(
  '/',
  requirePermission('cms.view'),
  asyncHandler(async (req, res) => {
    const out = await Promise.all(PAGE_SLUGS.map(async (slug) => dto(slug, await getPageDoc(slug))));
    ok(res, out);
  })
);

router.get(
  '/:slug',
  requirePermission('cms.view'),
  validate({ params: slugParam }),
  asyncHandler(async (req, res) => ok(res, dto(req.params.slug, await getPageDoc(req.params.slug))))
);

router.put(
  '/:slug',
  requirePermission('cms.edit'),
  validate({ params: slugParam, body: pageInput }),
  asyncHandler(async (req, res) => {
    const { before, after, doc } = await savePage(req.params.slug, req.body, req.admin.id);
    await auditAdmin(req, { action: 'cms.page.save', entityType: 'ContentPage', entityId: req.params.slug, before, after });
    ok(res, dto(req.params.slug, doc.toObject()));
  })
);

export default router;
