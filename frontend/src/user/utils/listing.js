/** Price text. `price` is { type, amountMinor, currency, factor } from the API. */
export const formatPrice = (price, t, lang) => {
  if (!price) return '';
  if (price.type === 'on_request') return t('listing.onRequest');
  if (price.type === 'free') return t('listing.free');
  const digits = Math.round(Math.log10(price.factor));
  // Indian digit grouping (₹12,50,000) for INR, the app language elsewhere
  const locale = price.currency === 'INR' ? 'en-IN' : lang;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency, minimumFractionDigits: 0, maximumFractionDigits: digits }).format(price.amountMinor / price.factor);
};

/** The search/browse query for where the user is: { lat, lng, scope, radiusKm, district, state, countryCode }. */
export const locationQuery = (current) =>
  current
    ? {
        lat: current.lat,
        lng: current.lng,
        scope: current.scope?.type,
        radiusKm: current.scope?.type === 'radius' ? current.scope.km : undefined,
        district: current.address?.district || undefined,
        state: current.address?.state || undefined,
        countryCode: current.address?.countryCode || undefined,
      }
    : {};

export const formatDate = (iso, lang) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
