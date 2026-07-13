self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'Palawan Delivery Express', body: event.data ? event.data.text() : 'You have a new update.' }; }
  const options = {
    body: data.body || '',
    vibrate: [200, 100, 200, 100, 200],
    data: { url: data.url || '/rider' },
    tag: 'pde-notification',
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Palawan Delivery Express', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url);
    })
  );
});
