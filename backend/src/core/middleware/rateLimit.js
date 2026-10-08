import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { redis } from '../db/redis.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Rate limiter. `keyBy` decides the bucket (ip, user, phone...).
 * Uses Redis when REDIS_ENABLED=true (shared across instances), otherwise an in-process store.
 * Example: limiter({ name: 'otp-send', windowMs: 60_000, max: 3, keyBy: (req) => req.body.phone })
 */
export const limiter = ({ name, windowMs, max, keyBy }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${keyBy ? keyBy(req) : req.ip}`,
    ...(env.redisEnabled ? { store: new RedisStore({ prefix: 'rl:', sendCommand: (...args) => redis.call(...args) }) } : {}),
    handler: (req, res, next, options) =>
      next(ApiError.tooMany('RATE_LIMITED', 'Too many requests', { retryAfterSec: Math.ceil(options.windowMs / 1000) })),
  });

/** Broad per-IP protection for all API routes. */
export const globalLimiter = limiter({ name: 'global', windowMs: 60_000, max: 300 });
