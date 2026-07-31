import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

const PUBLIC_FIELDS = {
  storeName: true,
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

export default router
