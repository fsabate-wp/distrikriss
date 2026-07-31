import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.hostname === 'tile.openstreetmap.org',
  new CacheFirst({
    cacheName: 'osm-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
)

registerRoute(
  ({ url }) => url.pathname.includes('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 5 * 60 }),
    ],
  }),
)

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    /* noop */
  }
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || 'default',
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'DistriKriss', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(url.origin) && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url.href)
    }),
  )
})
