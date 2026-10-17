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
    street: find(c, 'route')?.long || null,
    // the most local named area first: "Risi Nagar" (neighbourhood) before "Talawali Chanda" (sub-locality)
    area: find(c, 'neighborhood', 'sublocality_level_2', 'sublocality_level_1', 'sublocality')?.long || null,
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
  street: z.string().max(200).nullable().optional(),
  formatted: z.string().max(300).nullable().optional(), // the full address line, e.g. from the map pin
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

/* ───── OpenStreetMap (Nominatim) Fallbacks ───── */

const osmReverse = async (lat, lng) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'BoliBazaar/1.0' } });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data.place_id) return null;
    const a = data.address || {};
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.subdistrict || null;
    const street = a.road || null;
    const formatted = (data.display_name || '').split(', ').filter((p) => p !== a.country).join(', ') || null;
    const city = a.city || a.town || a.village || a.municipality || null;
    const district = a.county || a.state_district || a.district || null;
    const state = a.state || null;
    const country = a.country || null;
    const countryCode = a.country_code ? a.country_code.toUpperCase() : null;
    const pin = a.postcode || null;
    const address = { street, formatted, area, city, district, state, country, countryCode, pin };
    if (address.countryCode) await assertCountryAllowed(address.countryCode);
    const name = area || city || district || data.name || '';
    return {
      placeId: `osm:${lat}:${lng}`,
      name,
      label: buildLabel(name, address),
      lat: Number(lat),
      lng: Number(lng),
      address,
    };
  } catch (err) {
    logger.warn('OSM reverse geocode fallback failed', { error: err.message });
    return null;
  }
};

const osmAutocomplete = async (input, allowedCountries = []) => {
  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&addressdetails=1&limit=6`;
    if (allowedCountries.length) {
      url += `&countrycodes=${allowedCountries.map((c) => c.toLowerCase()).join(',')}`;
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'BoliBazaar/1.0' } });
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data.map((item) => {
      const a = item.address || {};
      const primary = a.city || a.town || a.village || a.suburb || item.name || '';
      const parts = [a.county || a.state_district, a.state, a.country].filter(Boolean);
      const secondary = parts.join(', ');
      return {
        placeId: `osm:${item.lat}:${item.lon}`,
        primary,
        secondary,
      };
    });
  } catch (err) {
    logger.warn('OSM autocomplete fallback failed', { error: err.message });
    return [];
  }
};

/* ───── autocomplete ───── */

export const autocomplete = async (input, { sessionToken, lang, near } = {}) => {
  const { allowedCountries } = await locationSettings();
  if (integrations.maps.configured) {
    try {
      const body = {
        input,
        languageCode: lang || 'en',
        ...(sessionToken ? { sessionToken } : {}),
        // nearest results first, like the map pin search in the reference apps
        ...(near ? { origin: { latitude: near.lat, longitude: near.lng }, locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } } } : {}),
        ...(allowedCountries.length ? { includedRegionCodes: allowedCountries.map((c) => c.toLowerCase()) } : {}),
      };
      const res = await fetch(`${PLACES}/places:autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.suggestions) {
        return json.suggestions
          .filter((s) => s.placePrediction)
          .map((s) => {
            const p = s.placePrediction;
            return {
              placeId: p.placeId,
              primary: p.structuredFormat?.mainText?.text || p.text?.text || '',
              secondary: p.structuredFormat?.secondaryText?.text || '',
              distanceMeters: p.distanceMeters ?? null,
            };
          });
      }
      logger.warn('Google autocomplete failed, falling back to OSM', { status: res.status });
    } catch (e) {
      logger.warn('Google autocomplete error, falling back to OSM', { error: e.message });
    }
  }
  return osmAutocomplete(input, allowedCountries);
};

/* ───── place details (coordinates + address) ───── */

export const placeDetails = async (placeId, { sessionToken, lang } = {}) => {
  if (placeId && placeId.startsWith('osm:')) {
    const [, lat, lng] = placeId.split(':');
    const result = await osmReverse(lat, lng);
    if (!result) throw ApiError.notFound('PLACE_NOT_FOUND', 'Place not found');
    return result;
  }

  if (integrations.maps.configured) {
    try {
      const url = new URL(`${PLACES}/places/${encodeURIComponent(placeId)}`);
      url.searchParams.set('languageCode', lang || 'en');
      if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
      const res = await fetch(url, {
        headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' },
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) throw ApiError.notFound('PLACE_NOT_FOUND', 'Place not found');
      if (res.ok && json.id) {
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
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      logger.warn('Google place details failed', { error: e.message });
    }
  }

  throw ApiError.notFound('PLACE_NOT_FOUND', 'Place details unavailable');
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
  if (integrations.maps.configured) {
    try {
      // the nearest exact address (street / building) gives the area name, e.g. "Risi Nagar" rather than just "Indore"
      const hit = (await geocode(lat, lng, lang)) || (await geocode(lat, lng, lang, 'sublocality|locality|administrative_area_level_3'));
      if (hit) {
        const address = parseAddress(hit.address_components);
        address.formatted = (hit.formatted_address || '').split(', ').filter((p) => p !== address.country).join(', ') || null;
        if (address.countryCode) await assertCountryAllowed(address.countryCode);
        const name = address.area || address.city || address.district || '';
        return { placeId: hit.place_id, name, label: buildLabel(name, address), lat, lng, address };
      }
    } catch (e) {
      logger.warn('Google reverse geocode failed, falling back to OSM', { error: e.message });
    }
  }
  const fallback = await osmReverse(lat, lng);
  if (fallback) return fallback;
  return {
    placeId: `pin:${lat}:${lng}`,
    name: 'Selected location',
    label: `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
    lat: Number(lat),
    lng: Number(lng),
    address: {},
  };
};
