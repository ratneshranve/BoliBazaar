import crypto from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { OtpRequest, Session, Device } from './auth.models.js';
import { User } from '../users/user.model.js';
import { getSettingValue } from '../settings/settings.service.js';
import { sendOtpSms } from '../../core/services/sms.js';
import { hmac, sha256, randomDigits, randomToken, signUserAccess, publicId } from '../../core/services/tokens.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { redis } from '../../core/db/redis.js';
import { env } from '../../core/config/env.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVOKE_MARK_SEC = 24 * 60 * 60; // longer than any access-token TTL

export const normalisePhone = (phone, countryCode) => {
  const parsed = parsePhoneNumberFromString(String(phone || ''), countryCode);
  if (!parsed || !parsed.isValid()) throw ApiError.badRequest('PHONE_INVALID', 'Enter a valid mobile number');
  return { e164: parsed.number, country: parsed.country };
};

export const otpHash = (phone, code) => hmac(`${phone}:${code}`);

/* ───────── OTP ───────── */

export const sendLoginOtp = async ({ phone, countryCode, ip, deviceId }) => {
  const { e164 } = normalisePhone(phone, countryCode);
  const sec = await getSettingValue('security');
  const now = Date.now();

  const [hourCount, dayCount, last] = await Promise.all([
    OtpRequest.countDocuments({ target: e164, createdAt: { $gte: new Date(now - 60 * 60 * 1000) } }),
    OtpRequest.countDocuments({ target: e164, createdAt: { $gte: new Date(now - DAY_MS) } }),
    OtpRequest.findOne({ target: e164, purpose: 'login' }).sort({ createdAt: -1 }).lean(),
  ]);

  if (last && now - last.createdAt.getTime() < sec.otpResendSec * 1000) {
    const wait = Math.ceil((sec.otpResendSec * 1000 - (now - last.createdAt.getTime())) / 1000);
    throw ApiError.tooMany('OTP_RESEND_TOO_SOON', 'Please wait before requesting another OTP', { retryAfterSec: wait });
  }
  if (hourCount >= sec.otpMaxPerHour || dayCount >= sec.otpMaxPerDay) {
    throw ApiError.tooMany('OTP_LIMIT_REACHED', 'Too many OTP requests. Try again later.');
  }

  // DEFAULT_OTP_ENABLED=true (testing): fixed code, no SMS
  const code = env.defaultOtp || randomDigits(sec.otpLength);
  await OtpRequest.create({
    target: e164,
    purpose: 'login',
    codeHash: otpHash(e164, code),
    expiresAt: new Date(now + sec.otpExpirySec * 1000),
    ip,
    deviceId,
  });

  if (!env.defaultOtp) {
    const branding = await getSettingValue('branding');
    await sendOtpSms({ phone: e164, code, appName: branding.appName });
  }

  return { phone: e164, length: code.length, expiresInSec: sec.otpExpirySec, resendInSec: sec.otpResendSec };
};

export const consumeOtp = async ({ e164, code, purpose }) => {
  const sec = await getSettingValue('security');
  const otp = await OtpRequest.findOne({ target: e164, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) throw ApiError.badRequest('OTP_EXPIRED', 'OTP expired, request a new one');
  if (otp.attempts >= sec.otpMaxAttempts) throw ApiError.badRequest('OTP_ATTEMPTS_EXCEEDED', 'Too many wrong attempts, request a new OTP');

  const expected = Buffer.from(otp.codeHash, 'hex');
  const given = Buffer.from(otpHash(e164, String(code)), 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest('OTP_INVALID', 'Incorrect OTP', { attemptsLeft: Math.max(0, sec.otpMaxAttempts - otp.attempts) });
  }
  otp.consumedAt = new Date();
  await otp.save();
};

/* ───────── Sessions ───────── */

const createSession = async (user, device, familyId = crypto.randomUUID()) => {
  const refreshToken = randomToken();
  const session = await Session.create({
    userId: user._id,
    familyId,
    refreshTokenHash: sha256(refreshToken),
    deviceId: device.deviceId,
    platform: device.platform,
    deviceName: device.deviceName,
    appVersion: device.appVersion,
    ip: device.ip,
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + env.USER_REFRESH_TOKEN_DAYS * DAY_MS),
  });
  return {
    session,
    tokens: {
      accessToken: signUserAccess({ userId: String(user._id), sessionId: String(session._id) }),
      refreshToken,
      refreshExpiresAt: session.expiresAt,
    },
  };
};

export const revokeSession = async (session, reason) => {
  if (session.revokedAt) return;
  session.revokedAt = new Date();
  session.revokeReason = reason;
  await session.save();
  await redis.set(`revoked:sid:${session._id}`, '1', 'EX', REVOKE_MARK_SEC);
  await Device.deleteMany({ sessionId: session._id });
};

export const verifyLoginOtp = async ({ phone, countryCode, code, device }) => {
  const { e164, country } = normalisePhone(phone, countryCode);
  await consumeOtp({ e164, code, purpose: 'login' });

  let user = await User.findOne({ 'phone.e164': e164 });
  let isNewUser = false;
  if (!user) {
    user = await User.create({
      publicId: publicId('u'),
      phone: { e164, countryCode: country, verifiedAt: new Date() },
      countryCode: country,
      language: device.lang,
      timezone: device.timezone,
    });
    isNewUser = true;
  } else {
    if (user.status === 'banned') throw ApiError.forbidden('ACCOUNT_BANNED', 'This account is banned');
    if (user.status === 'deleted') throw ApiError.forbidden('ACCOUNT_DELETED');
    if (['deactivated', 'pending_deletion'].includes(user.status)) {
      user.status = 'active'; // logging in reactivates / cancels deletion
      user.statusReason = undefined;
    }
    if (!user.phone.verifiedAt) user.phone.verifiedAt = new Date();
    user.lastActiveAt = new Date();
    await user.save();
  }

  const { tokens } = await createSession(user, device);
  return { tokens, user, isNewUser: isNewUser || !user.profileCompletedAt };
};

/** Rotate refresh token. Re-use of an already rotated token revokes the whole family. */
export const refreshSession = async ({ refreshToken, device }) => {
  const hash = sha256(String(refreshToken || ''));
  const session = await Session.findOne({ refreshTokenHash: hash });

  if (!session) {
    const familyId = await redis.get(`rt:used:${hash}`);
    if (familyId) {
      const family = await Session.find({ familyId, revokedAt: null });
      await Promise.all(family.map((s) => revokeSession(s, 'refresh_token_reuse')));
    }
    throw ApiError.unauthorized('REFRESH_INVALID');
  }
  if (session.revokedAt || session.expiresAt < new Date()) throw ApiError.unauthorized('REFRESH_INVALID');

  const user = await User.findById(session.userId);
  if (!user || ['banned', 'deleted'].includes(user.status)) {
    await revokeSession(session, 'account_blocked');
    throw ApiError.forbidden('ACCOUNT_BLOCKED');
  }

  const newToken = randomToken();
  await redis.set(`rt:used:${hash}`, session.familyId, 'EX', env.USER_REFRESH_TOKEN_DAYS * 24 * 60 * 60);
  session.refreshTokenHash = sha256(newToken);
  session.lastUsedAt = new Date();
  session.appVersion = device.appVersion || session.appVersion;
  session.ip = device.ip;
  session.expiresAt = new Date(Date.now() + env.USER_REFRESH_TOKEN_DAYS * DAY_MS);
  await session.save();

  user.lastActiveAt = new Date();
  await user.save();

  return {
    accessToken: signUserAccess({ userId: String(user._id), sessionId: String(session._id) }),
    refreshToken: newToken,
    refreshExpiresAt: session.expiresAt,
  };
};

export const logout = async ({ sessionId }) => {
  const session = await Session.findById(sessionId);
  if (session) await revokeSession(session, 'logout');
};

/* ───────── Devices (FCM tokens) ───────── */

export const registerDevice = async ({ userId, sessionId, data }) => {
  await Device.findOneAndUpdate(
    { fcmToken: data.fcmToken },
    { $set: { ...data, userId, sessionId, lastSeenAt: new Date() } },
    { upsert: true, new: true }
  );
  // One token per device install: drop stale tokens of the same device for this user
  await Device.deleteMany({ userId, deviceId: data.deviceId, fcmToken: { $ne: data.fcmToken } });
};

export const removeDevice = ({ userId, fcmToken }) => Device.deleteOne({ userId, fcmToken });
