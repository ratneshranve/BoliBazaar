import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../core/config/env.js';
import { redis } from '../core/db/redis.js';
import { logger } from '../core/utils/logger.js';
import { User } from '../modules/users/user.model.js';

/**
 * Realtime (Socket.io). Every logged-in user joins the room `user:<id>`; the server pushes events there
 * (new chat messages, notifications, read receipts, typing). Sockets are only a live feed: the REST API
 * stays the source of truth, so missing an event never loses data.
 */
let io = null;

export const initRealtime = async (httpServer, { onConnection } = {}) => {
  io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)), credentials: true },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  if (env.redisEnabled) {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(redis, redis.duplicate()));
  }

  // Authenticate the handshake with the same access token the REST API uses.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('AUTH_REQUIRED'));
      const payload = jwt.verify(token, env.USER_JWT_SECRET);
      if (payload.typ !== 'user') return next(new Error('TOKEN_INVALID'));
      if (await redis.exists(`revoked:sid:${payload.sid}`)) return next(new Error('SESSION_REVOKED'));
      const user = await User.findById(payload.sub).select('status').lean();
      if (!user || ['banned', 'deleted'].includes(user.status)) return next(new Error('ACCOUNT_BLOCKED'));
      socket.data.userId = String(payload.sub);
      socket.data.sid = payload.sid;
      next();
    } catch (err) {
      next(new Error(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    onConnection?.(socket, io);
  });

  logger.info('Realtime (Socket.io) ready');
  return io;
};

/** Send an event to every device a user has open. Safe to call when realtime is not running (tests, workers). */
export const emitToUser = (userId, event, payload) => {
  io?.to(`user:${userId}`).emit(event, payload);
};

/** Send an event to everyone watching a room (e.g. an auction page). */
export const emitToRoom = (room, event, payload) => {
  io?.to(room).emit(event, payload);
};

/** True when the user has at least one live connection (used to decide whether a push is needed). */
export const isOnline = async (userId) => {
  if (!io) return false;
  return (await io.in(`user:${userId}`).fetchSockets()).length > 0;
};

/** Close a user's sockets (logout from another device, ban). */
export const disconnectSession = async (sid) => {
  if (!io) return;
  for (const s of await io.fetchSockets()) if (s.data.sid === sid) s.disconnect(true);
};
