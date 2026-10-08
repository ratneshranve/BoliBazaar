import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { PAGE_SLUGS } from '../page.model.js';
import { pageForUser } from '../page.service.js';

const router = Router();

/** Public: Terms, Privacy and Support text, in the user's language (falls back to English). */
router.get(
  '/:slug',
  validate({ params: z.object({ slug: z.enum(PAGE_SLUGS) }) }),
  asyncHandler(async (req, res) => ok(res, await pageForUser(req.params.slug, req.ctx.lang)))
);

export default router;
