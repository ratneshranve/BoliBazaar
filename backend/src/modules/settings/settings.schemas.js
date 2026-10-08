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
  /** Languages the app offers. English is the source language and is always on; others are machine-translated. */
  languages: {
    public: true,
    schema: z.object({
      default: z.string().regex(/^[a-z]{2,3}$/),
      enabled: z.array(z.string().regex(/^[a-z]{2,3}$/)).min(1).max(40),
    }),
    initial: { default: 'en', enabled: ['en'] },
  },

  /** Marketplace-wide defaults. */
  marketplace: {
    public: true,
    schema: z.object({ currency: z.string().length(3).toUpperCase() }),
    initial: { currency: 'INR' },
  },

  /**
   * How "near me" works. A location is a map point; users pick a radius around it.
   * The admin controls the choices below; places themselves come from Google, not from admin typing.
   */
  location: {
    public: true,
    schema: z.object({
      radiusOptionsKm: z.array(z.number().int().min(1).max(1000)).min(1).max(10),
      defaultRadiusKm: z.number().int().min(1).max(1000),
      wideScopes: z.object({ district: z.boolean(), state: z.boolean(), country: z.boolean(), worldwide: z.boolean() }),
      allowedCountries: z.array(z.string().length(2).toUpperCase()).max(15), // empty = no restriction (place search is then worldwide)
      distanceUnit: z.enum(['km', 'mi']),
      publicOffsetMeters: z.number().int().min(0).max(5000),
      popularPlaces: z
        .array(
          z.object({
            placeId: z.string().max(300),
            name: z.string().max(120),
            label: z.string().max(200),
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            countryCode: z.string().length(2).optional(),
          })
        )
        .max(30),
    }),
    initial: {
      radiusOptionsKm: [1, 5, 10, 25, 50, 100],
      defaultRadiusKm: 25,
      wideScopes: { district: true, state: true, country: true, worldwide: false },
      allowedCountries: [],
      distanceUnit: 'km',
      publicOffsetMeters: 500,
      popularPlaces: [],
    },
  },

  branding: {
    public: true,
    schema: z.object({
      appName: nullableText(60),
      tagline: nullableText(120),
      logo: mediaRef,
      logoDark: mediaRef,
      icon: mediaRef,
      loginImage: mediaRef.optional(), // picture on the login and OTP screens
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
      loginImage: null,
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

  /**
   * Auction rules. Amounts are in the marketplace currency's major units (e.g. rupees).
   * A running auction keeps a copy of the rules it was approved with.
   */
  auctions: {
    public: true,
    schema: z.object({
      enabled: z.boolean(),
      proxyBidding: z.boolean(),
      incrementTiers: z.array(z.object({ from: z.number().min(0), step: z.number().positive() })).min(1).max(20),
      minDurationHours: z.number().min(1).max(720),
      maxDurationDays: z.number().int().min(1).max(90),
      startLeadMinutes: z.number().int().min(0).max(1440),
      buyNowMinAbovePercent: z.number().min(0).max(500),
      sanityCapMultiplier: z.number().min(2).max(1000),
      bidIntervalSec: z.number().min(0).max(60),
      antiSniping: z.object({
        enabled: z.boolean(),
        windowSec: z.number().int().min(10).max(3600),
        extendSec: z.number().int().min(10).max(3600),
        maxExtensions: z.number().int().min(1).max(100),
      }),
      paymentWindowHours: z.number().int().min(1).max(720),
      offerWindowHours: z.number().int().min(1).max(720),
      strikes: z.object({
        blockAt: z.number().int().min(1).max(20),
        blockDays: z.number().int().min(1).max(365),
        banAt: z.number().int().min(2).max(50),
        expireMonths: z.number().int().min(1).max(60),
      }),
    }),
    initial: {
      enabled: true,
      proxyBidding: true,
      incrementTiers: [
        { from: 0, step: 50 },
        { from: 1000, step: 100 },
        { from: 10000, step: 500 },
        { from: 50000, step: 1000 },
        { from: 100000, step: 2500 },
        { from: 500000, step: 10000 },
        { from: 2500000, step: 25000 },
      ],
      minDurationHours: 1,
      maxDurationDays: 30,
      startLeadMinutes: 10,
      buyNowMinAbovePercent: 10,
      sanityCapMultiplier: 10,
      bidIntervalSec: 2,
      antiSniping: { enabled: true, windowSec: 120, extendSec: 120, maxExtensions: 10 },
      paymentWindowHours: 48,
      offerWindowHours: 24,
      strikes: { blockAt: 2, blockDays: 30, banAt: 3, expireMonths: 12 },
    },
  },

  /**
   * What the platform charges for. Amounts are major units (rupees). Lists start empty: the admin adds
   * the promotion packages and plans that are actually sold.
   */
  monetization: {
    public: true,
    schema: z.object({
      taxPercent: z.number().min(0).max(50),
      taxLabel: z.string().trim().min(1).max(20),
      listingFee: z.object({
        enabled: z.boolean(),
        freeAdsPer30Days: z.number().int().min(0).max(10000),
        fee: z.number().min(0).max(10_000_000),
        categoryOverrides: z
          .array(z.object({ categoryId: z.string().regex(/^[a-f0-9]{24}$/), freeAdsPer30Days: z.number().int().min(0).max(10000), fee: z.number().min(0).max(10_000_000) }))
          .max(200),
      }),
      promotions: z
        .array(
          z.object({
            code: z.string().regex(/^[a-z0-9_-]{2,40}$/, 'Use lowercase letters, numbers, - or _'),
            type: z.enum(['featured', 'top', 'urgent', 'bump']),
            name: z.string().trim().min(2).max(60),
            days: z.number().int().min(0).max(365),
            price: z.number().positive().max(10_000_000),
          })
        )
        .max(50),
      plans: z
        .array(
          z.object({
            code: z.string().regex(/^[a-z0-9_-]{2,40}$/, 'Use lowercase letters, numbers, - or _'),
            name: z.string().trim().min(2).max(60),
            description: z.string().trim().max(300).nullable(),
            price: z.number().positive().max(10_000_000),
            days: z.number().int().min(1).max(3650),
            extraFreeAds: z.number().int().min(0).max(100000),
          })
        )
        .max(20),
      auctionCommission: z.object({
        enabled: z.boolean(),
        percent: z.number().min(0).max(50),
        minFee: z.number().min(0),
        maxFee: z.number().min(0), // 0 = no cap
        dueDays: z.number().int().min(1).max(90),
        blockWhenOverdue: z.boolean(),
      }),
    }),
    initial: {
      taxPercent: 18,
      taxLabel: 'GST',
      listingFee: { enabled: false, freeAdsPer30Days: 5, fee: 0, categoryOverrides: [] },
      promotions: [],
      plans: [],
      auctionCommission: { enabled: false, percent: 2, minFee: 0, maxFee: 0, dueDays: 7, blockWhenOverdue: true },
    },
  },

  /**
   * Content rules applied to ads, auctions and chat, plus what users can report.
   * The report reasons below are starting wording — the admin edits them.
   */
  moderation: {
    public: true,
    schema: z.object({
      blockedWords: z.array(z.string().trim().min(2).max(60)).max(2000), // refused outright
      reviewWords: z.array(z.string().trim().min(2).max(60)).max(2000), // allowed, but the ad waits for review
      blockPhonesInText: z.boolean(), // phone numbers typed into titles/descriptions
      blockLinksInText: z.boolean(),
      reportAutoHideThreshold: z.number().int().min(0).max(100), // 0 = never auto-hide
      reportReasons: z.object({
        listing: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
        user: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
        message: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
      }),
    }),
    initial: {
      blockedWords: [],
      reviewWords: [],
      blockPhonesInText: true,
      blockLinksInText: true,
      reportAutoHideThreshold: 3,
      reportReasons: {
        listing: ['Fraud or scam', 'Prohibited or illegal item', 'Wrong category', 'Offensive content', 'Duplicate ad', 'Already sold', 'Other'],
        user: ['Fraud or scam', 'Abusive behaviour', 'Fake profile', 'Spam', 'Other'],
        message: ['Fraud or scam', 'Abusive or threatening', 'Spam', 'Asking for advance payment', 'Other'],
      },
    },
  },

  /** Help desk: how fast each kind of case must be answered, and the grievance officer (IT Rules 2021). */
  support: {
    public: true,
    schema: z.object({
      ackHours: z.number().int().min(1).max(168),
      resolveHours: z.object({
        support: z.number().int().min(1).max(2160),
        grievance: z.number().int().min(1).max(2160),
        fraud: z.number().int().min(1).max(2160),
        appeal: z.number().int().min(1).max(2160),
      }),
      grievanceOfficer: z.object({ name: nullableText(80), email: z.string().email().nullable(), phone: nullableText(20), address: nullableText(300) }),
    }),
    initial: {
      ackHours: 24,
      resolveHours: { support: 72, grievance: 360, fraud: 72, appeal: 168 },
      grievanceOfficer: { name: null, email: null, phone: null, address: null },
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
