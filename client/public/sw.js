// Flow Guru Service Worker — Push Notifications + Offline Cache
const CACHE_NAME = 'flow-guru-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Flow Guru', body: event.data.text() }; }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'flow-guru-reminder',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    data: { url: data.url || '/' },
    actions: data.actions || [],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Flow Guru', options),
      // Also notify clients to play sound if app is open
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ 
            type: 'PLAY_ALARM', 
            alarmSound: data.alarmSound || 'chime',
            label: data.title,
            spokenMsg: data.body
          });
        }
      })
    ])
  );
});

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// Background sync for reminders (fallback when push server not available)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_REMINDER') {
    const { title, body, delay, alarmSound } = event.data;
    setTimeout(() => {
      // Show OS notification
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        tag: 'flow-guru-reminder',
        renotify: true,
      });
      // Tell all open client pages to play the alarm sound
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ type: 'PLAY_ALARM', alarmSound: alarmSound || 'chime' });
        }
      });
    }, delay);
  }
});
