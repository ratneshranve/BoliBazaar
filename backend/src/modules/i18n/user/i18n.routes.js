import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { limiter } from '../../../core/middleware/rateLimit.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { assertLanguageEnabled } from '../translate.service.js';
import { getBundle } from '../bundle.service.js';
import { LANG_CODE } from '../catalogue.js';

const router = Router();
const lang = z.string().regex(LANG_CODE);

/**
 * The app's UI text in one language. The app sends the version it already has (`v`); when nothing
 * changed only the version comes back, so a check costs a few bytes and no translation.
 */
router.get(
  '/bundle/:lang',
  limiter({ name: 'i18n-bundle-get', windowMs: 60 * 60_000, max: 120 }),
  validate({ params: z.object({ lang }), query: z.object({ v: z.string().max(40).optional() }) }),
  asyncHandler(async (req, res) => {
    await assertLanguageEnabled(req.params.lang);
    const bundle = await getBundle(req.params.lang);
    if (req.query.v && req.query.v === bundle.version) return ok(res, { lang: bundle.lang, version: bundle.version, unchanged: true });
    return ok(res, bundle);
  })
);

/**
 * Older app versions send their English strings. Answers come from the server's ready-made bundle
 * only — text the server doesn't know is returned unchanged, never sent to Google.
 */
router.post(
  '/bundle',
  limiter({ name: 'i18n-bundle', windowMs: 60 * 60_000, max: 20 }),
  validate({
    body: z.object({
      lang,
      strings: z.record(z.string().max(120), z.string().max(600)).refine((o) => Object.keys(o).length <= 2000, 'Too many strings'),
    }),
  }),
  asyncHandler(async (req, res) => {
    await assertLanguageEnabled(req.body.lang);
    const { strings } = await getBundle(req.body.lang);
    const out = Object.fromEntries(Object.entries(req.body.strings).map(([k, en]) => [k, strings[k] ?? en]));
    ok(res, { lang: req.body.lang, strings: out });
  })
);

export default router;
