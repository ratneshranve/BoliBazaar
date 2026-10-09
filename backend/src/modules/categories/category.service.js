import mongoose from 'mongoose';
import { z } from 'zod';
import { Listing } from '../listings/listing.model.js';
import { escapeRegex } from '../../core/utils/http.js';
import { Category, LISTING_TYPES, ATTRIBUTE_TYPES } from './category.model.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { logger } from '../../core/utils/logger.js';
import { enabledLanguageCodes, translateTexts } from '../i18n/translate.service.js';
import { Media } from '../uploads/media.model.js';
import { mediaUrlInput } from '../../core/utils/mediaUrl.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const mediaInput = z.object({ url: mediaUrlInput, mediaId: objectId.optional() }).nullable();

const attributeInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'lowercase letters, digits and _ only'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(ATTRIBUTE_TYPES),
  required: z.boolean().default(false),
  unit: z.string().trim().max(20).optional(),
  options: z.array(z.object({ value: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(80) })).max(200).default([]),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().int().positive().max(5000).optional(),
  filterable: z.boolean().default(false),
  showOnCard: z.boolean().default(false),
  group: z.string().trim().max(40).optional(),
});

export const categoryInput = z.object({
  parentId: objectId.nullable().default(null),
  name: z.string().trim().min(1).max(80),
  icon: mediaInput.optional(),
  image: mediaInput.optional(),
  order: z.number().int().min(0).max(100000).default(0),
  status: z.enum(['active', 'hidden']).default('active'),
  listingTypes: z.array(z.enum(LISTING_TYPES)).default([]),
  attributes: z.array(attributeInput).max(60).default([]),
  rules: z
    .object({
      minPhotos: z.number().int().min(0).max(30),
      maxPhotos: z.number().int().min(1).max(30),
      requiresReview: z.boolean(),
      validityDays: z.number().int().min(1).max(365),
    })
    .optional(),
});

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'category';

const uniqueSlug = async (name, parentId, ignoreId) => {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i += 1) {
    const clash = await Category.exists({ parentId, slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
};

const parentContext = async (parentId) => {
  if (!parentId) return { ancestors: [], depth: 0 };
  const parent = await Category.findById(parentId).lean();
  if (!parent) throw ApiError.badRequest('PARENT_NOT_FOUND', 'Parent category does not exist');
  if (parent.depth >= 1) throw ApiError.badRequest('MAX_DEPTH', 'Only two levels are allowed: pick a main category as the parent');
  return { ancestors: [...parent.ancestors, parent._id], depth: parent.depth + 1 };
};

const resolveMedia = async (ref) => {
  if (ref === undefined) return undefined;
  if (ref === null) return null;
  if (ref.mediaId && !(await Media.exists({ _id: ref.mediaId }))) throw ApiError.badRequest('MEDIA_INVALID', 'Uploaded image not found');
  return { url: ref.url, mediaId: ref.mediaId };
};

const assertUniqueKeys = (attributes) => {
  const seen = new Set();
  for (const a of attributes) {
    if (seen.has(a.key)) throw ApiError.badRequest('VALIDATION_FAILED', `Duplicate field key "${a.key}"`, { fields: { attributes: `Duplicate key ${a.key}` } });
    seen.add(a.key);
    if (['select', 'multiselect'].includes(a.type) && a.options.length === 0) {
      throw ApiError.badRequest('VALIDATION_FAILED', `Field "${a.label}" needs options`, { fields: { attributes: `${a.key}: add at least one option` } });
    }
  }
};

export const createCategory = async (input) => {
  assertUniqueKeys(input.attributes);
  const ctx = await parentContext(input.parentId);
  const doc = await Category.create({
    ...input,
    ...ctx,
    slug: await uniqueSlug(input.name, input.parentId),
    icon: await resolveMedia(input.icon),
    image: await resolveMedia(input.image),
  });
  return doc;
};

export const updateCategory = async (id, input) => {
  assertUniqueKeys(input.attributes);
  const doc = await Category.findById(id);
  if (!doc) throw ApiError.notFound('CATEGORY_NOT_FOUND');
  const before = doc.toObject();

  const newParent = input.parentId ? String(input.parentId) : null;
  const moved = String(doc.parentId || '') !== String(newParent || '');
  if (moved) {
    if (newParent && (newParent === String(doc._id) || (await Category.exists({ _id: newParent, ancestors: doc._id })))) {
      throw ApiError.badRequest('INVALID_MOVE', 'A category cannot be moved into itself or its own sub-category');
    }
    const ctx = await parentContext(newParent);
    const subtreeDepth = (await Category.find({ ancestors: doc._id }).sort({ depth: -1 }).limit(1).lean())[0];
    if (subtreeDepth && ctx.depth + (subtreeDepth.depth - doc.depth) > 1) {
      throw ApiError.badRequest('MAX_DEPTH', 'A category that has subcategories cannot be moved under another category');
    }
    doc.parentId = newParent;
    doc.ancestors = ctx.ancestors;
    const delta = ctx.depth - doc.depth;
    doc.depth = ctx.depth;
    // re-parent the whole subtree
    const descendants = await Category.find({ ancestors: doc._id });
    for (const d of descendants) {
      const idx = d.ancestors.findIndex((a) => String(a) === String(doc._id));
      d.ancestors = [...ctx.ancestors, ...d.ancestors.slice(idx)];
      d.depth += delta;
      await d.save();
    }
  }

  if (doc.name !== input.name || moved) doc.slug = await uniqueSlug(input.name, doc.parentId, doc._id);
  doc.name = input.name;
  doc.order = input.order;
  doc.status = input.status;
  doc.listingTypes = input.listingTypes;
  doc.attributes = input.attributes;
  if (input.rules) doc.rules = input.rules;
  if (input.icon !== undefined) doc.icon = await resolveMedia(input.icon);
  if (input.image !== undefined) doc.image = await resolveMedia(input.image);
  await doc.save();
  return { before, doc };
};

export const deleteCategory = async (id) => {
  const doc = await Category.findById(id);
  if (!doc) throw ApiError.notFound('CATEGORY_NOT_FOUND');
  if (await Category.exists({ parentId: doc._id })) throw ApiError.conflict('CATEGORY_HAS_CHILDREN', 'Delete or move its sub-categories first');
  const { Listing } = await import('../listings/listing.model.js');
  if (await Listing.exists({ categoryPath: doc._id, status: { $ne: 'deleted' } })) {
    throw ApiError.conflict('CATEGORY_IN_USE', 'Ads exist in this category — hide it instead of deleting it');
  }
  await doc.deleteOne();
  return doc.toObject();
};

/**
 * Optional one-click starter taxonomy (names only, from the SOP's category list).
 * Only allowed when no categories exist yet; everything stays editable in admin.
 */
export const importStarterCategories = async () => {
  if (await Category.exists({})) throw ApiError.conflict('CATEGORIES_EXIST', 'Categories already exist — the starter set can only be imported into an empty tree');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(import.meta.dirname, 'starter-categories.json');
  const starter = JSON.parse(await fs.readFile(file, 'utf8'));
  let count = 0;
  for (const [i, top] of starter.entries()) {
    const parent = await createCategory({ parentId: null, name: top.name, order: i, status: 'active', listingTypes: top.listingTypes, attributes: [] });
    count += 1;
    for (const [j, childName] of top.children.entries()) {
      await createCategory({ parentId: String(parent._id), name: childName, order: j, status: 'active', listingTypes: top.listingTypes, attributes: [] });
      count += 1;
    }
  }
  return count;
};

/* ───── trees ───── */

const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name);

const nest = (flat, mapNode) => {
  const nodes = new Map(flat.map((c) => [String(c._id), { ...mapNode(c), children: [] }]));
  const roots = [];
  for (const c of flat.sort(byOrder)) {
    const node = nodes.get(String(c._id));
    const parent = c.parentId ? nodes.get(String(c.parentId)) : null;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
};

export const adminTree = async () => {
  const flat = await Category.find().lean();
  return nest(flat, (c) => ({
    id: String(c._id),
    parentId: c.parentId ? String(c.parentId) : null,
    name: c.name,
    slug: c.slug,
    icon: c.icon?.url ? { url: c.icon.url, mediaId: c.icon.mediaId ? String(c.icon.mediaId) : undefined } : null,
    image: c.image?.url ? { url: c.image.url, mediaId: c.image.mediaId ? String(c.image.mediaId) : undefined } : null,
    order: c.order,
    status: c.status,
    depth: c.depth,
    listingTypes: c.listingTypes,
    attributes: c.attributes,
    rules: c.rules,
  }));
};

const adminDto = (c) => ({
  id: String(c._id),
  parentId: c.parentId ? String(c.parentId) : null,
  name: c.name,
  slug: c.slug,
  icon: c.icon?.url ? { url: c.icon.url, mediaId: c.icon.mediaId ? String(c.icon.mediaId) : undefined } : null,
  image: c.image?.url ? { url: c.image.url, mediaId: c.image.mediaId ? String(c.image.mediaId) : undefined } : null,
  order: c.order,
  status: c.status,
  depth: c.depth,
  listingTypes: c.listingTypes,
  attributes: c.attributes,
  rules: c.rules,
});

/**
 * One page of categories for the admin tables, with count cards.
 * level "top" = main categories, level "sub" = every category below them (optionally under one parent).
 */
export const adminCategoryPage = async ({ level, parentId, q, status, page, limit }) => {
  const levelFilter = level === 'top' ? { parentId: null } : { parentId: { $ne: null } };
  const f = { ...levelFilter };
  if (parentId) f.ancestors = new mongoose.Types.ObjectId(parentId);
  if (status) f.status = status;
  if (q) f.name = new RegExp(escapeRegex(q), 'i');

  const [docs, total] = await Promise.all([
    Category.find(f).sort(level === 'top' ? { order: 1, name: 1 } : { ancestors: 1, depth: 1, order: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Category.countDocuments(f),
  ]);
  const ids = docs.map((d) => d._id);

  // direct subcategories, live ads (counted in every ancestor), and the parent path for display
  const [kids, ads, parents] = await Promise.all([
    Category.aggregate([{ $match: { parentId: { $in: ids } } }, { $group: { _id: '$parentId', n: { $sum: 1 } } }]),
    Listing.aggregate([{ $match: { status: 'published', expiresAt: { $gt: new Date() }, categoryPath: { $in: ids } } }, { $unwind: '$categoryPath' }, { $match: { categoryPath: { $in: ids } } }, { $group: { _id: '$categoryPath', n: { $sum: 1 } } }]),
    Category.find({ _id: { $in: [...new Set(docs.flatMap((d) => d.ancestors.map(String)))] } }).select('name').lean(),
  ]);
  const kidN = new Map(kids.map((k) => [String(k._id), k.n]));
  const adN = new Map(ads.map((a) => [String(a._id), a.n]));
  const names = new Map(parents.map((p) => [String(p._id), p.name]));

  // count cards for the whole level (not just this page)
  const [all, active, hidden, withFields, subTotal, liveAds] = await Promise.all([
    Category.countDocuments(levelFilter),
    Category.countDocuments({ ...levelFilter, status: 'active' }),
    Category.countDocuments({ ...levelFilter, status: 'hidden' }),
    Category.countDocuments({ ...levelFilter, 'attributes.0': { $exists: true } }),
    Category.countDocuments({ parentId: { $ne: null } }),
    Listing.countDocuments({ status: 'published', expiresAt: { $gt: new Date() } }),
  ]);
  const emptyLeaves = await Category.countDocuments({ ...levelFilter, _id: { $nin: await Category.distinct('parentId', { parentId: { $ne: null } }) } });

  return {
    rows: docs.map((d) => ({
      ...adminDto(d),
      path: d.ancestors.map((a) => names.get(String(a))).filter(Boolean),
      subcategoryCount: kidN.get(String(d._id)) || 0,
      liveAds: adN.get(String(d._id)) || 0,
    })),
    total,
    stats: level === 'top'
      ? { total: all, active, hidden, subcategories: subTotal, withFields, withoutSubcategories: emptyLeaves, liveAds }
      : { total: all, active, hidden, withFields, liveAds },
  };
};

/** Translate a list of English strings for a reader; falls back to English if translation is unavailable. */
export const translateForReader = async (texts, lang) => {
  if (!lang || lang === 'en') return texts;
  try {
    if (!(await enabledLanguageCodes()).includes(lang)) return texts;
    return await translateTexts(texts, lang);
  } catch (err) {
    logger.warn('Translation unavailable, serving English', { lang, err: err.message });
    return texts;
  }
};

export const userTree = async (lang) => {
  const flat = await Category.find({ status: 'active' }).select('-attributes').lean();
  const names = await translateForReader(flat.map((c) => c.name), lang);
  const nameById = new Map(flat.map((c, i) => [String(c._id), names[i]]));
  const visible = new Set(flat.map((c) => String(c._id)));
  return nest(
    flat.filter((c) => !c.parentId || visible.has(String(c.parentId))),
    (c) => ({
      id: String(c._id),
      parentId: c.parentId ? String(c.parentId) : null,
      name: nameById.get(String(c._id)),
      slug: c.slug,
      icon: c.icon?.url || null,
      image: c.image?.url || null,
      order: c.order,
      listingTypes: c.listingTypes,
    })
  );
};

export const userCategoryDetail = async (id, lang) => {
  const c = await Category.findOne({ _id: id, status: 'active' }).lean();
  if (!c) throw ApiError.notFound('CATEGORY_NOT_FOUND');
  const labels = [c.name, ...c.attributes.flatMap((a) => [a.label, ...(a.unit ? [a.unit] : []), ...a.options.map((o) => o.label)])];
  const tr = await translateForReader(labels, lang);
  let i = 0;
  const name = tr[i++];
  const attributes = c.attributes.map((a) => ({
    ...a,
    label: tr[i++],
    unit: a.unit ? tr[i++] : undefined,
    options: a.options.map((o) => ({ value: o.value, label: tr[i++] })),
  }));
  return { id: String(c._id), name, slug: c.slug, icon: c.icon?.url || null, listingTypes: c.listingTypes, attributes, rules: c.rules };
};

/** Top-level categories for the home screen. */
export const topCategories = async (lang) => {
  const tree = await userTree(lang);
  return tree.map(({ children, ...c }) => ({ ...c, hasChildren: children.length > 0 }));
};
