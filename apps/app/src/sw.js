import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)

/**
 * El catálogo NO se cachea.
 *
 * El precio del producto determina lo que se cobra, y un catálogo servido desde
 * la caché puede enseñar un precio que el servidor ya cambió. Con NetworkFirst
 * y un timeout de 4 s, un cliente con la conexión lenta terminaba-armando el
 * carrito con precios viejos y se llevaba un susto en la caja. El servidor
 * siempre es la fuente, y un fallo de red se muestra como fallo de red.
 */
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/catalog'),
  new NetworkOnly(),
)

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

// El resto de la API sí puede venir de caché un momento, pero nunca la sesión:
// un `/api/auth/me` cacheado hace que la app crea que hay una sesión viva que el
// servidor ya no reconoce. Solo GET, para que un POST de pedido jamás se guarde.
registerRoute(
  ({ url, request, sameOrigin }) =>
    sameOrigin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 }),
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
