/* global firebase, importScripts, clients */
/**
 * Browser push (Firebase Cloud Messaging). Registered by src/user/services/push.js, which passes the
 * Firebase web config and SDK version in this file's URL (a service worker cannot read Vite env values).
 */
const params = new URL(self.location.href).searchParams;

/* Opens the page the notification points to (backend sends data.route, e.g. /listing/<id>).
   Added before Firebase loads so it runs ahead of Firebase's own click handler. */
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const route = data.route || data.FCM_MSG?.data?.route || '/notifications';
  event.notification.close();
  const url = new URL(route, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const tab = list.find((c) => new URL(c.url).origin === self.location.origin && !new URL(c.url).pathname.startsWith('/admin'));
      if (tab) return tab.focus().then(() => tab.navigate(url));
      return clients.openWindow(url);
    })
  );
});

const version = params.get('v');
let config = null;
try {
  config = JSON.parse(params.get('config') || 'null');
} catch {
  config = null;
}

if (version && config) {
  importScripts(
    `https://www.gstatic.com/firebasejs/${version}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${version}/firebase-messaging-compat.js`
  );
  firebase.initializeApp(config);
  // Messages with a "notification" part are shown by Firebase automatically while the site is closed or in the background.
  firebase.messaging();
}
