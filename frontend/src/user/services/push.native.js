import { PermissionsAndroid, Platform } from 'react-native';
import { getApps } from '@react-native-firebase/app';
import { getMessaging, getToken, onTokenRefresh, onMessage, onNotificationOpenedApp, getInitialNotification, requestPermission, AuthorizationStatus, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { authApi } from '../api/endpoints';
import { getDeviceId, deviceMeta } from './device';
import { kv, KV } from './storage';

/**
 * Phone push (Firebase Cloud Messaging). Set up by android/app/google-services.json; without it push
 * is simply off. Same exports as the website's push.js, plus the listeners the phone needs.
 */
const pushAvailable = () => getApps().length > 0;
let cached = null;
const fcm = () => (cached ??= getMessaging());
const CHANNEL_ID = 'default';

const routeOf = (data) => (data?.route ? String(data.route) : null);

/** Called once at start-up (index.js): handles pushes that arrive while the app is closed. */
export const registerBackgroundHandler = () => {
  if (!pushAvailable()) return;
  setBackgroundMessageHandler(fcm(), async () => {
    /* the system shows notification messages itself */
  });
};

const askPermission = async () => {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  const status = await requestPermission(fcm());
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
};

const sendToken = async (fcmToken) => {
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

/** After login (and on every start while logged in). */
export const registerPushToken = async () => {
  if (!pushAvailable()) return false;
  await notifee.createChannel({ id: CHANNEL_ID, name: 'General', importance: AndroidImportance.HIGH });
  if (!(await askPermission())) return false;
  await sendToken(await getToken(fcm()));
  return true;
};

/** Before logout: stop pushes to this phone. */
export const unregisterPushToken = async () => {
  const fcmToken = kv.getString(KV.fcmToken);
  if (!fcmToken) return;
  kv.remove(KV.fcmToken);
  await authApi.removeDevice(fcmToken).catch(() => {});
};

/** Show pushes while the app is open, keep the token fresh, and open the right screen on tap. */
export const startPushListeners = (open, isLoggedIn) => {
  if (!pushAvailable()) return () => {};
  const m = fcm();
  const offs = [
    onTokenRefresh(m, (t) => isLoggedIn() && sendToken(t).catch(() => {})),
    onMessage(m, async (msg) => {
      if (!msg.notification) return;
      await notifee.displayNotification({
        title: msg.notification.title,
        body: msg.notification.body,
        data: msg.data,
        android: { channelId: CHANNEL_ID, pressAction: { id: 'default' }, smallIcon: 'ic_launcher' },
      });
    }),
    notifee.onForegroundEvent(({ type, detail }) => {
      const r = type === EventType.PRESS && routeOf(detail.notification?.data);
      if (r) open(r);
    }),
    onNotificationOpenedApp(m, (msg) => {
      const r = routeOf(msg.data);
      if (r) open(r);
    }),
  ];
  getInitialNotification(m).then((msg) => {
    const r = routeOf(msg?.data);
    if (r) setTimeout(() => open(r), 500);
  });
  return () => offs.forEach((f) => f());
};
