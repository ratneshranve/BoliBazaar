/** Price text. `price` is { type, amountMinor, currency, factor } from the API. */
export const formatPrice = (price, t, lang) => {
  if (!price) return '';
  if (price.type === 'on_request') return t('listing.onRequest');
  if (price.type === 'free') return t('listing.free');
  // decimals from the currency itself when the API did not send a factor
  const digits = price.factor ? Math.round(Math.log10(price.factor)) : new Intl.NumberFormat('en', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits;
  const factor = 10 ** digits;
  // Indian digit grouping (₹12,50,000) for INR, the app language elsewhere
  const locale = price.currency === 'INR' ? 'en-IN' : lang;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency, minimumFractionDigits: 0, maximumFractionDigits: digits }).format(price.amountMinor / factor);
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

/** "14:05" for today, otherwise "12 Mar". */
export const formatChatTime = (iso, lang) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
};
