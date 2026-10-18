/**
 * Configuración resuelta en el arranque, no al compilar.
 *
 * El bundle no lleva la URL de la API: en producción el contenedor escribe
 * `/config.js` (ver `apps/app/runtime-config.sh`) con la URL y la clave VAPID
 * tomadas del entorno. Así el mismo build vale para cualquier entorno y no se
 * cuela un `http://localhost:4000` compilado dentro.
 *
 * En desarrollo no hay `/config.js`: se usan las variables de Vite.
 */
const runtime = typeof window !== 'undefined' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {}

export const API_URL = runtime.apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:4000'
export const VAPID_PUBLIC_KEY = runtime.vapidPublicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
