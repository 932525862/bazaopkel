self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/social-image.png', // Fallback to logo
      badge: '/social-image.png',
      data: data.data || {},
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Bildirishnoma', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const relativePath = event.notification.data?.url || '/';
  // Build an absolute URL using the SW scope (frontend origin) so we never
  // accidentally navigate to the backend's origin.
  const scope = self.registration.scope; // e.g. "http://localhost:5173/"
  const urlToOpen = new URL(relativePath, scope).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Focus an existing tab that is already on the same origin
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.startsWith(scope) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
