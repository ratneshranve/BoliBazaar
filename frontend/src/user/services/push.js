import { initializeApp, getApps, SDK_VERSION } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { env } from '../config/env';
import { authApi } from '../api/endpoints';
import { getDeviceId } from './device';
import { kv, KV } from './storage';

/**
 * Browser push (web stand-in for the RN app's FCM service). Off when the Firebase web config is
 * missing or the browser has no push support; every function is then a no-op.
 * With no tab of the site in view, the service worker shows the notification; a tab in view already
 * gets it live (bell + list), so nothing extra is shown there.
 */
const configured = () => Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.messagingSenderId && env.firebase.appId);

let messagingPromise = null;
const messaging = () =>
  (messagingPromise ??= (async () => {
    if (!configured() || !('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported())) return null;
    const app = getApps()[0] ?? initializeApp(env.firebase);
    return getMessaging(app);
  })());

let swPromise = null;
const serviceWorker = () =>
  (swPromise ??= navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?v=${SDK_VERSION}&config=${encodeURIComponent(JSON.stringify(env.firebase))}`,
    { scope: '/firebase-cloud-messaging-push-scope' }
  ));

/** Called when the user is logged in. Asks permission once; after that it refreshes the token silently. */
export const registerPushToken = async () => {
  const m = await messaging();
  if (!m || Notification.permission === 'denied') return false;
  if (Notification.permission === 'default' && (await Notification.requestPermission()) !== 'granted') return false;

  const fcmToken = await getToken(m, {
    serviceWorkerRegistration: await serviceWorker(),
    ...(env.firebaseVapidKey ? { vapidKey: env.firebaseVapidKey } : {}),
  });
  if (!fcmToken) return false;
  await authApi.registerDevice({
    fcmToken,
    deviceId: await getDeviceId(),
    platform: 'web',
    osVersion: navigator.userAgent.slice(0, 40),
    locale: kv.getString(KV.language),
  });
  kv.set(KV.fcmToken, fcmToken);
  return true;
};

/** Before logout: stop pushes to this browser (best effort). */
export const unregisterPushToken = async () => {
  const fcmToken = kv.getString(KV.fcmToken);
  if (!fcmToken) return;
  kv.remove(KV.fcmToken);
  await authApi.removeDevice(fcmToken).catch(() => {});
};
