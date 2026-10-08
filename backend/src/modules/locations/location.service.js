import { z } from 'zod';
import { Location, LOCATION_TYPES, ALLOWED_PARENTS } from './location.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { escapeRegex } from '../../core/utils/http.js';
import { slugify } from '../categories/category.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const pin = z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/);

export const locationInput = z.object({
  type: z.enum(LOCATION_TYPES),
  name: z.string().trim().min(1).max(120),
  parentId: objectId.nullable().default(null),
  countryCode: z.string().length(2).toUpperCase().optional(), // required for countries
  aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  pinCodes: z.array(pin).max(30).default([]),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const lc = (s) => s.toLocaleLowerCase();

const geoFrom = ({ lat, lng }) =>
  typeof lat === 'number' && typeof lng === 'number' ? { type: 'Point', coordinates: [lng, lat] } : undefined;

/** Names from the leaf up to the country, e.g. "Bagbahara, Mahasamund, Chhattisgarh, India". */
const buildPath = async (name, ancestors) => {
  if (!ancestors.length) return name;
  const docs = await Location.find({ _id: { $in: ancestors } }).select('name').lean();
  const byId = new Map(docs.map((d) => [String(d._id), d.name]));
  return [name, ...[...ancestors].reverse().map((id) => byId.get(String(id))).filter(Boolean)].join(', ');
};

const uniqueSlug = async (name, parentId, ignoreId) => {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i += 1) {
    const clash = await Location.exists({ parentId, slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
};

const parentContext = async (type, parentId) => {
  if (type === 'country') {
    if (parentId) throw ApiError.badRequest('INVALID_PARENT', 'A country has no parent');
    return { ancestors: [], countryCode: undefined };
  }
  if (!parentId) throw ApiError.badRequest('INVALID_PARENT', `A ${type} needs a parent`);
  const parent = await Location.findById(parentId).lean();
  if (!parent) throw ApiError.badRequest('PARENT_NOT_FOUND', 'Parent location does not exist');
  if (!ALLOWED_PARENTS[type].includes(parent.type)) {
    throw ApiError.badRequest('INVALID_PARENT', `A ${type} cannot be placed under a ${parent.type}`);
  }
  return { ancestors: [...parent.ancestors, parent._id], countryCode: parent.countryCode };
};

const apply = (doc, input) => {
  doc.name = input.name;
  doc.nameLc = lc(input.name);
  doc.aliases = input.aliases;
  doc.aliasesLc = input.aliases.map(lc);
  doc.pinCodes = input.pinCodes;
  doc.status = input.status;
  const geo = geoFrom(input);
  doc.geo = geo;
  if (input.lat === null || input.lng === null) doc.geo = undefined;
};

export const createLocation = async (input, source = 'admin') => {
  if (input.type === 'country' && !input.countryCode) {
    throw ApiError.badRequest('VALIDATION_FAILED', 'Country code is required for a country', { fields: { countryCode: 'Required' } });
  }
  const ctx = await parentContext(input.type, input.parentId);
  const doc = new Location({
    type: input.type,
    parentId: input.parentId,
    ancestors: ctx.ancestors,
    countryCode: input.type === 'country' ? input.countryCode : ctx.countryCode,
    slug: await uniqueSlug(input.name, input.parentId),
    source,
  });
  apply(doc, input);
  doc.path = await buildPath(doc.name, ctx.ancestors);
  await doc.save();
  return doc;
};

/** Rename / edit. Renaming refreshes the stored display path of everything beneath. */
export const updateLocation = async (id, input) => {
  const doc = await Location.findById(id);
  if (!doc) throw ApiError.notFound('LOCATION_NOT_FOUND');
  if (input.type !== doc.type) throw ApiError.badRequest('TYPE_LOCKED', 'The type of a location cannot be changed');
  if (String(doc.parentId || '') !== String(input.parentId || '')) {
    throw ApiError.badRequest('MOVE_NOT_SUPPORTED', 'Moving a location to another parent is not supported yet');
  }
  const before = doc.toObject();
  const renamed = doc.name !== input.name;
  apply(doc, input);
  if (renamed) doc.slug = await uniqueSlug(input.name, doc.parentId, doc._id);
  if (input.type === 'country' && input.countryCode) doc.countryCode = input.countryCode;
  doc.path = await buildPath(doc.name, doc.ancestors);
  await doc.save();

  if (renamed) {
    const kids = await Location.find({ ancestors: doc._id }).sort({ ancestors: 1 });
    for (const k of kids) {
      k.path = await buildPath(k.name, k.ancestors);
      await k.save();
    }
  }
  return { before, doc };
};

export const deleteLocation = async (id) => {
  const doc = await Location.findById(id);
  if (!doc) throw ApiError.notFound('LOCATION_NOT_FOUND');
  if (await Location.exists({ parentId: doc._id })) throw ApiError.conflict('LOCATION_HAS_CHILDREN', 'Remove or deactivate the places inside it first');
  // Phase 3 adds: block when listings or users reference it.
  await doc.deleteOne();
  return doc.toObject();
};

/* ───── reading ───── */

export const locationDto = (l) => ({
  id: String(l._id),
  type: l.type,
  name: l.name,
  path: l.path,
  countryCode: l.countryCode,
  parentId: l.parentId ? String(l.parentId) : null,
  geo: l.geo?.coordinates ? { lat: l.geo.coordinates[1], lng: l.geo.coordinates[0] } : null,
});

export const adminLocationDto = (l, childCount) => ({
  ...locationDto(l),
  aliases: l.aliases,
  pinCodes: l.pinCodes,
  status: l.status,
  source: l.source,
  childCount,
});

const childCounts = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await Location.aggregate([{ $match: { parentId: { $in: ids } } }, { $group: { _id: '$parentId', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

/** Children of a place (or the countries when parentId is null). Admin also sees inactive ones. */
export const listChildren = async (parentId, { includeInactive = false } = {}) => {
  const filter = { parentId: parentId || null, ...(includeInactive ? {} : { status: 'active' }) };
  const docs = await Location.find(filter).sort({ name: 1 }).limit(2000).lean();
  const counts = await childCounts(docs.map((d) => d._id));
  return docs.map((d) => ({ ...adminLocationDto(d, counts.get(String(d._id)) || 0) }));
};

const TYPE_RANK = Object.fromEntries(LOCATION_TYPES.map((t, i) => [t, t === 'city' || t === 'village' ? 0 : t === 'locality' ? 1 : t === 'subdistrict' ? 2 : 3 + i]));

/** Search by place name (any language alias) or PIN code. */
export const searchLocations = async (q, { countryCode, includeInactive = false, limit = 20 } = {}) => {
  const term = lc(q.trim());
  if (term.length < 2) return [];
  const base = { ...(includeInactive ? {} : { status: 'active' }), type: { $ne: 'country' }, ...(countryCode ? { countryCode } : {}) };

  if (/^\d{4,10}$/.test(term)) {
    const byPin = await Location.find({ ...base, pinCodes: term }).limit(limit).lean();
    return byPin.map(locationDto);
  }

  const prefix = new RegExp(`^${escapeRegex(term)}`);
  const contains = new RegExp(escapeRegex(term));
  const first = await Location.find({ ...base, $or: [{ nameLc: prefix }, { aliasesLc: prefix }] }).limit(limit * 2).lean();
  let results = first;
  if (first.length < limit) {
    const have = new Set(first.map((d) => String(d._id)));
    const more = await Location.find({ ...base, _id: { $nin: [...have] }, $or: [{ nameLc: contains }, { aliasesLc: contains }] })
      .limit(limit - first.length)
      .lean();
    results = [...first, ...more];
  }
  results.sort((a, b) => Number(b.nameLc === term) - Number(a.nameLc === term) || TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.name.length - b.name.length);
  return results.slice(0, limit).map(locationDto);
};

/** Nearest known place to GPS coordinates (within 25 km), using our own data — no external geocoder. */
export const reverseGeocode = async (lat, lng) => {
  const rows = await Location.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceM',
        maxDistance: 25_000,
        spherical: true,
        query: { status: 'active', type: { $in: ['village', 'city', 'locality', 'subdistrict'] } },
      },
    },
    { $limit: 1 },
  ]);
  if (!rows[0]) return null;
  return { ...locationDto(rows[0]), distanceKm: Math.round(rows[0].distanceM / 100) / 10 };
};

export const getLocation = async (id) => {
  const l = await Location.findOne({ _id: id, status: 'active' }).lean();
  if (!l) throw ApiError.notFound('LOCATION_NOT_FOUND');
  return l;
};

/* ───── bulk import ───── */

export const importRow = z.object({
  country: z.string().trim().min(1).max(120),
  countryCode: z.string().length(2).toUpperCase(),
  state: z.string().trim().max(120).optional().default(''),
  district: z.string().trim().max(120).optional().default(''),
  subdistrict: z.string().trim().max(120).optional().default(''),
  place: z.string().trim().max(120).optional().default(''),
  placeType: z.enum(['city', 'village', 'locality']).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  pin: z.string().trim().max(10).optional().default(''),
});

/**
 * Each row gives the chain country → state → district → subdistrict → place.
 * Missing levels are skipped; existing places are reused (matched by parent + name + type).
 */
export const importRows = async (rows) => {
  const cache = new Map();
  const stats = { created: 0, existing: 0, errors: [] };

  const ensure = async (type, name, parent, extra = {}) => {
    const key = `${parent ? parent._id : 'root'}|${type}|${lc(name)}`;
    if (cache.has(key)) return cache.get(key);
    let doc = await Location.findOne({ parentId: parent ? parent._id : null, type, nameLc: lc(name) });
    if (doc) {
      stats.existing += 1;
    } else {
      doc = await createLocation(
        { type, name, parentId: parent ? String(parent._id) : null, countryCode: extra.countryCode, aliases: [], pinCodes: extra.pin ? [extra.pin] : [], lat: extra.lat ?? null, lng: extra.lng ?? null, status: 'active' },
        'import'
      );
      stats.created += 1;
    }
    if (extra.pin && !doc.pinCodes.includes(extra.pin)) {
      doc.pinCodes.push(extra.pin);
      await doc.save();
    }
    cache.set(key, doc);
    return doc;
  };

  for (const [i, row] of rows.entries()) {
    try {
      let node = await ensure('country', row.country, null, { countryCode: row.countryCode });
      if (row.state) node = await ensure('state', row.state, node);
      if (row.district) node = await ensure('district', row.district, node);
      if (row.subdistrict) node = await ensure('subdistrict', row.subdistrict, node);
      if (row.place) {
        if (!row.placeType) throw new Error('placeType is required when place is given');
        await ensure(row.placeType, row.place, node, { lat: row.lat, lng: row.lng, pin: row.pin });
      }
    } catch (err) {
      stats.errors.push({ row: i + 1, message: err.message });
    }
  }
  return stats;
};
