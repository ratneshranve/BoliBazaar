import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const hmac = (value) => crypto.createHmac('sha256', env.OTP_HASH_SECRET).update(value).digest('hex');

export const randomDigits = (length) => {
  let out = '';
  for (let i = 0; i < length; i += 1) out += crypto.randomInt(0, 10).toString();
  return out;
};

export const signUserAccess = ({ userId, sessionId }) =>
  jwt.sign({ typ: 'user', sub: userId, sid: sessionId }, env.USER_JWT_SECRET, { expiresIn: env.USER_ACCESS_TOKEN_TTL });

export const signAdminAccess = ({ adminId, tokenVersion }) =>
  jwt.sign({ typ: 'admin', sub: adminId, tv: tokenVersion }, env.ADMIN_JWT_SECRET, { expiresIn: env.ADMIN_ACCESS_TOKEN_TTL });

/** Short public id for profile URLs, e.g. "u7K2mQ9x" */
export const publicId = (prefix = '') => prefix + crypto.randomBytes(6).toString('base64url');
