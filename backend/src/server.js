import http from 'node:http';
import fs from 'node:fs/promises';
import { env } from './core/config/env.js';
import { logger } from './core/utils/logger.js';
import { connectMongo, disconnectMongo } from './core/db/mongo.js';
import { connectRedis, redis } from './core/db/redis.js';
import { UPLOAD_ROOT } from './core/services/storage.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime/index.js';
import { registerChatSocket } from './modules/chat/chat.socket.js';
import { registerAuctionSocket } from './modules/auctions/auction.socket.js';
import { startAuctionScheduler } from './modules/auctions/auction.scheduler.js';
import { startPaymentScheduler } from './modules/payments/payment.scheduler.js';
import { startTrustScheduler } from './modules/trust/trust.scheduler.js';

const start = async () => {
  await connectMongo();
  await connectRedis();
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });

  const server = http.createServer(createApp());
  await initRealtime(server, {
    onConnection: (socket) => {
      registerChatSocket(socket);
      registerAuctionSocket(socket);
    },
  });
  startAuctionScheduler();
  startPaymentScheduler();
  startTrustScheduler();
  server.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));

  const shutdown = async (signal) => {
    logger.warn(`${signal} received, shutting down`);
    server.close();
    await Promise.allSettled([disconnectMongo(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((err) => {
  logger.error('Startup failed', { err: err.message, stack: err.stack });
  process.exit(1);
});
