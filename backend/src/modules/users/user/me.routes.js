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
});

const applyProfile = async (user, body, userId) => {
  const { avatarMediaId, ...rest } = body;
  Object.assign(user, rest);
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
    const types = req.body.consents.map((c) => c.docType);
    if (!types.includes('terms') || !types.includes('privacy')) {
      throw ApiError.badRequest('CONSENT_REQUIRED', 'Terms and Privacy Policy must be accepted');
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
