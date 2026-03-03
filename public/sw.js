/// <reference lib="webworker" />

// Navi Chat — Push notification service worker

self.addEventListener('push', (event) => {
  /** @type {{ title?: string; body?: string; url?: string }} */
  const data = event.data ? event.data.json() : {}

  const title = data.title || 'Navi Chat'
  const options = {
    body: data.body || 'Something happened in Navi Chat',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing window if one is open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url)
    }),
  )
})
