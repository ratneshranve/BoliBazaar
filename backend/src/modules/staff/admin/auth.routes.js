import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { requireAdmin } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { signAdminAccess } from '../../../core/services/tokens.js';
import { AdminUser, AdminPasswordReset } from '../staff.models.js';
import { hmac, randomDigits } from '../../../core/services/tokens.js';
import { sendEmail, emailAvailable } from '../../../core/services/email.js';
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

/* ───── forgot password: a 6-digit code by email (SMTP), then a new password ───── */

const RESET_TTL_MIN = 10;
const RESET_MAX_TRIES = 5;
const resetHash = (adminId, code) => hmac(`admin-reset:${adminId}:${code}`);

router.post(
  '/forgot-password',
  limiter({ name: 'admin-forgot-ip', windowMs: 60 * 60_000, max: 10 }),
  limiter({ name: 'admin-forgot-email', windowMs: 60 * 60_000, max: 5, keyBy: (req) => String(req.body?.email || '').toLowerCase() }),
  validate({ body: z.object({ email: z.string().email().toLowerCase() }) }),
  asyncHandler(async (req, res) => {
    if (!emailAvailable()) throw ApiError.unavailable('EMAIL_UNAVAILABLE', 'Email is not set up on the server (EMAIL_HOST … in backend .env)');
    const admin = await AdminUser.findOne({ email: req.body.email, status: 'active' }).lean();
    // the same answer whether or not the address exists, so it cannot be used to find admin emails
    if (admin) {
      const code = randomDigits(6);
      await AdminPasswordReset.findOneAndUpdate(
        { adminId: admin._id },
        { $set: { codeHash: resetHash(String(admin._id), code), expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000), attempts: 0 } },
        { upsert: true }
      );
      const { appName } = await getSettingValue('branding');
      await sendEmail({
        to: admin.email,
        subject: `${code} is your password reset code`,
        heading: 'Reset your admin password',
        text: `Your code is ${code}. It expires in ${RESET_TTL_MIN} minutes.
If you did not ask for this, ignore this email — your password stays the same.`,
        appName: appName || undefined,
      });
      req.admin = { id: String(admin._id), name: admin.name };
      await auditAdmin(req, { action: 'admin.password_reset_requested', entityType: 'AdminUser', entityId: admin._id });
    }
    ok(res, { sent: true, expiresInMin: RESET_TTL_MIN });
  })
);

router.post(
  '/reset-password',
  limiter({ name: 'admin-reset-ip', windowMs: 15 * 60_000, max: 20 }),
  validate({ body: z.object({ email: z.string().email().toLowerCase(), code: z.string().trim().regex(/^\d{6}$/), newPassword: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => {
    const invalid = () => ApiError.badRequest('RESET_CODE_INVALID', 'The code is wrong or has expired — ask for a new one');
    const admin = await AdminUser.findOne({ email: req.body.email, status: 'active' }).select('+passwordHash');
    if (!admin) throw invalid();
    const reset = await AdminPasswordReset.findOne({ adminId: admin._id });
    if (!reset || reset.expiresAt < new Date() || reset.attempts >= RESET_MAX_TRIES) throw invalid();
    if (reset.codeHash !== resetHash(String(admin._id), req.body.code)) {
      reset.attempts += 1;
      await reset.save();
      throw invalid();
    }
    await AdminPasswordReset.deleteOne({ _id: reset._id });
    admin.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    admin.tokenVersion += 1; // every old session ends
    admin.failedLogins = 0;
    admin.lockedUntil = undefined;
    await admin.save();
    req.admin = { id: String(admin._id), name: admin.name };
    await auditAdmin(req, { action: 'admin.password_reset', entityType: 'AdminUser', entityId: admin._id });
    ok(res, { reset: true });
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
