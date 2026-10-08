import { z } from 'zod';
import { PRICE_TYPES, CONDITIONS } from './listing.model.js';
import { placeInput } from '../places/places.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

/** Empty strings from forms count as "not filled". */
const blank = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema);

/**
 * Build the validator for a category's form fields (Admin › Categories › Form fields).
 * Required fields must be present; everything is checked against the field's own rules.
 */
export const buildAttributesSchema = (attributes) => {
  const shape = {};
  for (const a of attributes) {
    let s;
    switch (a.type) {
      case 'text':
      case 'textarea':
        s = z.string().trim().min(1).max(a.maxLength || (a.type === 'textarea' ? 2000 : 200));
        break;
      case 'number': {
        let n = z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), z.number({ invalid_type_error: 'Enter a number' }));
        if (typeof a.min === 'number') n = n.pipe(z.number().min(a.min));
        if (typeof a.max === 'number') n = n.pipe(z.number().max(a.max));
        s = n;
        break;
      }
      case 'year':
        s = z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().min(1900).max(new Date().getFullYear() + 1));
        break;
      case 'boolean':
        s = z.boolean();
        break;
      case 'date':
        s = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD');
        break;
      case 'select': {
        const values = a.options.map((o) => o.value);
        s = z.string().refine((v) => values.includes(v), 'Choose one of the options');
        break;
      }
      case 'multiselect': {
        const values = a.options.map((o) => o.value);
        s = z.array(z.string().refine((v) => values.includes(v), 'Choose from the options')).max(values.length);
        break;
      }
      default:
        s = z.any();
    }
    shape[a.key] = a.required ? blank(s) : blank(s.optional());
  }
  return z.object(shape).strip();
};

export const priceInput = z
  .object({
    type: z.enum(PRICE_TYPES),
    amount: z.number().min(0).max(1_000_000_000_000).optional(), // major units, e.g. 425000 rupees
  })
  .superRefine((p, ctx) => {
    if (['fixed', 'negotiable'].includes(p.type) && !(p.amount > 0)) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter a price greater than 0' });
  });

export const listingInput = z.object({
  categoryId: objectId,
  listingType: z.string().min(2).max(20),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(2000),
  condition: z.enum(CONDITIONS).optional(),
  price: priceInput,
  attributes: z.record(z.string(), z.unknown()).default({}),
  mediaIds: z.array(objectId).max(30),
  location: placeInput,
});

/** Search / browse query (query-string values arrive as strings). */
const num = z.coerce.number();
export const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: objectId.optional(),
  listingType: z.string().max(20).optional(),
  condition: z.enum(CONDITIONS).optional(),
  priceMin: num.min(0).optional(),
  priceMax: num.min(0).optional(),
  filters: z.string().max(2000).optional(), // JSON: { key: {eq|in|min|max} } for the category's form fields
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'nearest']).default('newest'),
  // where from, and how far
  lat: num.min(-90).max(90).optional(),
  lng: num.min(-180).max(180).optional(),
  scope: z.enum(['radius', 'district', 'state', 'country', 'worldwide']).optional(),
  radiusKm: num.min(1).max(1000).optional(),
  district: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
