import { runSearchAlerts } from './growth.service.js';
import { logger } from '../../core/utils/logger.js';

/** Checks saved searches for new matching ads (every 5 minutes). */
let timer = null;
let running = false;
export const startGrowthScheduler = (intervalMs = 5 * 60 * 1000) => {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runSearchAlerts();
    } catch (err) {
      logger.error('Saved search alerts failed', { err: err.message });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
};
