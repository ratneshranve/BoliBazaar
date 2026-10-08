import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../core/middleware/common.js';
import { requireUser, requirePermission } from '../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta } from '../../core/utils/http.js';
import { searchQuery } from '../listings/listing.schema.js';
import { Broadcast, SEGMENTS } from './growth.model.js';
import { saveSearch, mySearches, updateSearch, deleteSearch, sellerProfile, audienceSize, startBroadcast, analytics } from './growth.service.js';
import { auditAdmin } from '../audit/audit.service.js';

const id = z.string().regex(/^[a-f0-9]{24}$/);

/* ───── user API (/api/v1) ───── */
export const userGrowthRoutes = Router();

// what a saved search may contain: the browse filters, without paging and sort
const savedQuery = searchQuery.omit({ page: true, limit: true, sort: true }).partial();

userGrowthRoutes.get('/saved-searches', requireUser, asyncHandler(async (req, res) => ok(res, await mySearches(req.user.id))));
userGrowthRoutes.post(
  '/saved-searches',
  requireUser,
  validate({ body: z.object({ name: z.string().trim().min(2).max(60), query: savedQuery, alerts: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => ok(res, await saveSearch(req.user.id, req.body), undefined, 201))
);
userGrowthRoutes.patch(
  '/saved-searches/:id',
  requireUser,
  validate({ params: z.object({ id }), body: z.object({ name: z.string().trim().min(2).max(60).optional(), alerts: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => ok(res, await updateSearch(req.user.id, req.params.id, req.body)))
);
userGrowthRoutes.delete('/saved-searches/:id', requireUser, validate({ params: z.object({ id }) }), asyncHandler(async (req, res) => {
  await deleteSearch(req.user.id, req.params.id);
  ok(res, { deleted: true });
}));

/** Public seller page: profile, badges and live ads. */
userGrowthRoutes.get(
  '/sellers/:publicId',
  validate({ params: z.object({ publicId: z.string().min(3).max(40) }), query: z.object({ page: z.coerce.number().int().min(1).max(200).default(1) }) }),
  asyncHandler(async (req, res) => ok(res, await sellerProfile(req.params.publicId, { lang: req.ctx.lang, page: req.query.page })))
);

/* ───── admin API (/api/v1/admin) ───── */
export const adminGrowthRoutes = Router();

const broadcastInput = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(3).max(300),
  route: z.string().trim().regex(/^\/[\w\-/?=&.]*$/, 'An app path such as /auctions').max(200).optional(),
  segment: z.enum(SEGMENTS),
  state: z.string().trim().max(80).optional(),
});

adminGrowthRoutes.post('/broadcasts/audience', requirePermission('notifications.send'), validate({ body: broadcastInput.pick({ segment: true, state: true }) }), asyncHandler(async (req, res) => ok(res, { count: await audienceSize(req.body) })));
adminGrowthRoutes.get(
  '/broadcasts',
  requirePermission('notifications.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const [docs, total] = await Promise.all([Broadcast.find().sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(), Broadcast.countDocuments()]);
    ok(res, docs.map((b) => ({ id: String(b._id), title: b.title, body: b.body, route: b.route || null, segment: b.segment, state: b.state || null, status: b.status, audience: b.audience, sentCount: b.sentCount, createdAt: b.createdAt, finishedAt: b.finishedAt || null })), pageMeta(paging, total));
  })
);
adminGrowthRoutes.post(
  '/broadcasts',
  requirePermission('notifications.send'),
  validate({ body: broadcastInput }),
  asyncHandler(async (req, res) => {
    const b = await startBroadcast(req.admin.id, req.body);
    await auditAdmin(req, { action: 'broadcast.send', entityType: 'Broadcast', entityId: b._id, after: { title: b.title, segment: b.segment, audience: b.audience } });
    ok(res, { id: String(b._id), audience: b.audience }, undefined, 201);
  })
);

adminGrowthRoutes.get(
  '/analytics',
  requirePermission('analytics.view'),
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }),
  asyncHandler(async (req, res) => ok(res, await analytics(req.query.days)))
);
