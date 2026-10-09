import { Router } from 'express';
import { z } from 'zod';
import { requireUser, requireActiveUser } from '../../../core/middleware/auth.js';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, created } from '../../../core/utils/http.js';
import { singleFile, savePublicImage, savePrivateFile } from '../uploads.service.js';

const router = Router();

router.use(requireUser, requireActiveUser, limiter({ name: 'upload', windowMs: 60_000, max: 40, keyBy: (req) => req.user.id }));

router.post(
  '/image',
  singleFile,
  validate({ body: z.object({ purpose: z.enum(['listing', 'avatar', 'chat']) }) }),
  asyncHandler(async (req, res) =>
    created(res, await savePublicImage({ file: req.file, ownerType: 'user', ownerId: req.user.id, purpose: req.body.purpose }))
  )
);

router.post(
  '/document',
  singleFile,
  validate({ body: z.object({ purpose: z.enum(['document', 'kyc', 'resume', 'chat_file']) }) }),
  asyncHandler(async (req, res) =>
    created(res, await savePrivateFile({ file: req.file, ownerType: 'user', ownerId: req.user.id, purpose: req.body.purpose }))
  )
);

export default router;
