/**
 * Design tokens taken from the approved UI mockups (docs/18-build-phases.md › UI tokens).
 * Structural styling only — brand name/logo/images always come from the API.
 */
export const colors = {
  primary: '#A41030',
  primaryDark: '#820C26',
  primarySoft: '#FBE9ED',
  sell: '#0E9F6E',
  sellSoft: '#E5F6EF',
  auction: '#00509A',
  auctionBlue: '#0058A4',
  auctionSoft: '#E6F0FA',
  // the two logo colours: crimson (primary) + blue (brand), and the green divider line
  brand: '#00509A',
  brandSoft: '#E6F0FA',
  warm: '#F97316',
  warmSoft: '#FFF4E8',
  live: '#DC2626',
  verified: '#16A34A',
  star: '#F59E0B',

  text: '#111827',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F1F2F4',
  bg: '#FFFFFF',
  surface: '#F7F8FA',
  overlay: 'rgba(17,24,39,0.5)',
  white: '#FFFFFF',
  danger: '#DC2626',
  warning: '#D97706',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  small: { fontSize: 11, lineHeight: 15, fontWeight: '500' as const },
  price: { fontSize: 20, lineHeight: 26, fontWeight: '800' as const },
};

export const shadow = {
  card: {
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};
