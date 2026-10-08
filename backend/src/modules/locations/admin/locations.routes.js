import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, created } from '../../../core/utils/http.js';
import { LOCATION_TYPES, ALLOWED_PARENTS } from '../location.model.js';
import {
  locationInput, createLocation, updateLocation, deleteLocation, listChildren, searchLocations, adminLocationDto, importRow, importRows,
} from '../location.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);

router.get('/meta', requirePermission('locations.view'), (req, res) => ok(res, { types: LOCATION_TYPES, allowedParents: ALLOWED_PARENTS }));

/** Browse: children of a place (omit parentId for the countries). */
router.get(
  '/children',
  requirePermission('locations.view'),
  validate({ query: z.object({ parentId: id.optional() }) }),
  asyncHandler(async (req, res) => ok(res, await listChildren(req.query.parentId, { includeInactive: true })))
);

router.get(
  '/search',
  requirePermission('locations.view'),
  validate({ query: z.object({ q: z.string().min(2).max(100) }) }),
  asyncHandler(async (req, res) => ok(res, await searchLocations(req.query.q, { includeInactive: true, limit: 50 })))
);

router.post(
  '/',
  requirePermission('locations.edit'),
  validate({ body: locationInput }),
  asyncHandler(async (req, res) => {
    const doc = await createLocation(req.body);
    await auditAdmin(req, { action: 'location.create', entityType: 'Location', entityId: doc._id, after: { type: doc.type, name: doc.name, path: doc.path } });
    created(res, adminLocationDto(doc.toObject(), 0));
  })
);

router.put(
  '/:id',
  requirePermission('locations.edit'),
  validate({ params: z.object({ id }), body: locationInput }),
  asyncHandler(async (req, res) => {
    const { before, doc } = await updateLocation(req.params.id, req.body);
    await auditAdmin(req, { action: 'location.update', entityType: 'Location', entityId: doc._id, before: { name: before.name, status: before.status }, after: { name: doc.name, status: doc.status } });
    ok(res, adminLocationDto(doc.toObject(), 0));
  })
);

router.delete(
  '/:id',
  requirePermission('locations.edit'),
  validate({ params: z.object({ id }) }),
  asyncHandler(async (req, res) => {
    const before = await deleteLocation(req.params.id);
    await auditAdmin(req, { action: 'location.delete', entityType: 'Location', entityId: req.params.id, before: { name: before.name, path: before.path } });
    ok(res, { deleted: true });
  })
);

/** Bulk import (the admin page parses the CSV and sends up to 500 rows per request). */
router.post(
  '/import',
  requirePermission('locations.import'),
  validate({ body: z.object({ rows: z.array(importRow).min(1).max(500) }) }),
  asyncHandler(async (req, res) => {
    const stats = await importRows(req.body.rows);
    await auditAdmin(req, { action: 'location.import', entityType: 'Location', after: { rows: req.body.rows.length, created: stats.created, existing: stats.existing, errors: stats.errors.length } });
    ok(res, stats);
  })
);

export default router;
