import { config } from '../config.js'
import { prisma } from './prisma.js'

export function whatsappConfigured() {
  return Boolean(
    config.whatsapp.enabled &&
      config.whatsapp.baseUrl &&
      config.whatsapp.apiKey &&
      config.whatsapp.sessionId,
  )
}

export function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith(config.whatsapp.countryCode)) {
    digits = config.whatsapp.countryCode + digits
  }
  return `${digits}@c.us`
}

export async function getStorePhone() {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } })
    return s?.whatsapp || null
  } catch {
    return null
  }
}

export async function sendWhatsApp({ to, text }) {
  if (!whatsappConfigured()) return { ok: false, skipped: true }
  try {
    const chatId = String(to).includes('@c.us') ? String(to) : normalizePhone(to)
    if (!chatId) return { ok: false, skipped: true }
    const res = await fetch(
      `${config.whatsapp.baseUrl}/sessions/${config.whatsapp.sessionId}/messages/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.whatsapp.apiKey,
        },
        body: JSON.stringify({ chatId, text }),
      },
    )
    if (!res.ok) {
      console.error(`[whatsapp] error ${res.status}: ${await res.text()}`)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error(`[whatsapp] send failed: ${err.message}`)
    return { ok: false }
  }
}
