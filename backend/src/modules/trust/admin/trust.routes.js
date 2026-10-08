import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { privateFilePath } from '../../../core/services/storage.js';
import { Media } from '../../uploads/media.model.js';
import { REPORT_TARGETS, CASE_TYPES, CASE_STATUSES } from '../trust.model.js';
import { reportQueue, resolveReports, caseQueue, adminCase, adminReply, verificationQueue, decideVerification } from '../trust.service.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);

/* ───── reports ───── */
router.get(
  '/reports',
  requirePermission('reports.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const status = ['open', 'action_taken', 'no_violation'].includes(req.query.status) ? req.query.status : 'open';
    ok(res, await reportQueue({ status, targetType: req.query.targetType, page: paging.page, limit: paging.limit }));
  })
);

router.post(
  '/reports/resolve',
  requirePermission('reports.action'),
  validate({ body: z.object({ targetType: z.enum(REPORT_TARGETS), targetId: id, outcome: z.enum(['action_taken', 'no_violation']), note: z.string().trim().min(3).max(500) }) }),
  asyncHandler(async (req, res) => {
    const n = await resolveReports({ ...req.body, adminId: req.admin.id });
    await auditAdmin(req, { action: `reports.${req.body.outcome}`, entityType: req.body.targetType, entityId: req.body.targetId, after: { reports: n }, reason: req.body.note });
    ok(res, { resolved: n });
  })
);

/* ───── cases ───── */
router.get(
  '/cases',
  requirePermission('cases.view', 'support.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const { items, total } = await caseQueue({
      status: req.query.status === 'active' || CASE_STATUSES.includes(req.query.status) ? req.query.status : undefined,
      type: CASE_TYPES.includes(req.query.type) ? req.query.type : undefined,
      overdue: req.query.overdue === 'true',
      page: paging.page,
      limit: paging.limit,
    });
    ok(res, items, pageMeta(paging, total));
  })
);
router.get('/cases/:id', requirePermission('cases.view', 'support.view'), validate({ params: z.object({ id }) }), asyncHandler(async (req, res) => ok(res, await adminCase(req.params.id))));
router.post(
  '/cases/:id/reply',
  requirePermission('cases.action', 'support.reply'),
  validate({ params: z.object({ id }), body: z.object({ text: z.string().trim().max(4000).optional(), internal: z.boolean().optional(), status: z.enum(CASE_STATUSES).optional() }).refine((b) => b.text || b.status, { message: 'Write a reply or change the status' }) }),
  asyncHandler(async (req, res) => {
    const c = await adminReply(req.admin.id, req.params.id, req.body);
    await auditAdmin(req, { action: 'cases.reply', entityType: 'Case', entityId: c._id, after: { status: c.status, internal: Boolean(req.body.internal) } });
    ok(res, await adminCase(c._id));
  })
);

/* ───── verifications ───── */
router.get(
  '/verifications',
  requirePermission('verification.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const { items, total } = await verificationQueue({ status: ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending', page: paging.page, limit: paging.limit });
    ok(res, items, pageMeta(paging, total));
  })
);
router.post(
  '/verifications/:id/decision',
  requirePermission('verification.decide'),
  validate({ params: z.object({ id }), body: z.object({ action: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() }).refine((b) => b.action === 'approve' || (b.reason && b.reason.length >= 3), { message: 'A reason is required', path: ['reason'] }) }),
  asyncHandler(async (req, res) => {
    const v = await decideVerification(req.admin.id, req.params.id, req.body);
    await auditAdmin(req, { action: `verification.${req.body.action}`, entityType: 'Verification', entityId: v._id, after: { status: v.status }, reason: req.body.reason });
    ok(res, { id: String(v._id), status: v.status });
  })
);

/** A private document (KYC, evidence) opened by a reviewer. Every view is recorded. */
router.get(
  '/documents/:id',
  requirePermission('verification.view', 'cases.view', 'support.view'),
  validate({ params: z.object({ id }) }),
  asyncHandler(async (req, res) => {
    const m = await Media.findById(req.params.id).lean();
    if (!m) throw ApiError.notFound('FILE_NOT_FOUND');
    await auditAdmin(req, { action: 'document.view', entityType: 'Media', entityId: m._id, after: { purpose: m.purpose, ownerId: String(m.ownerId) } });
    if (m.visibility === 'public') return res.redirect(m.url);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(privateFilePath(m.key));
  })
);

export default router;
