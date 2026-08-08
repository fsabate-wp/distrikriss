import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'

const router = Router()

const PUBLIC_FIELDS = {
  storeName: true,
  accentColor: true,
  secondaryColor: true,
  storeOpen: true,
  faviconUrl: true,
  appIconUrl: true,
  currency: true,
  phone: true,
  whatsapp: true,
  email: true,
  storeAddress: true,
  storeLat: true,
  storeLng: true,
  deliveryRadiusKm: true,
  deliveryFeeBase: true,
  deliveryFeePerKm: true,
  minOrderAmount: true,
  orderCutoff: true,
  deliveryDays: true,
  openHours: true,
  slots: true,
  sriEnabled: true,
}

router.get('/public', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    if (!settings) return res.status(404).json({ error: 'Configuración no encontrada' })
    const out = {}
    for (const [key, enabled] of Object.entries(PUBLIC_FIELDS)) {
      if (enabled) out[key] = settings[key]
    }
    res.json({ settings: out })
  } catch (err) {
    next(err)
  }
})

const absolute = (url) => (url && url.startsWith('/') ? `${config.publicApiUrl}${url}` : url || null)

router.get('/manifest', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    const name = settings?.storeName || 'DistriKriss'
    const iconUrl = absolute(settings?.appIconUrl)
    const icons = iconUrl
      ? [
          { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: iconUrl, sizes: '192x192', type: 'image/png' },
        ]
      : []
    const appOrigin = config.appUrl.replace(/\/$/, '')
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    res.json({
      name,
      short_name: name,
      description: 'Pide online con entrega programada',
      id: `${appOrigin}/`,
      start_url: `${appOrigin}/`,
      scope: `${appOrigin}/`,
      theme_color: '#ff0000',
      background_color: '#ff0000',
      display: 'standalone',
      orientation: 'portrait',
      lang: 'es',
      icons,
    })
  } catch (err) {
    next(err)
  }
})

export default router
