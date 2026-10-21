import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * First language tag of Accept-Language, in Google's spelling: "bn" / "zh-CN" / "mni-Mtei".
 * Any English tag is "en"; "*" or junk means none. A region the admin doesn't offer ("bn-IN")
 * falls back to the base language where translations are made (resolveLanguage).
 */
const parseLang = (header) => {
  const m = /^([a-z]{2,3})(?:-([a-z0-9]{2,8}))?$/i.exec((header || '').split(',')[0].split(';')[0].trim());
  if (!m) return undefined;
  const base = m[1].toLowerCase();
  if (base === 'en' || !m[2]) return base;
  const sub = m[2].length === 2 ? m[2].toUpperCase() : m[2].length === 4 ? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : m[2];
  return `${base}-${sub}`;
};

/** Attach request id + client context headers. */
export const requestContext = (req, res, next) => {
  req.id = req.get('X-Request-Id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.ctx = {
    lang: parseLang(req.get('Accept-Language')),
    country: req.get('X-Country') || undefined,
    platform: req.get('X-Platform') || undefined,
    appVersion: req.get('X-App-Version') || undefined,
    deviceId: req.get('X-Device-Id') || undefined,
    timezone: req.get('X-Timezone') || undefined,
  };
  next();
};

/**
 * Validate req parts with zod schemas: validate({ body, query, params }).
 * Parsed values replace the originals.
 */
export const validate = (schemas) => (req, res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (!result.success) {
        const fields = {};
        result.error.issues.forEach((i) => {
          fields[i.path.join('.') || part] = i.message;
        });
        throw ApiError.badRequest('VALIDATION_FAILED', 'Invalid input', { fields });
      }
      req[part] = result.data;
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const notFound = (req, res, next) => next(ApiError.notFound('ROUTE_NOT_FOUND', `No route ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err?.name === 'MulterError') {
    err = ApiError.badRequest('UPLOAD_INVALID', err.message);
  }
  if (err?.code === 11000) {
    err = ApiError.conflict('DUPLICATE', 'Duplicate value', { keys: Object.keys(err.keyValue || {}) });
  }
  if (err?.type === 'entity.parse.failed') {
    err = ApiError.badRequest('INVALID_JSON', 'Malformed JSON body');
  }

  const isApi = err instanceof ApiError;
  const status = isApi ? err.status : 500;

  if (status >= 500 && !isApi) {
    logger.error('Unhandled error', { requestId: req.id, path: req.originalUrl, err: err?.message, stack: err?.stack });
  } else if (status >= 500) {
    logger.warn('Service unavailable', { requestId: req.id, path: req.originalUrl, code: err.code });
  }

  res.status(status).json({
    success: false,
    error: {
      code: isApi ? err.code : 'INTERNAL_ERROR',
      message: isApi ? err.message : env.isDev ? err?.message : 'Something went wrong',
      ...(isApi && err.details ? { details: err.details } : {}),
      requestId: req.id,
    },
  });
};
