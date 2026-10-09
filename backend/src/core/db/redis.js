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
  // rate-limit-redis loads its Lua scripts when the app is imported. If Redis is down at that moment the
  // rejected promise has no owner and would crash the process with a bare stack trace; log it instead so
  // connectRedis() can stop the start-up with a clear message. Any other unhandled rejection still crashes.
  process.on('unhandledRejection', (reason) => {
    if (reason?.name === 'MaxRetriesPerRequestError') {
      logger.error('Redis did not answer (rate limiter could not load its scripts yet)', { err: reason.message });
      return;
    }
    throw reason;
  });
}

const CONNECT_TIMEOUT_MS = 10_000;

/** Resolves when the client is ready; rejects when it closes or CONNECT_TIMEOUT_MS passes. */
const waitUntilReady = () =>
  new Promise((resolve, reject) => {
    if (redis.status === 'ready') return resolve();
    let lastError = null;
    const onError = (err) => {
      lastError = err;
    };
    const done = (fn, arg) => {
      clearTimeout(timer);
      redis.off('ready', onReady);
      redis.off('error', onError);
      redis.off('end', onEnd);
      fn(arg);
    };
    const onReady = () => done(resolve);
    const onEnd = () => done(reject, lastError || new Error('Connection is closed'));
    const timer = setTimeout(() => done(reject, lastError || new Error(`no answer after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS);
    redis.on('ready', onReady);
    redis.on('error', onError);
    redis.on('end', onEnd);
  });

export const connectRedis = async () => {
  if (!env.redisEnabled) {
    logger.warn('REDIS_ENABLED=false — using in-process memory store (single instance only; state is lost on restart)');
    return;
  }
  try {
    // Some modules (rate-limit-redis loads its scripts when imported) send a command first, which makes
    // ioredis connect on its own. So: connect only if nothing has started yet, otherwise wait for that attempt.
    if (redis.status === 'wait') redis.connect().catch(() => {});
    await waitUntilReady();
    await redis.ping();
  } catch (err) {
    redis.disconnect(); // stop the endless retries; the process exits with the message below
    throw new Error(
      `Redis is switched on (REDIS_ENABLED=true) but cannot be reached at ${redisTarget()} (${err.message}). ` +
        'Start Redis (sudo apt install redis-server && sudo systemctl enable --now redis-server) ' +
        'or set REDIS_ENABLED=false and BULLMQ_ENABLED=false in backend/.env.'
    );
  }
  logger.info('Redis connected');
};
