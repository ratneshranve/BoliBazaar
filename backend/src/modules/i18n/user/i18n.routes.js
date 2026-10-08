import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { assertLanguageEnabled, translateTexts } from '../translate.service.js';

const router = Router();

/**
 * The app sends its English UI strings and gets them back in an admin-enabled language
 * that the app doesn't ship a bundle for. Results are cached per string on the server.
 */
router.post(
  '/bundle',
  limiter({ name: 'i18n-bundle', windowMs: 60 * 60_000, max: 20 }),
  validate({
    body: z.object({
      lang: z.string().regex(/^[a-z]{2,3}$/),
      strings: z.record(z.string().max(120), z.string().max(600)).refine((o) => Object.keys(o).length <= 2000, 'Too many strings'),
    }),
  }),
  asyncHandler(async (req, res) => {
    await assertLanguageEnabled(req.body.lang);
    const keys = Object.keys(req.body.strings);
    const translated = await translateTexts(keys.map((k) => req.body.strings[k]), req.body.lang);
    ok(res, { lang: req.body.lang, strings: Object.fromEntries(keys.map((k, i) => [k, translated[i]])) });
  })
);

export default router;
