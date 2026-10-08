import { expireStaleOrders } from './payment.service.js';
import { logger } from '../../core/utils/logger.js';

/** Closes checkout orders nobody finished (every minute). */
let timer = null;
export const startPaymentScheduler = (intervalMs = 60_000) => {
  if (timer) return;
  timer = setInterval(() => expireStaleOrders().catch((err) => logger.error('Payment sweeper failed', { err: err.message })), intervalMs);
  timer.unref();
};
