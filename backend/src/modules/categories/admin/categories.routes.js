import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, created } from '../../../core/utils/http.js';
import { LISTING_TYPES, ATTRIBUTE_TYPES } from '../category.model.js';
import { adminTree, categoryInput, createCategory, updateCategory, deleteCategory, importStarterCategories } from '../category.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });

router.get('/meta', requirePermission('categories.view'), (req, res) => ok(res, { listingTypes: LISTING_TYPES, attributeTypes: ATTRIBUTE_TYPES }));

router.get('/', requirePermission('categories.view'), asyncHandler(async (req, res) => ok(res, await adminTree())));

router.post(
  '/',
  requirePermission('categories.edit'),
  validate({ body: categoryInput }),
  asyncHandler(async (req, res) => {
    const doc = await createCategory(req.body);
    await auditAdmin(req, { action: 'category.create', entityType: 'Category', entityId: doc._id, after: { name: doc.name, parentId: doc.parentId } });
    created(res, { id: String(doc._id) });
  })
);

router.put(
  '/:id',
  requirePermission('categories.edit'),
  validate({ params: idParam, body: categoryInput }),
  asyncHandler(async (req, res) => {
    const { before, doc } = await updateCategory(req.params.id, req.body);
    await auditAdmin(req, { action: 'category.update', entityType: 'Category', entityId: doc._id, before: { name: before.name, status: before.status, parentId: before.parentId }, after: { name: doc.name, status: doc.status, parentId: doc.parentId } });
    ok(res, { id: String(doc._id) });
  })
);

router.delete(
  '/:id',
  requirePermission('categories.edit'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const before = await deleteCategory(req.params.id);
    await auditAdmin(req, { action: 'category.delete', entityType: 'Category', entityId: req.params.id, before: { name: before.name } });
    ok(res, { deleted: true });
  })
);

router.post(
  '/import-starter',
  requirePermission('categories.edit'),
  asyncHandler(async (req, res) => {
    const count = await importStarterCategories();
    await auditAdmin(req, { action: 'category.import_starter', entityType: 'Category', after: { count } });
    created(res, { count });
  })
);

export default router;
