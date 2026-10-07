import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok, created, parsePaging, pageMeta, escapeRegex } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { PERMISSIONS, isValidPermission } from '../../../core/rbac/permissions.js';
import { AdminUser, Role } from '../staff.models.js';
import { auditAdmin } from '../../audit/audit.service.js';

const router = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/);

router.get('/permissions', requirePermission('staff.view'), (req, res) => ok(res, PERMISSIONS));

/* ───────── Roles ───────── */

const roleBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()).refine((arr) => arr.every(isValidPermission), 'Unknown permission'),
});

router.get(
  '/roles',
  requirePermission('staff.view'),
  asyncHandler(async (req, res) => {
    const roles = await Role.find().sort({ createdAt: 1 }).lean();
    const counts = await AdminUser.aggregate([{ $group: { _id: '$roleId', n: { $sum: 1 } } }]);
    const byRole = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    ok(res, roles.map((r) => ({ ...r, id: String(r._id), staffCount: byRole[String(r._id)] || 0 })));
  })
);

router.post(
  '/roles',
  requirePermission('staff.edit'),
  validate({ body: roleBody }),
  asyncHandler(async (req, res) => {
    const role = await Role.create(req.body);
    await auditAdmin(req, { action: 'role.create', entityType: 'Role', entityId: role._id, after: req.body });
    created(res, role);
  })
);

router.put(
  '/roles/:id',
  requirePermission('staff.edit'),
  validate({ params: z.object({ id: objectId }), body: roleBody }),
  asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw ApiError.notFound('ROLE_NOT_FOUND');
    if (role.isSuper) throw ApiError.forbidden('ROLE_LOCKED', 'Super admin role cannot be edited');
    const before = role.toObject();
    Object.assign(role, req.body);
    await role.save();
    await AdminUser.updateMany({ roleId: role._id }, { $inc: { tokenVersion: 1 } }); // force re-login with new permissions
    await auditAdmin(req, { action: 'role.update', entityType: 'Role', entityId: role._id, before, after: req.body });
    ok(res, role);
  })
);

router.delete(
  '/roles/:id',
  requirePermission('staff.edit'),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw ApiError.notFound('ROLE_NOT_FOUND');
    if (role.isSystem || role.isSuper) throw ApiError.forbidden('ROLE_LOCKED', 'System role cannot be deleted');
    if (await AdminUser.exists({ roleId: role._id })) throw ApiError.conflict('ROLE_IN_USE', 'Reassign staff before deleting');
    await role.deleteOne();
    await auditAdmin(req, { action: 'role.delete', entityType: 'Role', entityId: role._id, before: role.toObject() });
    ok(res, { deleted: true });
  })
);

/* ───────── Staff accounts ───────── */

const staffDto = (a) => ({
  id: String(a._id),
  name: a.name,
  email: a.email,
  phone: a.phone,
  role: a.roleId ? { id: String(a.roleId._id), name: a.roleId.name } : null,
  status: a.status,
  scopes: a.scopes,
  lastLoginAt: a.lastLoginAt,
  createdAt: a.createdAt,
});

router.get(
  '/admins',
  requirePermission('staff.view'),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const filter = {};
    if (req.query.q) {
      const re = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }
    if (req.query.status) filter.status = req.query.status;
    const [items, total] = await Promise.all([
      AdminUser.find(filter).populate('roleId').sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
      AdminUser.countDocuments(filter),
    ]);
    ok(res, items.map(staffDto), pageMeta(paging, total));
  })
);

const staffBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().toLowerCase(),
  phone: z.string().trim().max(20).optional(),
  roleId: objectId,
  scopes: z.object({ countries: z.array(z.string().length(2)), stateIds: z.array(objectId) }).optional(),
});

router.post(
  '/admins',
  requirePermission('staff.edit'),
  validate({ body: staffBody.extend({ password: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => {
    if (!(await Role.exists({ _id: req.body.roleId }))) throw ApiError.badRequest('ROLE_NOT_FOUND');
    const { password, ...data } = req.body;
    const admin = await AdminUser.create({ ...data, passwordHash: await bcrypt.hash(password, 12) });
    await auditAdmin(req, { action: 'staff.create', entityType: 'AdminUser', entityId: admin._id, after: data });
    created(res, staffDto(await admin.populate('roleId')));
  })
);

router.put(
  '/admins/:id',
  requirePermission('staff.edit'),
  validate({ params: z.object({ id: objectId }), body: staffBody.extend({ status: z.enum(['active', 'disabled']) }) }),
  asyncHandler(async (req, res) => {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) throw ApiError.notFound('ADMIN_NOT_FOUND');
    if (String(admin._id) === req.admin.id && req.body.status === 'disabled') {
      throw ApiError.badRequest('CANNOT_DISABLE_SELF');
    }
    const before = admin.toObject();
    const roleChanged = String(admin.roleId) !== req.body.roleId;
    Object.assign(admin, req.body);
    if (roleChanged || req.body.status === 'disabled') admin.tokenVersion += 1;
    await admin.save();
    await auditAdmin(req, { action: 'staff.update', entityType: 'AdminUser', entityId: admin._id, before, after: req.body });
    ok(res, staffDto(await admin.populate('roleId')));
  })
);

router.post(
  '/admins/:id/reset-password',
  requirePermission('staff.edit'),
  validate({ params: z.object({ id: objectId }), body: z.object({ password: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) throw ApiError.notFound('ADMIN_NOT_FOUND');
    admin.passwordHash = await bcrypt.hash(req.body.password, 12);
    admin.tokenVersion += 1;
    await admin.save();
    await auditAdmin(req, { action: 'staff.reset_password', entityType: 'AdminUser', entityId: admin._id });
    ok(res, { reset: true });
  })
);

export default router;
