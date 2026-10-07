import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { redis } from '../db/redis.js';
import { AdminUser } from '../../modules/staff/staff.models.js';
import { User } from '../../modules/users/user.model.js';

const bearer = (req) => {
  const h = req.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

/* ───────────── User (mobile app) ───────────── */

const loadUser = async (req, required) => {
  const token = bearer(req);
  if (!token) {
    if (required) throw ApiError.unauthorized('AUTH_REQUIRED');
    return;
  }
  let payload;
  try {
    payload = jwt.verify(token, env.USER_JWT_SECRET);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
  }
  if (payload.typ !== 'user') throw ApiError.unauthorized('TOKEN_INVALID');
  if (await redis.exists(`revoked:sid:${payload.sid}`)) throw ApiError.unauthorized('SESSION_REVOKED');

  const user = await User.findById(payload.sub).select('status suspendedUntil name').lean();
  if (!user) throw ApiError.unauthorized('USER_NOT_FOUND');
  if (['banned', 'deleted'].includes(user.status)) throw ApiError.forbidden('ACCOUNT_BLOCKED', `Account ${user.status}`);

  req.user = { id: String(user._id), sid: payload.sid, status: user.status, suspendedUntil: user.suspendedUntil };
};

export const requireUser = (req, res, next) => loadUser(req, true).then(() => next(), next);
export const optionalUser = (req, res, next) => loadUser(req, false).then(() => next(), next);

/** Block write actions for suspended accounts (they may still browse). */
export const requireActiveUser = (req, res, next) => {
  if (req.user?.status === 'suspended') return next(ApiError.forbidden('ACCOUNT_SUSPENDED'));
  next();
};

/* ───────────── Admin (web panel) ───────────── */

export const requireAdmin = (req, res, next) =>
  (async () => {
    const token = bearer(req);
    if (!token) throw ApiError.unauthorized('AUTH_REQUIRED');
    let payload;
    try {
      payload = jwt.verify(token, env.ADMIN_JWT_SECRET);
    } catch (err) {
      throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
    }
    if (payload.typ !== 'admin') throw ApiError.unauthorized('TOKEN_INVALID');

    const admin = await AdminUser.findById(payload.sub).populate('roleId').lean();
    if (!admin || admin.status !== 'active') throw ApiError.unauthorized('ADMIN_DISABLED');
    if (admin.tokenVersion !== payload.tv) throw ApiError.unauthorized('SESSION_REVOKED');

    req.admin = {
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      isSuper: Boolean(admin.roleId?.isSuper),
      permissions: new Set(admin.roleId?.permissions || []),
      scopes: admin.scopes || {},
    };
  })().then(() => next(), next);

/** requirePermission('listings.moderate', ...) — any one of the listed permissions grants access. */
export const requirePermission =
  (...perms) =>
  (req, res, next) => {
    if (!req.admin) return next(ApiError.unauthorized());
    if (req.admin.isSuper || perms.some((p) => req.admin.permissions.has(p))) return next();
    next(ApiError.forbidden('PERMISSION_DENIED', `Requires ${perms.join(' or ')}`));
  };
