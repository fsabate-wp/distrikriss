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

// Caché de API: SOLO endpoints públicos. Nunca la sesión ni datos personales.
//
// Antes se cacheaba "el resto de la API" (todo salvo /api/auth), lo que incluía
// /api/orders y /api/addresses: el pedido y las direcciones de una persona
// quedaban en la Cache Storage del dispositivo y sobrevivían al cierre de sesión,
// a la vista de quien usara ese navegador después. El catálogo tampoco se cachea
// (su precio decide lo que se cobra). Aquí solo entran respuestas sin usuario.
const CACHE_PUBLICA = /^\/api\/(settings|delivery)\//
registerRoute(
  ({ url, request, sameOrigin }) =>
    sameOrigin && request.method === 'GET' && CACHE_PUBLICA.test(url.pathname),
  new NetworkFirst({
    cacheName: 'public-api',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 }),
    ],
  }),
)

// Al activar una versión nueva se purga la caché de API anterior: podía contener
// respuestas con datos personales de cuando se cacheaba toda la API.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('api-cache'))
})

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
