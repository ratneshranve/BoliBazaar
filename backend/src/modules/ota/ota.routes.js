import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { Readable } from 'node:stream';
import { Router } from 'express';
import multer from 'multer';
import { toNodeHandler } from '@hot-updater/server';
import { getContentType } from '@hot-updater/plugin-core';
import { env } from '../../core/config/env.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { asyncHandler } from '../../core/utils/http.js';
import { diskStorage, ota, otaFile } from './ota.service.js';

/**
 * Mounted at /api/v1/hot-updater.
 *   /admin/*        Hot Updater's admin API (deploy, rollback, channels)      — admin token
 *   /storage/*      upload/read/check/delete update files for the deploy CLI  — admin token
 *   /files/*        update files phones download                             — public
 *   everything else Hot Updater's client API (phones ask for updates)          — public
 */
const router = Router();

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const adminOnly = (req, res, next) => {
  if (!env.HOT_UPDATER_ADMIN_TOKEN) return next(ApiError.unavailable('OTA_NOT_CONFIGURED', 'Set HOT_UPDATER_ADMIN_TOKEN in backend .env to upload app updates'));
  if (!sameSecret(req.get('Authorization') || '', `Bearer ${env.HOT_UPDATER_ADMIN_TOKEN}`)) return next(ApiError.unauthorized('UNAUTHORIZED', 'Wrong update token'));
  next();
};

// the instance is created on first use (MongoDB is connected by then)
const hotUpdater = (pick) => (req, res, next) => {
  try {
    return toNodeHandler(pick(ota().handlers))(req, res, next);
  } catch (err) {
    return next(err);
  }
};

/* ── deploy CLI: storage (standaloneStorage) ── */

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post(
  '/storage/upload',
  adminOnly,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.body?.key) throw ApiError.badRequest('VALIDATION_FAILED', 'file and key are required');
    try {
      const { storageUri } = await diskStorage.put({
        key: String(req.body.key),
        body: Readable.toWeb(fs.createReadStream(req.file.path)),
        contentLength: req.file.size,
        contentType: req.file.mimetype || 'application/octet-stream',
      });
      res.json({ storageUri });
    } finally {
      await fsp.rm(req.file.path, { force: true });
    }
  })
);

router.post(
  '/storage/get',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { response } = await diskStorage.get({ storageUri: String(req.body?.storageUri || '') });
    if (!response) return res.status(404).json({ error: 'Not found' });
    res.type(response.headers.get('content-type') || 'application/octet-stream');
    Readable.fromWeb(response.body).pipe(res);
  })
);

router.post(
  '/storage/exists',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { exists } = await diskStorage.exists({ storageUri: String(req.body?.storageUri || '') });
    if (!exists) return res.status(404).json({ exists: false });
    res.json({ exists: true });
  })
);

router.delete(
  '/storage/delete',
  adminOnly,
  asyncHandler(async (req, res) => {
    await diskStorage.delete({ storageUri: String(req.body?.storageUri || '') });
    res.json({ deleted: true });
  })
);

/* ── phones: download an update file ── */

router.get(
  '/files/*',
  asyncHandler(async (req, res) => {
    const key = req.params[0].split('/').map(decodeURIComponent).join('/');
    let file;
    try {
      file = otaFile(key);
    } catch {
      throw ApiError.notFound('NOT_FOUND');
    }
    const st = await fsp.stat(file).catch(() => null);
    if (!st?.isFile()) throw ApiError.notFound('NOT_FOUND');
    res.set({ 'Content-Type': getContentType(file), 'Content-Length': String(st.size), 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  })
);

/* ── Hot Updater's own APIs ── */

router.use('/admin', adminOnly, hotUpdater((h) => h.admin));
router.use('/', hotUpdater((h) => h.client));

export default router;
