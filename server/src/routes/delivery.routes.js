import { Router } from 'express'
import { z } from 'zod'
import { rateLimit } from '../middleware/auth.js'
import {
  getSettings,
  getZones,
  getZoneById,
  deliveryCheck,
  nextDeliveryDates,
  slotAvailabilityFor,
  occupancyForDates,
  slotsWithAvailability,
  parseLocalDate,
} from '../lib/delivery.js'
import { localDateKey } from '../lib/date.js'

const router = Router()

router.get('/zones', async (req, res, next) => {
  try {
    const zones = await getZones()
    res.json({
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        color: z.color,
        polygon: z.polygon,
        enabled: z.enabled,
      })),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/slots', async (req, res, next) => {
  try {
    const settings = await getSettings()
    const zone = (await getZoneById(req.query.zoneId)) || (await getZones()).find((z) => z.enabled) || null
    if (!zone) return res.json({ dates: [] })
    const dates = nextDeliveryDates(zone, settings)
    // Una sola consulta para todas las fechas, en lugar de una por día.
    const { countsByDate } = await occupancyForDates(dates)
    const result = dates.map((date) => {
      const counts = countsByDate[localDateKey(date)] || {}
      return {
        date: localDateKey(date),
        weekday: date.getDay(),
        slots: slotsWithAvailability(zone, counts),
      }
    })
    res.json({ dates: result })
  } catch (err) {
    next(err)
  }
})

router.get('/slots/:date', async (req, res, next) => {
  try {
    const date = parseLocalDate(req.params.date)
    const zone = (await getZoneById(req.query.zoneId)) || (await getZones()).find((z) => z.enabled) || null
    if (!zone) return res.json({ date: localDateKey(date), slots: [] })
    const slots = await slotAvailabilityFor(date, zone)
    res.json({ date: localDateKey(date), slots })
  } catch (err) {
    next(err)
  }
})

router.get('/check', rateLimit({ windowMs: 60_000, max: 120 }), async (req, res, next) => {
  try {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Parámetros lat/lng inválidos' })
    }
    // Rango válido en el planeta: una latitud de 900 no es un error de la tienda.
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordenadas fuera de rango' })
    }
    const info = await deliveryCheck(lat, lng)
    res.json({ ...info, storeAddress: undefined })
  } catch (err) {
    next(err)
  }
})

/**
 * Cobertura de una dirección sin necesidad de guardarla.
 *
 * Es lo que usa el aviso "¿llegamos a tu casa?": el cliente escribe su
 * dirección o usa su ubicación, y sabe si hay entrega antes de crear nada.
 */
router.post('/check', rateLimit({ windowMs: 60_000, max: 120 }), async (req, res, next) => {
  try {
    const { lat, lng } = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      })
      .parse(req.body || {})
    const info = await deliveryCheck(lat, lng)
    res.json(info)
  } catch (err) {
    next(err)
  }
})

export default router