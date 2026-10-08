import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Background-job gate. BullMQ needs Redis, so BULLMQ_ENABLED=true requires REDIS_ENABLED=true
 * (validated at startup). Queues/workers are added from Phase 4/5 (notifications, auction
 * closing, listing expiry). Code that schedules a job calls requireQueues() first.
 */
export const queuesEnabled = env.bullmqEnabled;

export const requireQueues = (feature) => {
  if (!queuesEnabled) {
    throw ApiError.unavailable('QUEUES_DISABLED', `${feature} needs background jobs: set BULLMQ_ENABLED=true (and REDIS_ENABLED=true) in backend/.env`);
  }
};
