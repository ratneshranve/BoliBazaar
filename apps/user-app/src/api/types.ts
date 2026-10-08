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
  languages: { default: string; items: { code: string; name: string; nativeName: string; rtl: boolean }[] };
  legal: {
    terms: { version: number | null };
    privacy: { version: number | null };
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
  homeLocation?: { leafId: string; leafType: string; displayName: string } | null;
  status: string;
  suspendedUntil: string | null;
  profileCompleted: boolean;
  ageConfirmed: boolean;
  createdAt: string;
};

/** Terms / Privacy / Support text, managed in Admin › Content Pages */
export type ContentPage = { slug: 'terms' | 'privacy' | 'support'; title: string; body: string; language: string; version: number; updatedAt: string };

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  icon: string | null;
  image: string | null;
  order: number;
  listingTypes: string[];
  children: CategoryNode[];
};

export type Banner = { id: string; image: string; title: string | null; subtitle: string | null; action: { type: 'none' } | { type: 'category'; categoryId: string } };

export type HomeFeed = {
  banners: Banner[];
  categories: (Omit<CategoryNode, 'children'> & { hasChildren: boolean })[];
};

export type PlaceLite = { id: string; type: string; name: string; path: string; countryCode?: string; parentId: string | null; geo: { lat: number; lng: number } | null };
export type PlaceNode = PlaceLite & { aliases: string[]; pinCodes: string[]; status: string; childCount: number };

export type CurrentPlace = { id: string; name: string; path: string; type: string };

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
