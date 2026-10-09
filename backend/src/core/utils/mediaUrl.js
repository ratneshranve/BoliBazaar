import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Photos stored on this server (Admin › Storage = VPS) are saved in the database as a short path,
 * "/uploads/listing/2026-10/<id>.webp" (same idea as Tuggo), never with a host name. The API adds
 * PUBLIC_BASE_URL when it sends data out, so the same database works on a laptop and on the VPS,
 * and changing the domain never breaks old photos. Cloudinary URLs are full https URLs and pass through.
 */
export const UPLOAD_PREFIX = '/uploads/';

const base = () => env.PUBLIC_BASE_URL.replace(/\/$/, '');

/** "/uploads/x.webp" → "https://api.example.com/uploads/x.webp" (anything else unchanged). */
export const toPublicUrl = (v) => (typeof v === 'string' && v.startsWith(UPLOAD_PREFIX) ? `${base()}${v}` : v);

/** "https://api.example.com/uploads/x.webp" (this server) → "/uploads/x.webp" (anything else unchanged). */
export const toStoredUrl = (v) => (typeof v === 'string' && v.startsWith(`${base()}${UPLOAD_PREFIX}`) ? v.slice(base().length) : v);

/** Apply fn to every string inside a JSON-like value (objects, arrays), returning a new value. */
const mapStrings = (value, fn, depth = 0) => {
  if (typeof value === 'string') return fn(value);
  if (!value || typeof value !== 'object' || depth > 20) return value;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value) || typeof value.toHexString === 'function') return value;
  if (typeof value.toJSON === 'function') return mapStrings(value.toJSON(), fn, depth + 1); // mongoose documents
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn, depth + 1);
  return out;
};

export const withPublicUrls = (value) => mapStrings(value, toPublicUrl);
export const withStoredUrls = (value) => mapStrings(value, toStoredUrl);

/** Express: incoming bodies store short paths; outgoing JSON gets full URLs. */
export const mediaUrlMiddleware = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = withStoredUrls(req.body);
  const json = res.json.bind(res);
  res.json = (body) => json(withPublicUrls(body));
  next();
};

/** Validator for an image URL sent by the apps: a full http(s) URL, or a short "/uploads/…" path. */
export const mediaUrlInput = z
  .string()
  .max(2000)
  .refine((v) => /^https?:\/\/\S+$/i.test(v) || (v.startsWith(UPLOAD_PREFIX) && !v.includes('..')), { message: 'Invalid image URL' });
