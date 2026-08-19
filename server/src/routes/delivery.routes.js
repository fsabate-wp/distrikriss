import { Router } from 'express'
import {
  getSettings,
  getZones,
  getZoneById,
  deliveryCheck,
  nextDeliveryDates,
  slotAvailabilityFor,
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
    const result = []
    for (const date of dates) {
      const slots = await slotAvailabilityFor(date, zone, settings)
      result.push({
        date: localDateKey(date),
        weekday: date.getDay(),
        slots,
      })
    }
    res.json({ dates: result })
  } catch (err) {
    next(err)
  }
})

router.get('/slots/:date', async (req, res, next) => {
  try {
    const date = parseLocalDate(req.params.date)
    const settings = await getSettings()
    const zone = (await getZoneById(req.query.zoneId)) || (await getZones()).find((z) => z.enabled) || null
    if (!zone) return res.json({ date: localDateKey(date), slots: [] })
    const slots = await slotAvailabilityFor(date, zone, settings)
    res.json({ date: localDateKey(date), slots })
  } catch (err) {
    next(err)
  }
})

router.get('/check', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Parámetros lat/lng inválidos' })
    }
    const info = await deliveryCheck(lat, lng)
    res.json({ ...info })
  } catch (err) {
    next(err)
  }
})

export default router