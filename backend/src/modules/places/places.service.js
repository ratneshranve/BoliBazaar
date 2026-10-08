import { z } from 'zod';
import { env, integrations } from '../../core/config/env.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { getSettingValue } from '../settings/settings.service.js';

/**
 * Places come from Google (Places API New + Geocoding API), called from the server so the key never
 * reaches the app. Results are not cached here: Google's terms limit storing place content.
 */
const PLACES = 'https://places.googleapis.com/v1';
const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';

const requireKey = () => {
  if (!integrations.maps.configured) throw ApiError.unavailable('MAPS_NOT_CONFIGURED', 'Set GOOGLE_MAPS_SERVER_KEY in backend .env');
};

const googleFail = (api, status, body) => {
  logger.error(`${api} request failed`, { status, message: body?.error?.message || body?.error_message || body?.status });
  return ApiError.unavailable('MAPS_UNAVAILABLE', 'Place search is temporarily unavailable');
};

export const locationSettings = () => getSettingValue('location');

/* ───── address parsing ───── */

/** Normalise Google components to { long, short, types }. */
const normalise = (components = []) =>
  components.map((c) => ({ long: c.longText ?? c.long_name, short: c.shortText ?? c.short_name, types: c.types || [] }));

const find = (list, ...types) => {
  for (const t of types) {
    const hit = list.find((c) => c.types.includes(t));
    if (hit) return hit;
  }
  return null;
};

export const parseAddress = (components) => {
  const c = normalise(components);
  const country = find(c, 'country');
  return {
    area: find(c, 'sublocality_level_1', 'sublocality', 'neighborhood')?.long || null,
    city: find(c, 'locality', 'postal_town', 'administrative_area_level_3')?.long || null,
    district: find(c, 'administrative_area_level_2')?.long || null,
    state: find(c, 'administrative_area_level_1')?.long || null,
    country: country?.long || null,
    countryCode: country?.short?.toUpperCase() || null,
    pin: find(c, 'postal_code')?.long || null,
  };
};

/** "Bagbahara, Mahasamund, Chhattisgarh" — the place's own name first, then wider areas. */
export const buildLabel = (name, address) => {
  const parts = [name, address.area, address.city, address.district, address.state].filter(Boolean);
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.slice(0, 3).join(', ') || address.country || '';
};

/** Reject places outside the countries the admin allows. */
const assertCountryAllowed = async (countryCode) => {
  const { allowedCountries } = await locationSettings();
  if (allowedCountries.length && !allowedCountries.includes(countryCode)) {
    throw ApiError.badRequest('LOCATION_COUNTRY_NOT_ALLOWED', 'This app is not available in that country yet', { allowedCountries });
  }
};

export const assertCountryAllowedPublic = assertCountryAllowed;

/* ───── a place as stored on users (and, from Phase 3, on listings) ───── */

const addressInput = z.object({
  area: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  district: z.string().max(120).nullable().optional(),
  state: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  pin: z.string().max(12).nullable().optional(),
});

export const placeInput = z.object({
  label: z.string().trim().min(1).max(200),
  name: z.string().trim().max(120).optional(),
  placeId: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: addressInput.optional(),
});

/** Validate against the admin's allowed countries and convert to the stored shape. */
export const toLocationRef = async (place) => {
  const countryCode = place.address?.countryCode?.toUpperCase();
  if (countryCode) await assertCountryAllowed(countryCode);
  return {
    label: place.label,
    name: place.name,
    placeId: place.placeId,
    countryCode,
    address: place.address,
    geo: { type: 'Point', coordinates: [place.lng, place.lat] },
  };
};

/* ───── autocomplete ───── */

export const autocomplete = async (input, { sessionToken, lang } = {}) => {
  requireKey();
  const { allowedCountries } = await locationSettings();
  const body = {
    input,
    languageCode: lang || 'en',
    ...(sessionToken ? { sessionToken } : {}),
    ...(allowedCountries.length ? { includedRegionCodes: allowedCountries.map((c) => c.toLowerCase()) } : {}),
  };
  const res = await fetch(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw googleFail('Places autocomplete', res.status, json);
  return (json.suggestions || [])
    .filter((s) => s.placePrediction)
    .map((s) => {
      const p = s.placePrediction;
      return {
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
      };
    });
};

/* ───── place details (coordinates + address) ───── */

export const placeDetails = async (placeId, { sessionToken, lang } = {}) => {
  requireKey();
  const url = new URL(`${PLACES}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set('languageCode', lang || 'en');
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  const res = await fetch(url, {
    headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 404) throw ApiError.notFound('PLACE_NOT_FOUND', 'Place not found');
  if (!res.ok) throw googleFail('Place details', res.status, json);

  const address = parseAddress(json.addressComponents);
  if (address.countryCode) await assertCountryAllowed(address.countryCode);
  const name = json.displayName?.text || address.city || address.district || '';
  return {
    placeId: json.id,
    name,
    label: buildLabel(name, address),
    lat: json.location.latitude,
    lng: json.location.longitude,
    address,
  };
};

/* ───── reverse geocoding (GPS / map pin → address) ───── */

const geocode = async (lat, lng, lang, resultType) => {
  const url = new URL(GEOCODE);
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('language', lang || 'en');
  if (resultType) url.searchParams.set('result_type', resultType);
  url.searchParams.set('key', env.GOOGLE_MAPS_SERVER_KEY);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !['OK', 'ZERO_RESULTS'].includes(json.status)) throw googleFail('Geocoding', res.status, json);
  return json.results?.[0] || null;
};

/** Address for a point. Prefers a village/town-level result, falls back to the closest address. */
export const reverseGeocode = async (lat, lng, { lang } = {}) => {
  requireKey();
  const hit =
    (await geocode(lat, lng, lang, 'sublocality|locality|administrative_area_level_3|administrative_area_level_2')) || (await geocode(lat, lng, lang));
  if (!hit) return null;
  const address = parseAddress(hit.address_components);
  if (address.countryCode) await assertCountryAllowed(address.countryCode);
  const name = address.area || address.city || address.district || '';
  return { placeId: hit.place_id, name, label: buildLabel(name, address), lat, lng, address };
};
