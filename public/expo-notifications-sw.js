// Web push service worker — required by expo-notifications (notification.serviceWorkerPath
// in app.json). Files in /public are copied to the export root by Metro web, so this is
// served at /expo-notifications-sw.js. Handles the push events the subscription in
// src/lib/pushNotifications.ts receives once something sends to it.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Xantle', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Xantle';
  const options = {
    body: payload.body,
    icon: '/assets/images/icon.png',
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    }),
  );
});
