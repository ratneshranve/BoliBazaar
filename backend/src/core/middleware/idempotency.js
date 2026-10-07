import { redis } from '../db/redis.js';
import { ApiError } from '../utils/ApiError.js';

const TTL_SEC = 24 * 60 * 60;
const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Makes a mutation safe to retry. Client sends `Idempotency-Key` (uuid).
 * - first request: marked "processing", response cached for 24 h
 * - retry after completion: cached response replayed
 * - retry while first still running: 409 IDEMPOTENCY_IN_PROGRESS
 * 5xx responses are not cached so the client can retry.
 * Must run AFTER authentication so keys are scoped per actor.
 */
export const idempotent = (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || !KEY_RE.test(key)) {
    return next(ApiError.badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key (8-128 chars) is required'));
  }
  const actor = req.user?.id || req.admin?.id || req.ctx?.deviceId || req.ip;
  const redisKey = `idem:${actor}:${req.method}:${req.baseUrl}${req.path}:${key}`;

  (async () => {
    const acquired = await redis.set(redisKey, JSON.stringify({ state: 'processing' }), 'EX', TTL_SEC, 'NX');
    if (!acquired) {
      const stored = JSON.parse((await redis.get(redisKey)) || '{}');
      if (stored.state === 'done') {
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(stored.status).json(stored.body);
      }
      throw ApiError.conflict('IDEMPOTENCY_IN_PROGRESS', 'The same request is still being processed');
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      if (status >= 500) {
        redis.del(redisKey).catch(() => {});
      } else {
        redis.set(redisKey, JSON.stringify({ state: 'done', status, body }), 'EX', TTL_SEC).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  })().catch(next);
};
