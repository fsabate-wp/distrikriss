import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import router from './router/index.js'
import './assets/styles.css'
import 'leaflet/dist/leaflet.css'

/**
 * Actualización de la PWA.
 *
 * `registerType: 'autoUpdate'` no hace nada aquí porque el registro es manual
 * (`injectRegister: false`): el service worker nuevo se instalaba y se quedaba
 * esperando a que se cerraran TODAS las pestañas. Con el navegador abierto, el
 * cliente seguía ejecutando el bundle viejo, con los precios y las reglas
 * antiguas, aunque el servidor ya tuviera el arreglo. Por eso un despliegue
 * parecía no aplicarse nunca.
 *
 * Aquí se fuerza el `skipWaiting` y se recarga en cuanto el worker nuevo toma
 * el control, que es justo lo que quiere `autoUpdate`.
 */
registerSW({
  immediate: true,
  onNeedRefresh() {
    // No hay nada que preguntar: es un despliegue, no una decisión del usuario.
    void navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' })
  },
  onOfflineReady() {
    /* la app ya está cacheada y funciona sin conexión */
  },
})

// Tras `skipWaiting` cambia el controlador del service worker. Se recarga una
// sola vez para no entrar en un bucle.
let recargando = false
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (recargando) return
  recargando = true
  window.location.reload()
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
