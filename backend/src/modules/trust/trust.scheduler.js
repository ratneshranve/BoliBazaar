import { purgeDueAccounts } from './account.service.js';
import { logger } from '../../core/utils/logger.js';

/** Removes personal data of accounts whose deletion grace period has ended (hourly). */
let timer = null;
export const startTrustScheduler = (intervalMs = 60 * 60 * 1000) => {
  if (timer) return;
  timer = setInterval(() => purgeDueAccounts().catch((err) => logger.error('Account purge failed', { err: err.message })), intervalMs);
  timer.unref();
};
