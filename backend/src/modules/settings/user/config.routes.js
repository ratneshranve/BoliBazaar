import { Router } from 'express';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { getPublicSettings } from '../settings.service.js';
import { legalVersions } from '../../cms/page.service.js';
import { languageInfo } from '../../i18n/catalogue.js';
import { translateForReader } from '../../categories/category.service.js';

/** Intro slides in the reader's language (written in English in admin). */
const onboardingFor = async (o, lang) => {
  if (!o.enabled || !o.slides.length) return null;
  const texts = o.slides.flatMap((x) => [x.title, x.body || '']);
  const tr = await translateForReader(texts, lang);
  return { slides: o.slides.map((x, i) => ({ title: tr[i * 2], body: x.body ? tr[i * 2 + 1] : null, image: x.image })) };
};

const router = Router();

const cmp = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
};

/**
 * App start-up config. Everything the app shows about the brand, maintenance,
 * version gates and feature flags comes from here (managed in Admin › Settings).
 */
router.get(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const s = await getPublicSettings();
    const control = s.appControl.value;
    const platform = req.ctx.platform === 'ios' ? 'ios' : 'android';
    const pc = control[platform];
    const appVersion = req.ctx.appVersion;

    const update = {
      required: Boolean(appVersion && pc.minVersion && cmp(appVersion, pc.minVersion) < 0),
      available: Boolean(appVersion && pc.latestVersion && cmp(appVersion, pc.latestVersion) < 0),
      latestVersion: pc.latestVersion,
      storeUrl: pc.storeUrl,
    };

    const maintenance = control.maintenance.enabled
      ? { enabled: true, title: control.maintenance.title, message: control.maintenance.message, until: control.maintenance.until }
      : { enabled: false };

    res.setHeader('Cache-Control', 'no-store');
    ok(res, {
      serverTime: new Date().toISOString(),
      branding: s.branding.value,
      features: s.features.value,
      location: s.location.value,
      marketplace: s.marketplace.value,
      auctions: s.auctions.value,
      monetization: s.monetization.value,
      reportReasons: s.moderation.value.reportReasons,
      chat: s.chat.value,
      grievanceOfficer: s.support.value.grievanceOfficer,
      onboarding: await onboardingFor(s.onboarding.value, req.ctx.lang),
      legal: await legalVersions(),
      languages: {
        default: s.languages.value.default,
        items: s.languages.value.enabled.map((code) => {
          const info = languageInfo(code);
          return { code, name: info.name, nativeName: info.nativeName, rtl: Boolean(info.rtl) };
        }),
      },
      maintenance,
      update,
      versions: {
        branding: s.branding.version,
        appControl: s.appControl.version,
        features: s.features.version,
        onboarding: s.onboarding.version,
      },
    });
  })
);

router.get('/time', (req, res) => ok(res, { serverTime: new Date().toISOString() }));

export default router;
