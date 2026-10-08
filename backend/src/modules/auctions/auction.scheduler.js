import { sweepAuctions } from './bidding.service.js';
import { expireStaleDeals } from './deal.service.js';
import { logger } from '../../core/utils/logger.js';

/**
 * Starts and ends auctions on time, and expires deals that were never confirmed.
 * Every step is an atomic status change, so running it on several servers at once is safe.
 */
let timer = null;
let running = false;

export const startAuctionScheduler = (intervalMs = 5000) => {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sweepAuctions();
      await expireStaleDeals();
    } catch (err) {
      logger.error('Auction scheduler failed', { err: err.message });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
};

export const stopAuctionScheduler = () => {
  clearInterval(timer);
  timer = null;
};
