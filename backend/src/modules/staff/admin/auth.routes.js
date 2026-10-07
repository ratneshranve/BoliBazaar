import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { requireAdmin } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { signAdminAccess } from '../../../core/services/tokens.js';
import { AdminUser } from '../staff.models.js';
import { getSettingValue } from '../../settings/settings.service.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { ALL_PERMISSIONS } from '../../../core/rbac/permissions.js';

const router = Router();

export const adminProfileDto = (a) => ({
  id: String(a._id),
  name: a.name,
  email: a.email,
  role: a.roleId ? { id: String(a.roleId._id), name: a.roleId.name, isSuper: a.roleId.isSuper } : null,
  permissions: a.roleId?.isSuper ? ALL_PERMISSIONS : a.roleId?.permissions || [],
  scopes: a.scopes,
  lastLoginAt: a.lastLoginAt,
});

router.post(
  '/login',
  limiter({ name: 'admin-login-ip', windowMs: 15 * 60_000, max: 30 }),
  validate({ body: z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(200) }) }),
  asyncHandler(async (req, res) => {
    const sec = await getSettingValue('security');
    const admin = await AdminUser.findOne({ email: req.body.email }).select('+passwordHash').populate('roleId');
    const fail = () => ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');

    if (!admin) throw fail();
    if (admin.status !== 'active') throw ApiError.forbidden('ADMIN_DISABLED', 'Account disabled');
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw ApiError.tooMany('ADMIN_LOCKED', 'Too many failed attempts', { until: admin.lockedUntil });
    }

    const match = await bcrypt.compare(req.body.password, admin.passwordHash);
    if (!match) {
      admin.failedLogins += 1;
      if (admin.failedLogins >= sec.adminMaxFailedLogins) {
        admin.lockedUntil = new Date(Date.now() + sec.adminLockMinutes * 60_000);
        admin.failedLogins = 0;
      }
      await admin.save();
      throw fail();
    }

    admin.failedLogins = 0;
    admin.lockedUntil = undefined;
    admin.lastLoginAt = new Date();
    await admin.save();

    req.admin = { id: String(admin._id), name: admin.name };
    await auditAdmin(req, { action: 'admin.login', entityType: 'AdminUser', entityId: admin._id });

    ok(res, { accessToken: signAdminAccess({ adminId: String(admin._id), tokenVersion: admin.tokenVersion }), admin: adminProfileDto(admin) });
  })
);

router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin = await AdminUser.findById(req.admin.id).populate('roleId').lean();
    ok(res, adminProfileDto(admin));
  })
);

router.post(
  '/change-password',
  requireAdmin,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => {
    const admin = await AdminUser.findById(req.admin.id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.currentPassword, admin.passwordHash))) {
      throw ApiError.badRequest('INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    admin.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    admin.tokenVersion += 1; // log out everywhere
    await admin.save();
    await auditAdmin(req, { action: 'admin.change_password', entityType: 'AdminUser', entityId: admin._id });
    ok(res, { accessToken: signAdminAccess({ adminId: String(admin._id), tokenVersion: admin.tokenVersion }) });
  })
);

router.post(
  '/logout-all',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await AdminUser.updateOne({ _id: req.admin.id }, { $inc: { tokenVersion: 1 } });
    await auditAdmin(req, { action: 'admin.logout_all', entityType: 'AdminUser', entityId: req.admin.id });
    ok(res, { loggedOut: true });
  })
);

export default router;
