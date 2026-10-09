import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * `redis` is either the real ioredis client (REDIS_ENABLED=true) or an in-process store
 * with the same methods (REDIS_ENABLED=false). The in-process store is for single-instance
 * use only: rate limits, idempotency keys, caches and session-revocation marks live in this
 * process's memory and are lost on restart / not shared between instances.
 */
class MemoryStore {
  constructor() {
    this.map = new Map();
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  sweep() {
    const now = Date.now();
    for (const [k, e] of this.map) if (e.exp && e.exp <= now) this.map.delete(k);
  }

  live(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key) {
    return this.live(key)?.v ?? null;
  }

  /** Supports: set(key, value), set(key, value, 'EX', seconds), set(key, value, 'EX', seconds, 'NX') */
  async set(key, value, ...args) {
    let ttl;
    let nx = false;
    for (let i = 0; i < args.length; i += 1) {
      if (String(args[i]).toUpperCase() === 'EX') ttl = Number(args[(i += 1)]);
      else if (String(args[i]).toUpperCase() === 'NX') nx = true;
    }
    if (nx && this.live(key)) return null;
    this.map.set(key, { v: String(value), exp: ttl ? Date.now() + ttl * 1000 : 0 });
    return 'OK';
  }

  async del(...keys) {
    return keys.reduce((n, k) => n + (this.map.delete(k) ? 1 : 0), 0);
  }

  async exists(...keys) {
    return keys.reduce((n, k) => n + (this.live(k) ? 1 : 0), 0);
  }

  async quit() {
    clearInterval(this.timer);
  }
}

export const redis = env.redisEnabled
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })
  : new MemoryStore();

/** host:port of REDIS_URL without the password, for messages. */
const redisTarget = () => {
  try {
    const u = new URL(env.REDIS_URL);
    return `${u.hostname}:${u.port || 6379}`;
  } catch {
    return 'the configured REDIS_URL';
  }
};

if (env.redisEnabled) {
  redis.on('error', (err) => logger.error('Redis error', { err: err.message }));
}

export const connectRedis = async () => {
  if (!env.redisEnabled) {
    logger.warn('REDIS_ENABLED=false — using in-process memory store (single instance only; state is lost on restart)');
    return;
  }
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    throw new Error(
      `Redis is switched on (REDIS_ENABLED=true) but cannot be reached at ${redisTarget()} (${err.message}). ` +
        'Start Redis (sudo apt install redis-server && sudo systemctl enable --now redis-server) ' +
        'or set REDIS_ENABLED=false and BULLMQ_ENABLED=false in backend/.env.'
    );
  }
  logger.info('Redis connected');
};
