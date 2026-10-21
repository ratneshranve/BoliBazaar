import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { requirePermission } from '../../../core/middleware/auth.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { ApiError } from '../../../core/utils/ApiError.js';
import { integrations } from '../../../core/config/env.js';
import { auditAdmin } from '../../audit/audit.service.js';
import { TranslationBundle } from '../translation.model.js';
import { LANG_CODE, allLanguages, languageInfo, refreshLanguages } from '../catalogue.js';
import { languageSettings } from '../translate.service.js';
import { bundleRows, bundleStatus, prepareBundle, retranslateBundle, setOverride, sourceStats } from '../bundle.service.js';

const router = Router();
const langParam = z.object({ lang: z.string().regex(LANG_CODE).refine((l) => l !== 'en', 'English is the source language') });

const knownLanguage = async (lang) => {
  if (!(await languageInfo(lang))) throw ApiError.notFound('LANGUAGE_UNKNOWN', 'Unknown language');
};

/** Every language the app can offer (from Google, cached). */
router.get('/languages', requirePermission('settings.view'), asyncHandler(async (req, res) => ok(res, await allLanguages())));

router.post(
  '/languages/refresh',
  requirePermission('settings.edit'),
  asyncHandler(async (req, res) => ok(res, await refreshLanguages()))
);

/**
 * Translation status of the languages in use: the admin's picks, plus (in "all" mode) every
 * language a user has already opened.
 */
router.get(
  '/bundles',
  requirePermission('settings.view'),
  asyncHandler(async (req, res) => {
    const s = await languageSettings();
    const used = s.mode === 'all' ? await TranslationBundle.distinct('lang') : [];
    const langs = [...new Set([...s.enabled, ...used])].filter((l) => l !== 'en');
    const status = await bundleStatus(langs);
    const info = new Map((await allLanguages()).map((l) => [l.code, l]));
    ok(res, {
      translateConfigured: integrations.translate.configured,
      source: sourceStats(),
      items: status.map((st) => ({ ...st, name: info.get(st.lang)?.name || st.lang, nativeName: info.get(st.lang)?.nativeName || st.lang })),
    });
  })
);

router.post(
  '/bundles/:lang/prepare',
  requirePermission('settings.edit'),
  validate({ params: langParam }),
  asyncHandler(async (req, res) => {
    await knownLanguage(req.params.lang);
    const b = await prepareBundle(req.params.lang);
    await auditAdmin(req, { action: 'i18n.prepare', entityType: 'Language', entityId: req.params.lang });
    ok(res, { lang: b.lang, version: b.version });
  })
);

router.post(
  '/bundles/:lang/retranslate',
  requirePermission('settings.edit'),
  validate({ params: langParam }),
  asyncHandler(async (req, res) => {
    await knownLanguage(req.params.lang);
    const b = await retranslateBundle(req.params.lang);
    await auditAdmin(req, { action: 'i18n.retranslate', entityType: 'Language', entityId: req.params.lang });
    ok(res, { lang: b.lang, version: b.version });
  })
);

/** All app strings of one language (translates it first if needed). */
router.get(
  '/bundles/:lang/strings',
  requirePermission('settings.view'),
  validate({ params: langParam }),
  asyncHandler(async (req, res) => {
    await knownLanguage(req.params.lang);
    ok(res, await bundleRows(req.params.lang));
  })
);

/** Correct one string by hand (text: null goes back to the automatic translation). */
router.put(
  '/bundles/:lang/strings',
  requirePermission('settings.edit'),
  validate({
    params: langParam,
    body: z.object({ key: z.string().min(1).max(120), text: z.string().trim().min(1).max(600).nullable() }),
  }),
  asyncHandler(async (req, res) => {
    await knownLanguage(req.params.lang);
    const { before, after } = await setOverride(req.params.lang, req.body.key, req.body.text, req.admin.id);
    await auditAdmin(req, { action: 'i18n.string', entityType: 'Language', entityId: `${req.params.lang}:${req.body.key}`, before, after });
    ok(res, { key: req.body.key, text: after });
  })
);

export default router;
