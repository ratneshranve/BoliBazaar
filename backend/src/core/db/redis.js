import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

redis.on('error', (err) => logger.error('Redis error', { err: err.message }));

export const connectRedis = async () => {
  await redis.connect();
  await redis.ping();
  logger.info('Redis connected');
};
