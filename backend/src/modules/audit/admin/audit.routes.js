import { Router } from 'express';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta } from '../../../core/utils/http.js';
import { AuditLog } from '../audit.model.js';

const router = Router();

router.get(
  '/',
  requirePermission('audit.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = {};
    if (req.query.action) f.action = String(req.query.action);
    if (req.query.entityType) f.entityType = String(req.query.entityType);
    if (req.query.entityId) f.entityId = String(req.query.entityId);
    if (req.query.actorId && /^[a-f0-9]{24}$/.test(req.query.actorId)) f.actorId = req.query.actorId;
    if (req.query.from || req.query.to) {
      f.createdAt = {};
      if (req.query.from) f.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) f.createdAt.$lte = new Date(req.query.to);
    }
    const [items, total] = await Promise.all([
      AuditLog.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
      AuditLog.countDocuments(f),
    ]);
    ok(res, items, pageMeta(paging, total));
  })
);

export default router;
