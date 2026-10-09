import multer from 'multer';
import { env } from '../../core/config/env.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { storePublicImage, storePrivateFile } from '../../core/services/storage.js';
import { Media } from './media.model.js';

/** Single-file multipart parser (field name "file"), kept in memory for validation & processing. */
export const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
}).single('file');

const requireFile = (file) => {
  if (!file) throw ApiError.badRequest('FILE_REQUIRED', 'Send the file in multipart field "file"');
};

export const savePublicImage = async ({ file, ownerType, ownerId, purpose }) => {
  requireFile(file);
  const stored = await storePublicImage(file, purpose);
  const media = await Media.create({ ownerType, ownerId, purpose, visibility: 'public', ...stored });
  return toDto(media);
};

export const savePrivateFile = async ({ file, ownerType, ownerId, purpose }) => {
  requireFile(file);
  const stored = await storePrivateFile(file, purpose);
  const name = String(file.originalname || '').replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(-100) || undefined;
  const media = await Media.create({ ownerType, ownerId, purpose, visibility: 'private', name, ...stored });
  return toDto(media);
};

export const toDto = (m) => ({
  id: String(m._id),
  url: m.visibility === 'public' ? m.url : undefined,
  name: m.name,
  mime: m.mime,
  size: m.size,
  width: m.width,
  height: m.height,
  purpose: m.purpose,
  visibility: m.visibility,
  provider: m.provider,
});
