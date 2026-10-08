import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { auctionSummaries } from '../auctions/auction.summary.js';
import { listingQuota, assertNoOverdueCommission } from '../payments/pricing.service.js';
import { Listing, Favourite } from './listing.model.js';
import { buildAttributesSchema } from './listing.schema.js';
import { Category } from '../categories/category.model.js';
import { translateForReader } from '../categories/category.service.js';
import { Media } from '../uploads/media.model.js';
import { User } from '../users/user.model.js';
import { toLocationRef } from '../places/places.service.js';
import { getSettingValue } from '../settings/settings.service.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { escapeRegex } from '../../core/utils/http.js';
import { redis } from '../../core/db/redis.js';

const { ObjectId } = mongoose.Types;
const DAY_MS = 24 * 60 * 60 * 1000;
const EARTH_KM = 6378.137;

/* ───────── helpers ───────── */

const newListingNo = () => `L${crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7).toUpperCase()}`;

export const minorFactor = (currency) => {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  return 10 ** digits;
};

/** Move a point by up to `offsetM` metres, always the same way for the same listing, so refreshing never reveals the real spot. */
export const shiftPoint = (lat, lng, offsetM, seed) => {
  if (!offsetM) return { lat, lng };
  const h = crypto.createHash('sha256').update(seed).digest();
  const angle = (h.readUInt32BE(0) / 0xffffffff) * 2 * Math.PI;
  const dist = offsetM * (0.4 + 0.6 * (h.readUInt32BE(4) / 0xffffffff));
  return {
    lat: lat + (dist * Math.cos(angle)) / 111_320,
    lng: lng + (dist * Math.sin(angle)) / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180))),
  };
};

export const haversineKm = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
};

const optionLabel = (attr, value) => attr.options?.find((o) => o.value === value)?.label ?? String(value);

/** English display text for one attribute value. */
const displayValue = (attr, value) => {
  if (value === undefined || value === null || value === '') return null;
  switch (attr.type) {
    case 'select':
      return optionLabel(attr, value);
    case 'multiselect':
      return value.map((v) => optionLabel(attr, v)).join(', ');
    case 'boolean':
      return value ? 'Yes' : null;
    case 'number':
      return attr.unit ? `${Number(value).toLocaleString('en-IN')} ${attr.unit}` : Number(value).toLocaleString('en-IN');
    default:
      return String(value);
  }
};

const searchTextOf = (title, description, category, attributes) =>
  [title, description, category.name, ...category.attributes.map((a) => displayValue(a, attributes?.[a.key]))].filter(Boolean).join(' ').toLowerCase();

const effectiveStatus = (l) => (l.status === 'published' && l.expiresAt && l.expiresAt < new Date() ? 'expired' : l.status);

/* ───────── create / edit ───────── */

/** Validate an input against the category rules and build the stored fields (shared by create and edit). */
const prepare = async (input, ownerId, listingId, { auction = false } = {}) => {
  const category = await Category.findOne({ _id: input.categoryId, status: 'active' }).lean();
  if (!category) throw ApiError.badRequest('CATEGORY_NOT_AVAILABLE', 'This category is not available');
  if (await Category.exists({ parentId: category._id })) throw ApiError.badRequest('CATEGORY_NOT_LEAF', 'Choose the most specific category');
  if (input.listingType === 'auction' && !auction) throw ApiError.badRequest('USE_AUCTION_FLOW', 'Create auctions from the auctions screen');
  if (category.listingTypes.length && !category.listingTypes.includes(input.listingType)) {
    throw ApiError.badRequest('LISTING_TYPE_NOT_ALLOWED', 'This category does not allow that type of ad');
  }

  const parsed = buildAttributesSchema(category.attributes).safeParse(input.attributes);
  if (!parsed.success) {
    const fields = {};
    parsed.error.issues.forEach((i) => {
      fields[`attributes.${i.path.join('.')}`] = i.message;
    });
    throw ApiError.badRequest('VALIDATION_FAILED', 'Please check the highlighted fields', { fields });
  }
  const attributes = parsed.data;

  const mediaIds = [...new Set(input.mediaIds)];
  const media = mediaIds.length
    ? await Media.find({ _id: { $in: mediaIds }, ownerType: 'user', ownerId, purpose: 'listing', visibility: 'public', status: 'ready' }).lean()
    : [];
  if (media.length !== mediaIds.length) throw ApiError.badRequest('MEDIA_INVALID', 'One of the photos was not found — please upload it again');
  const { minPhotos, maxPhotos } = category.rules;
  if (mediaIds.length < minPhotos) throw ApiError.badRequest('PHOTOS_REQUIRED', `Add at least ${minPhotos} photo${minPhotos === 1 ? '' : 's'}`, { min: minPhotos });
  if (mediaIds.length > maxPhotos) throw ApiError.badRequest('TOO_MANY_PHOTOS', `At most ${maxPhotos} photos`, { max: maxPhotos });
  const byId = new Map(media.map((m) => [String(m._id), m]));
  const orderedMedia = mediaIds.map((id) => ({ mediaId: byId.get(id)._id, url: byId.get(id).url }));

  const { currency } = await getSettingValue('marketplace');
  const factor = minorFactor(currency);
  const amountMinor = input.price.type === 'free' ? 0 : input.price.amount !== undefined ? Math.round(input.price.amount * factor) : undefined;

  const location = await toLocationRef(input.location);
  const { publicOffsetMeters } = await getSettingValue('location');
  const pub = shiftPoint(input.location.lat, input.location.lng, publicOffsetMeters, `${listingId}:${ownerId}`);

  return {
    category,
    fields: {
      categoryId: category._id,
      categoryPath: [...category.ancestors, category._id],
      listingType: input.listingType,
      title: input.title,
      description: input.description,
      condition: input.condition,
      attributes,
      price: { type: input.price.type, amountMinor, currency },
      media: orderedMedia,
      location,
      publicGeo: { type: 'Point', coordinates: [pub.lng, pub.lat] },
      searchText: searchTextOf(input.title, input.description, category, attributes),
    },
  };
};

export const createListing = async (ownerId, input) => {
  const _id = new ObjectId();
  await assertNoOverdueCommission(ownerId);
  const { category, fields } = await prepare(input, ownerId, String(_id));
  const quota = await listingQuota(ownerId, fields.categoryPath);
  if (quota.needsPayment) {
    // over the free limit: the ad waits for the posting fee (Payments › listing_fee)
    return Listing.create({ _id, listingNo: newListingNo(), ownerId, ...fields, status: 'payment_pending' });
  }
  const publish = !category.rules.requiresReview;
  const now = new Date();
  return Listing.create({
    _id,
    listingNo: newListingNo(),
    ownerId,
    ...fields,
    status: publish ? 'published' : 'pending_review',
    ...(publish ? { publishedAt: now, expiresAt: new Date(now.getTime() + category.rules.validityDays * DAY_MS) } : {}),
  });
};

/** The item behind an auction. Always reviewed; the auction fixes its own start and end, so there is no expiry here. */
export const createAuctionItem = async (ownerId, input) => {
  const _id = new ObjectId();
  const { fields } = await prepare({ ...input, listingType: 'auction' }, ownerId, String(_id), { auction: true });
  return Listing.create({ _id, listingNo: newListingNo(), ownerId, ...fields, status: 'pending_review' });
};

/** Rewrite the item of an auction that is still being reviewed. */
export const updateAuctionItem = async (doc, ownerId, input) => {
  const { fields } = await prepare({ ...input, listingType: 'auction' }, ownerId, String(doc._id), { auction: true });
  Object.assign(doc, fields);
  doc.markModified('attributes');
  await doc.save();
  return doc;
};

export const updateListing = async (ownerId, id, input) => {
  const doc = await Listing.findOne({ _id: id, ownerId });
  if (!doc || ['deleted', 'removed'].includes(doc.status)) throw ApiError.notFound('LISTING_NOT_FOUND');
  if (doc.listingType === 'auction') throw ApiError.badRequest('USE_AUCTION_FLOW', 'Manage auctions from the auctions screen');
  if (doc.status === 'sold') throw ApiError.badRequest('LISTING_SOLD', 'A sold ad cannot be edited');
  if (String(doc.categoryId) !== input.categoryId) throw ApiError.badRequest('CATEGORY_LOCKED', 'Post a new ad to change the category');

  const { category, fields } = await prepare(input, ownerId, String(doc._id));
  Object.assign(doc, fields);
  if (category.rules.requiresReview) {
    // edits to a reviewed category go back through moderation; the ad is hidden until approved
    doc.status = 'pending_review';
    doc.moderation = undefined;
  } else if (doc.status === 'rejected') {
    const now = new Date();
    doc.status = 'published';
    doc.publishedAt = now;
    doc.expiresAt = new Date(now.getTime() + category.rules.validityDays * DAY_MS);
  }
  doc.markModified('attributes');
  await doc.save();
  return doc;
};

const ownerListing = async (ownerId, id) => {
  const doc = await Listing.findOne({ _id: id, ownerId });
  if (!doc || doc.status === 'deleted') throw ApiError.notFound('LISTING_NOT_FOUND');
  if (doc.listingType === 'auction') throw ApiError.badRequest('USE_AUCTION_FLOW', 'Manage auctions from the auctions screen');
  return doc;
};

export const pauseListing = async (ownerId, id) => {
  const doc = await ownerListing(ownerId, id);
  if (effectiveStatus(doc) !== 'published') throw ApiError.badRequest('INVALID_STATE', 'Only a live ad can be paused');
  doc.status = 'paused';
  return doc.save();
};

export const resumeListing = async (ownerId, id) => {
  const doc = await ownerListing(ownerId, id);
  if (doc.status !== 'paused') throw ApiError.badRequest('INVALID_STATE', 'Only a paused ad can be resumed');
  if (doc.expiresAt && doc.expiresAt < new Date()) throw ApiError.badRequest('LISTING_EXPIRED', 'This ad has expired — renew it instead');
  doc.status = 'published';
  return doc.save();
};

export const markSold = async (ownerId, id) => {
  const doc = await ownerListing(ownerId, id);
  if (!['published', 'paused'].includes(doc.status)) throw ApiError.badRequest('INVALID_STATE', 'Only a live or paused ad can be marked sold');
  doc.status = 'sold';
  doc.soldAt = new Date();
  return doc.save();
};

export const renewListing = async (ownerId, id) => {
  const doc = await ownerListing(ownerId, id);
  if (effectiveStatus(doc) !== 'expired') throw ApiError.badRequest('INVALID_STATE', 'Only an expired ad can be renewed');
  const category = await Category.findById(doc.categoryId).lean();
  if (!category || category.status !== 'active') throw ApiError.badRequest('CATEGORY_NOT_AVAILABLE', 'This category is no longer available');
  if (category.rules.requiresReview) {
    doc.status = 'pending_review';
    doc.moderation = undefined;
  } else {
    const now = new Date();
    doc.status = 'published';
    doc.publishedAt = now;
    doc.expiresAt = new Date(now.getTime() + category.rules.validityDays * DAY_MS);
  }
  return doc.save();
};

export const deleteListing = async (ownerId, id) => {
  const doc = await ownerListing(ownerId, id);
  doc.status = 'deleted';
  await doc.save();
  await Favourite.deleteMany({ listingId: doc._id });
};

/* ───────── DTOs ───────── */

const shortPlace = (loc) => {
  const a = loc?.address || {};
  return [a.area || a.city, a.district].filter(Boolean).join(', ') || loc?.label || '';
};

const priceDto = (p) => ({ type: p.type, amountMinor: p.amountMinor ?? null, currency: p.currency, factor: minorFactor(p.currency) });

/** Cards in lists. `ctx` carries categories, favourites and the viewer's point. */
export const cardDtos = async (docs, { lang, viewerPoint, favourites = new Set(), withStatus = false } = {}) => {
  const categoryIds = [...new Set(docs.map((d) => String(d.categoryId)))];
  const cats = new Map((await Category.find({ _id: { $in: categoryIds } }).select('attributes').lean()).map((c) => [String(c._id), c]));

  // up to 3 highlighted fields per card (labels translated for the reader)
  const raw = docs.map((d) => {
    const cat = cats.get(String(d.categoryId));
    return (cat?.attributes || [])
      .filter((a) => a.showOnCard)
      .map((a) => displayValue(a, d.attributes?.[a.key]))
      .filter(Boolean)
      .slice(0, 3);
  });
  const flat = raw.flat();
  const translated = await translateForReader(flat, lang);
  let i = 0;
  const auctions = await auctionSummaries(docs.filter((d) => d.listingType === 'auction').map((d) => d._id));

  return docs.map((d, idx) => {
    const highlights = raw[idx].map(() => translated[i++]);
    const pub = d.publicGeo?.coordinates;
    const distanceKm = viewerPoint && pub ? Math.round(haversineKm(viewerPoint, { lat: pub[1], lng: pub[0] }) * 10) / 10 : (d.distanceM !== undefined ? Math.round(d.distanceM / 100) / 10 : null);
    return {
      id: String(d._id),
      listingNo: d.listingNo,
      listingType: d.listingType,
      title: d.title,
      price: priceDto(d.price),
      condition: d.condition || null,
      cover: d.media?.[0]?.url || null,
      photoCount: d.media?.length || 0,
      place: shortPlace(d.location),
      distanceKm,
      highlights,
      publishedAt: d.publishedAt || null,
      isFavourite: favourites.has(String(d._id)),
      badges: ['top', 'featured', 'urgent'].filter((k) => d.promo?.[`${k}Until`] && new Date(d.promo[`${k}Until`]) > new Date()),
      ...(d.listingType === 'auction' ? { auction: auctions.get(String(d._id)) || null } : {}),
      ...(withStatus
        ? { status: effectiveStatus(d), rejectReason: d.status === 'rejected' ? d.moderation?.reason || null : null, expiresAt: d.expiresAt || null, stats: d.stats }
        : {}),
    };
  });
};

const favouriteSet = async (userId, docs) => {
  if (!userId || !docs.length) return new Set();
  const rows = await Favourite.find({ userId, listingId: { $in: docs.map((d) => d._id) } }).select('listingId').lean();
  return new Set(rows.map((r) => String(r.listingId)));
};

/* ───────── search ───────── */

const attributeFilters = async (categoryId, raw) => {
  if (!raw || !categoryId) return {};
  let filters;
  try {
    filters = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('VALIDATION_FAILED', 'Invalid filters');
  }
  const category = await Category.findById(categoryId).select('attributes').lean();
  const out = {};
  for (const attr of category?.attributes || []) {
    const f = filters?.[attr.key];
    if (!f || !attr.filterable) continue;
    const path = `attributes.${attr.key}`;
    if (['number', 'year'].includes(attr.type)) {
      const r = {};
      if (Number.isFinite(f.min)) r.$gte = f.min;
      if (Number.isFinite(f.max)) r.$lte = f.max;
      if (Object.keys(r).length) out[path] = r;
    } else if (Array.isArray(f.in) && f.in.length) {
      out[path] = { $in: f.in.map(String).slice(0, 50) };
    } else if (f.eq !== undefined) {
      out[path] = typeof f.eq === 'boolean' ? f.eq : String(f.eq);
    }
  }
  return out;
};

export const searchListings = async (query, { viewerId, lang, featuredOnly = false } = {}) => {
  const now = new Date();
  const match = { status: 'published', expiresAt: { $gt: now } };
  if (featuredOnly) match['promo.featuredUntil'] = { $gt: now };

  for (const token of (query.q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    (match.$and ||= []).push({ searchText: new RegExp(escapeRegex(token)) });
  }
  if (query.categoryId) match.categoryPath = new ObjectId(query.categoryId);
  if (query.listingType) match.listingType = query.listingType;
  if (query.condition) match.condition = query.condition;

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const { currency } = await getSettingValue('marketplace');
    const f = minorFactor(currency);
    match['price.amountMinor'] = {
      ...(query.priceMin !== undefined ? { $gte: Math.round(query.priceMin * f) } : {}),
      ...(query.priceMax !== undefined ? { $lte: Math.round(query.priceMax * f) } : {}),
    };
  }
  Object.assign(match, await attributeFilters(query.categoryId, query.filters));

  // where, and how far
  const hasPoint = query.lat !== undefined && query.lng !== undefined;
  const radiusScope = hasPoint && query.scope === 'radius' && query.radiusKm;
  const ci = (s) => new RegExp(`^${escapeRegex(s)}$`, 'i');
  if (query.scope === 'district' && query.district) {
    match['location.address.district'] = ci(query.district);
    if (query.state) match['location.address.state'] = ci(query.state);
    if (query.countryCode) match['location.address.countryCode'] = query.countryCode;
  } else if (query.scope === 'state' && query.state) {
    match['location.address.state'] = ci(query.state);
    if (query.countryCode) match['location.address.countryCode'] = query.countryCode;
  } else if (query.scope === 'country' && query.countryCode) {
    match['location.address.countryCode'] = query.countryCode;
  }

  const skip = (query.page - 1) * query.limit;
  const take = query.limit + 1; // one extra row tells us whether there is another page
  let docs;

  if (query.sort === 'nearest' && hasPoint) {
    docs = await Listing.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [query.lng, query.lat] },
          distanceField: 'distanceM',
          spherical: true,
          query: match,
          ...(radiusScope ? { maxDistance: query.radiusKm * 1000 } : {}),
        },
      },
      { $skip: skip },
      { $limit: take },
    ]);
  } else {
    if (radiusScope) match.publicGeo = { $geoWithin: { $centerSphere: [[query.lng, query.lat], query.radiusKm / EARTH_KM] } };
    const sort = query.sort === 'price_asc' ? { 'price.amountMinor': 1, _id: 1 } : query.sort === 'price_desc' ? { 'price.amountMinor': -1, _id: 1 } : { publishedAt: -1, _id: -1 };
    docs = await Listing.find(match).sort(sort).skip(skip).limit(take).lean();
    if (query.page === 1 && query.sort === 'newest' && !featuredOnly) {
      const tops = await Listing.aggregate([{ $match: { ...match, 'promo.topUntil': { $gt: now } } }, { $sample: { size: 2 } }]); // rotate among top advertisers
      const topIds = new Set(tops.map((t) => String(t._id)));
      docs = [...tops, ...docs.filter((d) => !topIds.has(String(d._id)))];
    }
  }

  const hasMore = docs.length > query.limit;
  docs = docs.slice(0, query.limit);
  const items = await cardDtos(docs, { lang, viewerPoint: hasPoint ? { lat: query.lat, lng: query.lng } : null, favourites: await favouriteSet(viewerId, docs) });
  return { items, page: query.page, hasMore };
};

/* ───────── detail ───────── */

export const listingDetail = async (id, { viewerId, lang, viewerPoint } = {}) => {
  const d = await Listing.findById(id).lean();
  if (!d || d.status === 'deleted') throw ApiError.notFound('LISTING_NOT_FOUND', 'This ad is no longer available');
  const isOwner = viewerId && String(d.ownerId) === String(viewerId);
  const status = effectiveStatus(d);
  // others only see live and sold ads
  const wasLiveAuction = d.listingType === 'auction' && d.publishedAt && ['published', 'sold', 'expired'].includes(d.status);
  if (!isOwner && !wasLiveAuction && !['published', 'sold'].includes(status)) throw ApiError.notFound('LISTING_NOT_FOUND', 'This ad is no longer available');

  const [category, owner, favs] = await Promise.all([
    Category.findById(d.categoryId).lean(),
    User.findById(d.ownerId).select('publicId name avatar createdAt phone.verifiedAt').lean(),
    favouriteSet(viewerId, [d]),
  ]);
  const pathDocs = category ? await Category.find({ _id: { $in: d.categoryPath } }).select('name depth').sort({ depth: 1 }).lean() : [];

  const defs = (category?.attributes || []).filter((a) => displayValue(a, d.attributes?.[a.key]) !== null);
  const texts = [...pathDocs.map((p) => p.name), ...defs.map((a) => a.label), ...defs.map((a) => displayValue(a, d.attributes[a.key]))];
  const tr = await translateForReader(texts, lang);
  const pathNames = tr.slice(0, pathDocs.length);
  const labels = tr.slice(pathDocs.length, pathDocs.length + defs.length);
  const values = tr.slice(pathDocs.length + defs.length);

  const pub = d.publicGeo?.coordinates;
  const [card] = await cardDtos([d], { lang, viewerPoint, favourites: favs, withStatus: true });
  return {
    ...card,
    status,
    description: d.description,
    media: (d.media || []).map((m) => m.url),
    attributes: defs.map((a, i) => ({ key: a.key, label: labels[i], value: values[i] })),
    category: pathDocs.map((p, i) => ({ id: String(p._id), name: pathNames[i] })),
    // other users get the shifted point only; the owner also sees where they put the pin
    location: {
      label: d.location?.label,
      place: shortPlace(d.location),
      lat: pub?.[1] ?? null,
      lng: pub?.[0] ?? null,
      ...(isOwner ? { exactLat: d.location?.geo?.coordinates?.[1], exactLng: d.location?.geo?.coordinates?.[0] } : {}),
    },
    seller: owner
      ? { publicId: owner.publicId, name: owner.name || null, avatar: owner.avatar?.url || null, memberSince: owner.createdAt, phoneVerified: Boolean(owner.phone?.verifiedAt) }
      : null,
    isOwner: Boolean(isOwner),
    stats: isOwner ? d.stats : undefined,
  };
};

/** The owner's own copy for editing (exact location, raw attribute values, media ids). */
export const listingForEdit = async (ownerId, id) => {
  const d = await Listing.findOne({ _id: id, ownerId }).lean();
  if (!d || ['deleted', 'removed'].includes(d.status)) throw ApiError.notFound('LISTING_NOT_FOUND');
  const factor = minorFactor(d.price.currency);
  return {
    id: String(d._id),
    categoryId: String(d.categoryId),
    listingType: d.listingType,
    title: d.title,
    description: d.description,
    condition: d.condition || null,
    price: { type: d.price.type, amount: d.price.amountMinor != null ? d.price.amountMinor / factor : null },
    attributes: d.attributes || {},
    media: (d.media || []).map((m) => ({ mediaId: String(m.mediaId), url: m.url })),
    location: {
      label: d.location.label,
      name: d.location.name,
      placeId: d.location.placeId,
      address: d.location.address,
      lat: d.location.geo.coordinates[1],
      lng: d.location.geo.coordinates[0],
    },
    status: effectiveStatus(d),
  };
};

export const myListings = async (ownerId, { status, page = 1, limit = 20, lang }) => {
  const match = { ownerId: new ObjectId(ownerId), status: { $ne: 'deleted' } };
  const now = new Date();
  if (status === 'active') Object.assign(match, { status: 'published', expiresAt: { $gt: now } });
  else if (status === 'expired') Object.assign(match, { $or: [{ status: 'expired' }, { status: 'published', expiresAt: { $lte: now } }] });
  else if (status) match.status = status;
  const docs = await Listing.find(match).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const items = await cardDtos(docs.slice(0, limit), { lang, withStatus: true });
  return { items, page, hasMore };
};

/* ───────── views & favourites ───────── */

export const recordView = async (id, actorKey, ownerId) => {
  const listing = await Listing.findOne({ _id: id, status: 'published' }).select('ownerId').lean();
  if (!listing || (ownerId && String(listing.ownerId) === String(ownerId))) return;
  const first = await redis.set(`lv:${id}:${actorKey}`, '1', 'EX', 24 * 60 * 60, 'NX');
  if (first) await Listing.updateOne({ _id: id }, { $inc: { 'stats.views': 1 } });
};

export const addFavourite = async (userId, listingId) => {
  const l = await Listing.findOne({ _id: listingId, status: { $in: ['published', 'sold'] } }).select('price').lean();
  if (!l) throw ApiError.notFound('LISTING_NOT_FOUND', 'This ad is no longer available');
  const res = await Favourite.updateOne({ userId, listingId }, { $setOnInsert: { priceAtSaveMinor: l.price.amountMinor } }, { upsert: true });
  if (res.upsertedCount) await Listing.updateOne({ _id: listingId }, { $inc: { 'stats.favourites': 1 } });
};

export const removeFavourite = async (userId, listingId) => {
  const res = await Favourite.deleteOne({ userId, listingId });
  if (res.deletedCount) await Listing.updateOne({ _id: listingId }, { $inc: { 'stats.favourites': -1 } });
};

export const myFavourites = async (userId, { page = 1, limit = 20, lang }) => {
  const rows = await Favourite.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const docs = await Listing.find({ _id: { $in: pageRows.map((r) => r.listingId) }, status: { $in: ['published', 'sold'] } }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const ordered = pageRows.map((r) => byId.get(String(r.listingId))).filter(Boolean);
  const items = await cardDtos(ordered, { lang, favourites: new Set(ordered.map((d) => String(d._id))), withStatus: true });
  const saved = new Map(pageRows.map((r) => [String(r.listingId), r.priceAtSaveMinor]));
  return { items: items.map((i) => ({ ...i, priceAtSaveMinor: saved.get(i.id) ?? null })), page, hasMore };
};

/* ───────── home sections ───────── */

export const homeListings = async (query, { viewerId, lang }) => {
  const base = { ...query, page: 1, limit: 10 };
  const hasPoint = query.lat !== undefined && query.lng !== undefined && query.scope;
  const [latest, nearby, featured] = await Promise.all([
    searchListings({ ...base, sort: 'newest' }, { viewerId, lang }),
    hasPoint ? searchListings({ ...base, sort: 'nearest' }, { viewerId, lang }) : Promise.resolve(null),
    searchListings({ ...base, sort: 'newest' }, { viewerId, lang, featuredOnly: true }),
  ]);
  return { latest: latest.items, nearby: nearby?.items ?? [], featured: featured.items };
};
