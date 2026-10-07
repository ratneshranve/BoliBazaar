export type MediaRef = { url: string; mediaId?: string } | null;

export type Branding = {
  appName: string | null;
  tagline: string | null;
  logo: MediaRef;
  logoDark: MediaRef;
  icon: MediaRef;
  primaryColor: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  whatsapp: string | null;
  website: string | null;
};

export type Bootstrap = {
  serverTime: string;
  branding: Branding;
  features: Record<string, boolean>;
  legal: {
    terms: { version: number | null; url: string | null };
    privacy: { version: number | null; url: string | null };
  };
  maintenance: { enabled: boolean; title?: string | null; message?: string | null; until?: string | null };
  update: { required: boolean; available: boolean; latestVersion: string | null; storeUrl: string | null };
  versions: Record<string, number>;
};

export type Me = {
  id: string;
  publicId: string;
  name: string | null;
  avatar: { url: string; mediaId: string | null } | null;
  about: string | null;
  phone: { e164: string; verified: boolean };
  email: { address: string; verified: boolean } | null;
  language: string | null;
  countryCode: string | null;
  timezone: string | null;
  sellerType: 'individual' | 'business';
  status: string;
  suspendedUntil: string | null;
  profileCompleted: boolean;
  ageConfirmed: boolean;
  createdAt: string;
};

export type OtpSent = { phone: string; length: number; expiresInSec: number; resendInSec: number };

export type LoginResult = { accessToken: string; refreshToken: string; refreshExpiresAt: string; isNewUser: boolean; user: Me };

export type SessionInfo = {
  id: string;
  current: boolean;
  platform?: string;
  deviceName?: string;
  appVersion?: string;
  lastUsedAt?: string;
  createdAt: string;
};
