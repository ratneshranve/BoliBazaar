import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { requireUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { sendLoginOtp, verifyLoginOtp, refreshSession, logout, registerDevice, removeDevice } from '../auth.service.js';
import { meDto } from '../../users/user.dto.js';

const router = Router();

const phoneBody = z.object({
  phone: z.string().trim().min(5).max(20),
  countryCode: z.string().length(2).toUpperCase(),
});

const deviceFrom = (req) => ({
  deviceId: req.ctx.deviceId,
  platform: req.ctx.platform,
  appVersion: req.ctx.appVersion,
  lang: req.ctx.lang,
  timezone: req.ctx.timezone,
  deviceName: req.get('X-Device-Name') || undefined,
  ip: req.ip,
});

router.post(
  '/otp/send',
  limiter({ name: 'otp-ip', windowMs: 60 * 60_000, max: 20 }),
  limiter({ name: 'otp-phone', windowMs: 60 * 60_000, max: 10, keyBy: (req) => String(req.body?.phone || '').replace(/\D/g, '') }),
  validate({ body: phoneBody }),
  asyncHandler(async (req, res) => ok(res, await sendLoginOtp({ ...req.body, ip: req.ip, deviceId: req.ctx.deviceId })))
);

router.post(
  '/otp/verify',
  limiter({ name: 'otp-verify-ip', windowMs: 15 * 60_000, max: 30 }),
  // per number, so guesses spread over many IPs are still capped
  limiter({ name: 'otp-verify-phone', windowMs: 15 * 60_000, max: 10, keyBy: (req) => String(req.body?.phone || '').replace(/\D/g, '') }),
  validate({ body: phoneBody.extend({ code: z.string().trim().regex(/^\d{4,8}$/) }) }),
  asyncHandler(async (req, res) => {
    const { tokens, user, isNewUser } = await verifyLoginOtp({ ...req.body, device: deviceFrom(req) });
    ok(res, { ...tokens, isNewUser, user: meDto(user) });
  })
);

router.post(
  '/refresh',
  limiter({ name: 'refresh-ip', windowMs: 60_000, max: 30 }),
  validate({ body: z.object({ refreshToken: z.string().min(20) }) }),
  asyncHandler(async (req, res) => ok(res, await refreshSession({ refreshToken: req.body.refreshToken, device: deviceFrom(req) })))
);

router.post(
  '/logout',
  requireUser,
  asyncHandler(async (req, res) => {
    await logout({ sessionId: req.user.sid });
    ok(res, { loggedOut: true });
  })
);

/* FCM device token registration — called after every login and on token refresh */
router.post(
  '/devices',
  requireUser,
  validate({
    body: z.object({
      fcmToken: z.string().min(20).max(4096),
      deviceId: z.string().min(4).max(200),
      platform: z.enum(['android', 'ios']),
      osVersion: z.string().max(40).optional(),
      appVersion: z.string().max(40).optional(),
      model: z.string().max(120).optional(),
      locale: z.string().max(20).optional(),
      pushEnabled: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await registerDevice({ userId: req.user.id, sessionId: req.user.sid, data: req.body });
    ok(res, { registered: true });
  })
);

router.delete(
  '/devices',
  requireUser,
  validate({ body: z.object({ fcmToken: z.string().min(20) }) }),
  asyncHandler(async (req, res) => {
    await removeDevice({ userId: req.user.id, fcmToken: req.body.fcmToken });
    ok(res, { removed: true });
  })
);

export default router;
