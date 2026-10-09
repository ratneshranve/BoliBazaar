import { User } from './user.model.js';
import { OtpRequest } from '../auth/auth.models.js';
import { consumeOtp, otpHash } from '../auth/auth.service.js';
import { getSettingValue } from '../settings/settings.service.js';
import { sendEmail, emailAvailable } from '../../core/services/email.js';
import { randomDigits } from '../../core/services/tokens.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { env } from '../../core/config/env.js';

/**
 * A user's email is optional and only used to send them copies of important updates.
 * Saving it sends a code to that address; the address is stored once the code is entered.
 * Codes use the same limits as login OTPs (Settings › Security).
 */
const HOUR_MS = 60 * 60 * 1000;
const target = (userId, email) => `${userId}:${email}`;

export const startEmailVerification = async (userId, rawEmail) => {
  if (!emailAvailable()) throw ApiError.unavailable('EMAIL_UNAVAILABLE', 'Email is not set up yet. Please try again later.');
  const email = rawEmail.trim().toLowerCase();
  const taken = await User.exists({ _id: { $ne: userId }, 'email.address': email });
  if (taken) throw ApiError.conflict('EMAIL_TAKEN', 'This email is already used by another account');

  const sec = await getSettingValue('security');
  const now = Date.now();
  const recent = await OtpRequest.find({ target: new RegExp(`^${userId}:`), purpose: 'email_verify', createdAt: { $gte: new Date(now - HOUR_MS) } })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  if (recent[0] && now - recent[0].createdAt.getTime() < sec.otpResendSec * 1000) {
    const wait = Math.ceil((sec.otpResendSec * 1000 - (now - recent[0].createdAt.getTime())) / 1000);
    throw ApiError.tooMany('OTP_RESEND_TOO_SOON', 'Please wait before requesting another code', { retryAfterSec: wait });
  }
  if (recent.length >= sec.otpMaxPerHour) throw ApiError.tooMany('OTP_LIMIT_REACHED', 'Too many codes requested. Try again later.');

  const code = env.defaultOtp || randomDigits(sec.otpLength);
  const key = target(userId, email);
  await OtpRequest.create({ target: key, purpose: 'email_verify', codeHash: otpHash(key, code), expiresAt: new Date(now + sec.otpExpirySec * 1000) });

  const { appName } = await getSettingValue('branding');
  const minutes = Math.round(sec.otpExpirySec / 60);
  await sendEmail({
    to: email,
    appName,
    subject: `${code} is your ${appName} email code`,
    heading: 'Confirm your email',
    text: `Your code is ${code}.\nIt expires in ${minutes} minute${minutes === 1 ? '' : 's'}. If you did not ask for this, ignore this email.`,
  }).catch((err) => {
    if (err instanceof ApiError) throw err;
    throw ApiError.unavailable('EMAIL_SEND_FAILED', 'Could not send the email. Check the address and try again.');
  });

  return { email, length: code.length, expiresInSec: sec.otpExpirySec, resendInSec: sec.otpResendSec };
};

export const confirmEmail = async (userId, rawEmail, code) => {
  const email = rawEmail.trim().toLowerCase();
  await consumeOtp({ e164: target(userId, email), code, purpose: 'email_verify' });
  const taken = await User.exists({ _id: { $ne: userId }, 'email.address': email });
  if (taken) throw ApiError.conflict('EMAIL_TAKEN', 'This email is already used by another account');
  return User.findByIdAndUpdate(userId, { $set: { 'email.address': email, 'email.verifiedAt': new Date() } }, { new: true });
};

export const removeEmail = (userId) => User.findByIdAndUpdate(userId, { $unset: { email: 1 } }, { new: true });
