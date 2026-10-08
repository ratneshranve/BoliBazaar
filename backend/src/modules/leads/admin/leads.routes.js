import { Router } from 'express';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, parsePaging, pageMeta } from '../../../core/utils/http.js';
import { Lead, LEAD_TYPES, LEAD_STATUSES } from '../lead.model.js';
import { Listing } from '../../listings/listing.model.js';
import { User } from '../../users/user.model.js';

const router = Router();

/** Read-only oversight of job applications and service enquiries. */
router.get(
  '/',
  requirePermission('listings.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const f = {};
    if (LEAD_TYPES.includes(req.query.type)) f.type = req.query.type;
    if (LEAD_STATUSES.includes(req.query.status)) f.status = req.query.status;
    if (/^[a-f0-9]{24}$/.test(req.query.listingId || '')) f.listingId = req.query.listingId;
    const [docs, total] = await Promise.all([Lead.find(f).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(), Lead.countDocuments(f)]);
    const userIds = docs.flatMap((d) => [d.ownerId, d.senderId]);
    const [users, listings] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('name phone.e164').lean(),
      Listing.find({ _id: { $in: docs.map((d) => d.listingId) } }).select('title listingNo').lean(),
    ]);
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    const lMap = new Map(listings.map((l) => [String(l._id), l]));
    const who = (id) => ({ id: String(id), name: uMap.get(String(id))?.name || null, phone: uMap.get(String(id))?.phone?.e164 || null });
    ok(
      res,
      docs.map((d) => ({
        id: String(d._id),
        type: d.type,
        status: d.status,
        message: d.message,
        createdAt: d.createdAt,
        listing: { id: String(d.listingId), title: lMap.get(String(d.listingId))?.title || null, listingNo: lMap.get(String(d.listingId))?.listingNo || null },
        sender: who(d.senderId),
        owner: who(d.ownerId),
      })),
      pageMeta(paging, total)
    );
  })
);

export default router;
