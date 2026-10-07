import admin from 'firebase-admin';
import { env, integrations } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Device } from '../../modules/auth/auth.models.js';

let app = null;

const getMessaging = () => {
  if (!integrations.firebase.configured) return null;
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.firebasePrivateKey,
      }),
    });
  }
  return admin.messaging(app);
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Send a push to all active devices of a user.
 * payload: { title, body, image?, route?, params?, data?, collapseKey? }
 * Returns { sent, failed, skipped } — skipped=true when Firebase is not configured (logged).
 */
export const pushToUser = async (userId, payload) => {
  const messaging = getMessaging();
  if (!messaging) {
    logger.warn('Push skipped: Firebase not configured', { userId });
    return { sent: 0, failed: 0, skipped: true };
  }
  const devices = await Device.find({ userId, pushEnabled: true }).select('fcmToken').lean();
  if (!devices.length) return { sent: 0, failed: 0, skipped: false };

  const data = {
    route: payload.route || '',
    params: JSON.stringify(payload.params || {}),
    ...(payload.data ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, String(v)])) : {}),
  };

  const res = await messaging.sendEachForMulticast({
    tokens: devices.map((d) => d.fcmToken),
    notification: { title: payload.title, body: payload.body, ...(payload.image ? { imageUrl: payload.image } : {}) },
    data,
    android: { priority: 'high', collapseKey: payload.collapseKey, notification: { channelId: payload.channelId || 'default' } },
    apns: { payload: { aps: { sound: 'default', 'thread-id': payload.collapseKey } } },
  });

  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success && INVALID_TOKEN_CODES.has(r.error?.code)) dead.push(devices[i].fcmToken);
  });
  if (dead.length) await Device.deleteMany({ fcmToken: { $in: dead } });

  return { sent: res.successCount, failed: res.failureCount, skipped: false };
};
