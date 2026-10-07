import { z } from 'zod';

/**
 * Shape of each admin-managed settings group.
 * `initial` is the structural starting state written once when the group is first read:
 * it never contains business content (names, images, texts) — those stay null until admin sets them.
 */
const mediaRef = z.object({ url: z.string().url(), mediaId: z.string().optional() }).nullable();
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Use format 1.2.3').nullable();
const nullableText = (max) => z.string().trim().max(max).nullable();

const platformControl = z.object({
  minVersion: semver,
  latestVersion: semver,
  storeUrl: z.string().url().nullable(),
});

export const settingGroups = {
  branding: {
    public: true,
    schema: z.object({
      appName: nullableText(60),
      tagline: nullableText(120),
      logo: mediaRef,
      logoDark: mediaRef,
      icon: mediaRef,
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
      supportEmail: z.string().email().nullable(),
      supportPhone: nullableText(20),
      whatsapp: nullableText(20),
      website: z.string().url().nullable(),
    }),
    initial: {
      appName: null,
      tagline: null,
      logo: null,
      logoDark: null,
      icon: null,
      primaryColor: null,
      supportEmail: null,
      supportPhone: null,
      whatsapp: null,
      website: null,
    },
  },

  appControl: {
    public: true,
    schema: z.object({
      maintenance: z.object({
        enabled: z.boolean(),
        title: nullableText(80),
        message: nullableText(500),
        until: z.string().datetime().nullable(),
        allowUserIds: z.array(z.string()).max(50),
      }),
      android: platformControl,
      ios: platformControl,
    }),
    initial: {
      maintenance: { enabled: false, title: null, message: null, until: null, allowUserIds: [] },
      android: { minVersion: null, latestVersion: null, storeUrl: null },
      ios: { minVersion: null, latestVersion: null, storeUrl: null },
    },
  },

  storage: {
    public: false,
    schema: z.object({
      provider: z.enum(['cloudinary', 'local']).nullable(),
      maxImageMb: z.number().positive().max(50),
      imageMaxEdgePx: z.number().int().min(320).max(4096),
      imageQuality: z.number().int().min(40).max(100),
    }),
    initial: { provider: null, maxImageMb: 10, imageMaxEdgePx: 1600, imageQuality: 80 },
  },

  security: {
    public: false,
    schema: z.object({
      otpLength: z.number().int().min(4).max(8),
      otpExpirySec: z.number().int().min(60).max(900),
      otpResendSec: z.number().int().min(15).max(300),
      otpMaxAttempts: z.number().int().min(1).max(10),
      otpMaxPerHour: z.number().int().min(1).max(20),
      otpMaxPerDay: z.number().int().min(1).max(50),
      adminMaxFailedLogins: z.number().int().min(3).max(20),
      adminLockMinutes: z.number().int().min(1).max(1440),
    }),
    initial: {
      otpLength: 6,
      otpExpirySec: 300,
      otpResendSec: 30,
      otpMaxAttempts: 3,
      otpMaxPerHour: 5,
      otpMaxPerDay: 10,
      adminMaxFailedLogins: 5,
      adminLockMinutes: 15,
    },
  },

  features: {
    public: true,
    schema: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), z.boolean()),
    initial: {
      auctions: false,
      proxyBidding: false,
      makeOffer: false,
      voiceSearch: false,
      ratings: false,
      jobs: false,
      services: false,
      googleLogin: false,
      appleLogin: false,
    },
  },
};

export const settingKeys = Object.keys(settingGroups);
