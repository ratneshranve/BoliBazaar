import { io } from 'socket.io-client';
import { env } from '../config/env';
import { getAccessToken, refreshAccessToken } from '../api/client';

/**
 * Live connection to the server (new chat messages, notifications, read receipts, typing).
 * It is only a live feed — screens always load their data from the REST API first, so a missed
 * event never loses anything. The socket lives on the same host as the API.
 */
let socket = null;
const listeners = new Map(); // event -> Set<fn>

// VITE_API_BASE_URL may be a full address (https://api.example.com/api/v1) or a path on this site (/api/v1,
// when nginx serves the API under the same domain); a path resolves against the page's own address.
const origin = () => new URL(env.apiBaseUrl, window.location.origin).origin;

const attach = (s) => {
  for (const [event, fns] of listeners) for (const fn of fns) s.on(event, fn);
};

export const connectRealtime = () => {
  if (socket || !getAccessToken()) return;
  let target;
  try {
    target = origin();
  } catch {
    return; // a bad API address must never take the whole app down; live updates just stay off
  }
  socket = io(target, {
    // function form: reconnects always present the newest access token
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket'],
    reconnectionDelayMax: 10_000,
  });
  attach(socket);
  socket.on('connect', () => rejoin());
  socket.on('connect_error', async (err) => {
    // the 15-minute access token ran out: get a fresh one and let socket.io retry
    if (err.message === 'TOKEN_EXPIRED' && !(await refreshAccessToken())) disconnectRealtime();
    else if (['TOKEN_INVALID', 'SESSION_REVOKED', 'ACCOUNT_BLOCKED'].includes(err.message)) disconnectRealtime();
  });
};

export const disconnectRealtime = () => {
  socket?.disconnect();
  socket = null;
};

/** Listen for a server event; returns the unsubscribe function. */
export const onRealtime = (event, fn) => {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  socket?.on(event, fn);
  return () => {
    listeners.get(event)?.delete(fn);
    socket?.off(event, fn);
  };
};

export const emitRealtime = (event, payload) => socket?.emit(event, payload);

/** Auction pages being watched; rejoined automatically after a reconnect. */
const watched = new Set();
export const watchAuction = (auctionId) => {
  watched.add(auctionId);
  socket?.emit('auction:watch', { auctionId });
  return () => {
    watched.delete(auctionId);
    socket?.emit('auction:unwatch', { auctionId });
  };
};
const rejoin = () => watched.forEach((auctionId) => socket?.emit('auction:watch', { auctionId }));
