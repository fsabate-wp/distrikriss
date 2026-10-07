import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { decryptSecret } from '../lib/crypto.js'

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
  deliveryFeeBase: true,
  deliveryFeePerKm: true,
  minOrderAmount: true,
  orderCutoff: true,
  deliveryDays: true,
  openHours: true,
  slots: true,
  sriEnabled: true,
  // El mapa de cobertura necesita saber donde esta la tienda. Sin estos campos,
  // settings.storeLocation llegaba con undefined y el mapa se centraba en unas
  // coordenadas fijas que no tienen relacion con la tienda real.
  storeLat: true,
  storeLng: true,
  storeAddress: true,
  deliveryRadiusKm: true,
}

/**
 * Datos bancarios que el cliente necesita ver para pagar por transferencia.
 *
 * Se descifran aqui porque el checkout los muestra, pero el resto de la
 * configuracion publica no los expone: antes iban en claro en
 * settings.bankTransfer y se enviaban a cualquier visitante.
 */
function publicBankTransfer(settings) {
  if (settings?.bankTransferEnc) {
    try {
      return decryptSecret(settings.bankTransferEnc)
    } catch {
      return null
    }
  }
  // Instalaciones anteriores a la migración: aún sin cifrar.
  return settings?.bankTransfer && Object.keys(settings.bankTransfer).length ? settings.bankTransfer : null
}

router.get('/public', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    if (!settings) return res.status(404).json({ error: 'Configuración no encontrada' })
    const out = {}
    for (const [key, enabled] of Object.entries(PUBLIC_FIELDS)) {
      if (enabled) out[key] = settings[key]
    }
    out.bankTransfer = publicBankTransfer(settings)
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
