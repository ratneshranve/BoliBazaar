import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/** Attach request id + client context headers. */
export const requestContext = (req, res, next) => {
  req.id = req.get('X-Request-Id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.ctx = {
    // first language tag only ("hi-IN,en;q=0.8" → "hi"); "*" or junk means none
    lang: (/^[a-z]{2,3}$/i.exec((req.get('Accept-Language') || '').split(',')[0].split(';')[0].split('-')[0].trim())?.[0] || '').toLowerCase() || undefined,
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
