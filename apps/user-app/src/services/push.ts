import { Platform, PermissionsAndroid } from 'react-native';
import {
  getMessaging,
  getToken,
  onTokenRefresh,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  requestPermission,
  AuthorizationStatus,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { authApi } from '../api/endpoints';
import { getDeviceId, deviceMeta } from './device';
import { kv, KV } from './storage';

const messaging = getMessaging();
const CHANNEL_ID = 'default';

export type PushRoute = { route: string; params: Record<string, unknown> };
type OpenHandler = (r: PushRoute) => void;

const parseRoute = (data?: Record<string, unknown>): PushRoute | null => {
  if (!data?.route) return null;
  let params: Record<string, unknown> = {};
  try {
    params = typeof data.params === 'string' ? JSON.parse(data.params) : {};
  } catch {
    params = {};
  }
  return { route: String(data.route), params };
};

/** Must be called once at module load (index.js) — handles data messages while app is killed. */
export const registerBackgroundHandler = () => {
  setBackgroundMessageHandler(messaging, async () => {
    /* Notification payloads are displayed by the OS; nothing to do for now. */
  });
};

export const ensureChannel = () =>
  notifee.createChannel({ id: CHANNEL_ID, name: 'General', importance: AndroidImportance.HIGH });

/** Ask OS permission (Android 13+ runtime permission / iOS prompt). Returns true if allowed. */
export const requestPushPermission = async () => {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  const status = await requestPermission(messaging);
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
};

const sendTokenToBackend = async (fcmToken: string) => {
  const meta = deviceMeta();
  await authApi.registerDevice({
    fcmToken,
    deviceId: await getDeviceId(),
    platform: meta.platform,
    osVersion: meta.osVersion,
    appVersion: meta.appVersion,
    model: meta.model,
    locale: kv.getString(KV.language),
  });
  kv.set(KV.fcmToken, fcmToken);
};

/** Called after every login and on app start when logged in. */
export const registerPushToken = async () => {
  await ensureChannel();
  const allowed = await requestPushPermission();
  if (!allowed) return false;
  const token = await getToken(messaging);
  await sendTokenToBackend(token);
  return true;
};

/** Listeners: foreground display, token refresh, taps. Returns unsubscribe. */
export const startPushListeners = (onOpen: OpenHandler, isLoggedIn: () => boolean) => {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    onTokenRefresh(messaging, token => {
      if (isLoggedIn()) sendTokenToBackend(token).catch(() => {});
    }),
  );

  unsubs.push(
    onMessage(messaging, async msg => {
      if (!msg.notification) return;
      await notifee.displayNotification({
        title: msg.notification.title,
        body: msg.notification.body,
        data: msg.data as Record<string, string>,
        android: { channelId: CHANNEL_ID, pressAction: { id: 'default' }, smallIcon: 'ic_launcher' },
      });
    }),
  );

  unsubs.push(
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        const r = parseRoute(detail.notification?.data as Record<string, unknown>);
        if (r) onOpen(r);
      }
    }),
  );

  unsubs.push(
    onNotificationOpenedApp(messaging, msg => {
      const r = parseRoute(msg.data);
      if (r) onOpen(r);
    }),
  );

  getInitialNotification(messaging).then(msg => {
    const r = parseRoute(msg?.data);
    if (r) onOpen(r);
  });

  return () => unsubs.forEach(u => u());
};
