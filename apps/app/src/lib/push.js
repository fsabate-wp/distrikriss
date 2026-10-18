import { api } from '../api/client.js'
import { VAPID_PUBLIC_KEY as VAPID_KEY } from './config.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID_KEY)
}

export async function registerPush() {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      })
    }
    const json = sub.toJSON()
    await api.post('/api/push/subscribe', {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    })
  } catch {
    /* noop */
  }
}

export async function unregisterPush() {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const json = sub.toJSON()
      await api.post('/api/push/unsubscribe', { endpoint: json.endpoint })
      await sub.unsubscribe()
    }
  } catch {
    /* noop */
  }
}
