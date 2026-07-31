import webpush from 'web-push'
import { prisma } from './prisma.js'

const vapid = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT || 'mailto:admin@distrikriss.com',
}

export function pushConfigured() {
  return Boolean(vapid.publicKey && vapid.privateKey)
}

if (pushConfigured()) {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
}

async function send(subscription, payload) {
  if (!pushConfigured()) return
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: subscription.endpoint },
      })
    }
  }
}

export async function sendToUser(userId, payload) {
  if (!pushConfigured()) return
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  await Promise.all(
    subs.map((s) =>
      send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload),
    ),
  )
}

export async function sendToAdmins(payload) {
  if (!pushConfigured()) return
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } })
  await Promise.all(admins.map((a) => sendToUser(a.id, payload)))
}
