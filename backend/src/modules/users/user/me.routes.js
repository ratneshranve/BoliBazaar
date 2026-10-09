import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requireUser } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { User } from '../user.model.js';
import { Media } from '../../uploads/media.model.js';
import { Session } from '../../auth/auth.models.js';
import { revokeSession } from '../../auth/auth.service.js';
import { meDto } from '../user.dto.js';
import { legalVersions } from '../../cms/page.service.js';
import { placeInput, toLocationRef } from '../../places/places.service.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { startEmailVerification, confirmEmail, removeEmail } from '../email.service.js';

const router = Router();
router.use(requireUser);

const loadMe = async (id) => {
  const u = await User.findById(id);
  if (!u) throw ApiError.notFound('USER_NOT_FOUND');
  return u;
};

router.get('/', asyncHandler(async (req, res) => ok(res, meDto(await loadMe(req.user.id)))));

const profileBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  about: z.string().trim().max(500).nullable().optional(),
  language: z.string().min(2).max(10).optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  timezone: z.string().max(60).optional(),
  avatarMediaId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
  homeLocation: placeInput.nullable().optional(), // a map point + label; null clears it
});

const applyProfile = async (user, body, userId) => {
  const { avatarMediaId, homeLocation, ...rest } = body;
  Object.assign(user, rest);
  if (homeLocation !== undefined) {
    user.homeLocation = homeLocation === null ? undefined : await toLocationRef(homeLocation);
  }
  if (avatarMediaId !== undefined) {
    if (avatarMediaId === null) {
      user.avatar = undefined;
    } else {
      const media = await Media.findOne({ _id: avatarMediaId, ownerType: 'user', ownerId: userId, purpose: 'avatar' });
      if (!media) throw ApiError.badRequest('MEDIA_INVALID', 'Avatar upload not found');
      user.avatar = { url: media.url, mediaId: media._id };
    }
  }
};

router.patch(
  '/',
  validate({ body: profileBody }),
  asyncHandler(async (req, res) => {
    const user = await loadMe(req.user.id);
    await applyProfile(user, req.body, req.user.id);
    await user.save();
    ok(res, meDto(user));
  })
);

/* First-time profile completion: name + 18+ confirmation + legal consents */
router.post(
  '/complete-profile',
  validate({
    body: profileBody.extend({
      name: z.string().trim().min(2).max(80),
      ageConfirmed: z.literal(true),
      consents: z
        .array(z.object({ docType: z.enum(['terms', 'privacy', 'marketing']), version: z.number().int().positive() }))
        .min(2),
    }),
  }),
  asyncHandler(async (req, res) => {
    const legal = await legalVersions();
    if (!legal.terms.version || !legal.privacy.version) {
      throw ApiError.unavailable('LEGAL_NOT_CONFIGURED', 'Terms and Privacy are not published yet (Admin › Content Pages)');
    }
    const accepted = (type) => req.body.consents.find((c) => c.docType === type)?.version;
    if (accepted('terms') !== legal.terms.version || accepted('privacy') !== legal.privacy.version) {
      throw ApiError.badRequest('CONSENT_REQUIRED', 'Accept the current Terms and Privacy Policy', {
        terms: legal.terms.version,
        privacy: legal.privacy.version,
      });
    }
    const user = await loadMe(req.user.id);
    const { consents, ageConfirmed, ...profile } = req.body;
    await applyProfile(user, profile, req.user.id);
    user.ageConfirmedAt = new Date();
    user.consents.push(...consents.map((c) => ({ ...c, acceptedAt: new Date(), ip: req.ip })));
    user.profileCompletedAt = user.profileCompletedAt || new Date();
    await user.save();
    ok(res, meDto(user));
  })
);

/* Email (optional) — only used to send copies of important updates. Saved after the emailed code is entered. */
const emailField = z.string().trim().toLowerCase().email().max(120);

router.post(
  '/email',
  limiter({ name: 'email-code', windowMs: 60 * 60_000, max: 10, keyBy: (req) => req.user.id }),
  validate({ body: z.object({ email: emailField }) }),
  asyncHandler(async (req, res) => ok(res, await startEmailVerification(req.user.id, req.body.email)))
);

router.post(
  '/email/verify',
  limiter({ name: 'email-verify', windowMs: 15 * 60_000, max: 20, keyBy: (req) => req.user.id }),
  validate({ body: z.object({ email: emailField, code: z.string().trim().regex(/^\d{4,8}$/) }) }),
  asyncHandler(async (req, res) => ok(res, meDto(await confirmEmail(req.user.id, req.body.email, req.body.code))))
);

router.delete('/email', asyncHandler(async (req, res) => ok(res, meDto(await removeEmail(req.user.id)))));

/* Contact privacy: who may see the phone number, calls / WhatsApp, calling hours */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
router.patch(
  '/privacy',
  validate({
    body: z.object({
      showPhone: z.enum(['never', 'verified_users', 'everyone']).optional(),
      allowCalls: z.boolean().optional(),
      allowWhatsApp: z.boolean().optional(),
      callHours: z.object({ from: hhmm, to: hhmm }).nullable().optional(),
      showOnlineStatus: z.boolean().optional(),
      readReceipts: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const set = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (k === 'callHours') set['privacy.callHours'] = v === null ? {} : v;
      else set[`privacy.${k}`] = v;
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true });
    ok(res, meDto(user));
  })
);

/* Sessions / devices */
router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const sessions = await Session.find({ userId: req.user.id, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 })
      .lean();
    ok(
      res,
      sessions.map((s) => ({
        id: String(s._id),
        current: String(s._id) === req.user.sid,
        platform: s.platform,
        deviceName: s.deviceName,
        appVersion: s.appVersion,
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
      }))
    );
  })
);

router.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const s = await Session.findOne({ _id: req.params.id, userId: req.user.id });
    if (!s) throw ApiError.notFound('SESSION_NOT_FOUND');
    await revokeSession(s, 'user_revoked');
    ok(res, { revoked: true });
  })
);

router.delete(
  '/sessions',
  asyncHandler(async (req, res) => {
    const others = await Session.find({ userId: req.user.id, revokedAt: null, _id: { $ne: req.user.sid } });
    await Promise.all(others.map((s) => revokeSession(s, 'user_revoked_all')));
    ok(res, { revoked: others.length });
  })
);

export default router;
