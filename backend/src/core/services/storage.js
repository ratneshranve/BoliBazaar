import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { env, integrations } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { getSettingValue } from '../../modules/settings/settings.service.js';

/**
 * Storage adapter. The active provider is chosen by admin (Settings › Storage):
 *   - "cloudinary": credentials from env
 *   - "local": files written to UPLOAD_DIR on this VPS and served at /uploads/*
 * Private files (KYC, documents) are always kept on local disk outside the public route.
 */

export const UPLOAD_ROOT = path.resolve(env.UPLOAD_DIR);
const PUBLIC_DIR = path.join(UPLOAD_ROOT, 'public');
const PRIVATE_DIR = path.join(UPLOAD_ROOT, 'private');

if (integrations.cloudinary.configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// HEIC is converted to JPEG on the device before upload (sharp's prebuilt binaries cannot decode HEIC).
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Detect real type from magic bytes (never trust client mime). */
const sniff = (buf) => {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  return null;
};

const resolveProvider = async () => {
  const cfg = await getSettingValue('storage');
  if (!cfg.provider) throw ApiError.unavailable('STORAGE_NOT_CONFIGURED', 'Choose a storage provider in Admin › Settings › Storage');
  if (cfg.provider === 'cloudinary' && !integrations.cloudinary.configured) {
    throw ApiError.unavailable('INTEGRATION_NOT_CONFIGURED', 'Cloudinary selected but credentials missing in .env');
  }
  return cfg;
};

/** Normalise an image: auto-rotate, strip EXIF (removes GPS), resize, WebP. */
const processImage = (buffer, cfg) =>
  sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: cfg.imageMaxEdgePx, height: cfg.imageMaxEdgePx, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: cfg.imageQuality })
    .toBuffer({ resolveWithObject: true });

const uploadToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `${env.CLOUDINARY_FOLDER || ''}/${folder}`.replace(/^\//, ''), resource_type: 'image', format: 'webp' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

/**
 * Store a PUBLIC image (listing photos, banners, logos, avatars, category icons).
 * Returns { provider, key, url, width, height, size, mime }.
 */
export const storePublicImage = async (file, folder) => {
  const cfg = await resolveProvider();
  if (file.size > cfg.maxImageMb * 1024 * 1024) throw ApiError.badRequest('FILE_TOO_LARGE', `Max ${cfg.maxImageMb} MB`);
  const mime = sniff(file.buffer);
  if (!mime || !IMAGE_MIME.has(mime)) throw ApiError.badRequest('FILE_TYPE_NOT_ALLOWED', 'Only JPG, PNG or WebP images');

  const { data, info } = await processImage(file.buffer, cfg);

  if (cfg.provider === 'cloudinary') {
    const r = await uploadToCloudinary(data, folder);
    return { provider: 'cloudinary', key: r.public_id, url: r.secure_url, width: r.width, height: r.height, size: r.bytes, mime: 'image/webp' };
  }

  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.webp`;
  const abs = path.join(PUBLIC_DIR, key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return {
    provider: 'local',
    key,
    url: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads/${key}`,
    width: info.width,
    height: info.height,
    size: info.size,
    mime: 'image/webp',
  };
};

/** Store a PRIVATE document (KYC, property papers, resumes). Never publicly routable. */
export const storePrivateFile = async (file, folder) => {
  const mime = sniff(file.buffer);
  if (!mime || !DOC_MIME.has(mime)) throw ApiError.badRequest('FILE_TYPE_NOT_ALLOWED', 'Only PDF, JPG or PNG');
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  const abs = path.join(PRIVATE_DIR, key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, file.buffer);
  return { provider: 'private', key, size: file.size, mime };
};

export const privateFilePath = (key) => {
  const abs = path.join(PRIVATE_DIR, key);
  if (!abs.startsWith(PRIVATE_DIR)) throw ApiError.badRequest('INVALID_KEY');
  return abs;
};

/** Delete from whichever provider stored it. */
export const deleteStored = async ({ provider, key }) => {
  if (provider === 'cloudinary') return cloudinary.uploader.destroy(key);
  const base = provider === 'private' ? PRIVATE_DIR : PUBLIC_DIR;
  const abs = path.join(base, key);
  if (!abs.startsWith(base)) return;
  await fs.rm(abs, { force: true });
};

export const PUBLIC_UPLOAD_DIR = PUBLIC_DIR;
