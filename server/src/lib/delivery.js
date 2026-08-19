import { haversineKm, polygonFromCircle, closeRing } from './geo.js'
import { booleanPointInPolygon, point as turfPoint } from '@turf/turf'
import { prisma } from './prisma.js'
import { parseLocalDate, startOfLocalDay, minutesOfDay } from './date.js'

const round = (n, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!s) throw Object.assign(new Error('Configuración no disponible'), { status: 500 })
  return s
}

export async function ensureDefaultZone() {
  const count = await prisma.deliveryZone.count()
  if (count > 0) return
  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!settings) return
  const polygon = polygonFromCircle(settings.storeLat, settings.storeLng, settings.deliveryRadiusKm || 5)
  await prisma.deliveryZone.create({
    data: {
      name: 'Zona por defecto',
      polygon,
      enabled: true,
      deliveryDays: Array.isArray(settings.deliveryDays) ? settings.deliveryDays : [0, 1, 2, 3, 4, 5, 6],
      slots: Array.isArray(settings.slots) ? settings.slots : [],
      deliveryFeeBase: settings.deliveryFeeBase,
      deliveryFeePerKm: settings.deliveryFeePerKm,
      minOrderAmount: settings.minOrderAmount,
      sortOrder: 0,
    },
  })
}

export async function getZones() {
  const count = await prisma.deliveryZone.count()
  if (count === 0) await ensureDefaultZone()
  return prisma.deliveryZone.findMany({ orderBy: { sortOrder: 'asc' } })
}

export async function getZoneById(id) {
  if (!id) return null
  return prisma.deliveryZone.findUnique({ where: { id } })
}

export async function resolveZone(lat, lng, zones) {
  const list = zones || (await getZones())
  const pt = turfPoint([Number(lng), Number(lat)])
  return list.find((z) => z.enabled && booleanPointInPolygon(pt, closeRing(z.polygon))) || null
}

export function computeDeliveryFee(distanceKm, zone) {
  const base = Number(zone.deliveryFeeBase) || 0
  const perKm = Number(zone.deliveryFeePerKm) || 0
  return round(base + perKm * distanceKm)
}

export function isDeliveryDay(date, zone) {
  const days = zone?.deliveryDays ?? []
  return Array.isArray(days) && days.includes(date.getDay())
}

export function canOrderToday(settings, now = new Date()) {
  const cutoff = settings.orderCutoff || '18:00'
  const [ch, cm] = cutoff.split(':').map(Number)
  return minutesOfDay(now) < ch * 60 + cm
}

export function nextDeliveryDates(zone, settings, now = new Date(), count = 7) {
  const dates = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!canOrderToday(settings, now)) cursor.setDate(cursor.getDate() + 1)
  let guard = 0
  while (dates.length < count && guard < 60) {
    if (isDeliveryDay(cursor, zone)) dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
    guard += 1
  }
  return dates
}

export async function slotAvailabilityFor(date, zone, settings) {
  const start = startOfLocalDay(date)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  const booked = await prisma.order.groupBy({
    by: ['slotId'],
    where: {
      deliveryDate: { gte: start, lte: end },
      status: { notIn: ['CANCELLED'] },
    },
    _count: { _all: true },
  })
  const counts = Object.fromEntries(booked.map((b) => [b.slotId, b._count._all]))
  return (zone?.slots ?? []).map((slot) => {
    const bookedCount = counts[slot.id] ?? 0
    const capacity = slot.capacity ?? 0
    return {
      id: slot.id,
      label: slot.label,
      start: slot.start,
      end: slot.end,
      capacity,
      booked: bookedCount,
      remaining: Math.max(0, capacity - bookedCount),
      available: bookedCount < capacity,
    }
  })
}

export async function deliveryCheck(lat, lng) {
  const settings = await getSettings()
  const zones = await getZones()
  const zone = await resolveZone(lat, lng, zones)
  const distanceKm = haversineKm(settings.storeLat, settings.storeLng, Number(lat), Number(lng))
  if (!zone) {
    return {
      withinZone: false,
      zoneId: null,
      zoneName: null,
      distanceKm: round(distanceKm),
      deliveryFee: 0,
      minOrderAmount: Number(settings.minOrderAmount),
    }
  }
  const deliveryFee = computeDeliveryFee(distanceKm, zone)
  return {
    withinZone: true,
    zoneId: zone.id,
    zoneName: zone.name,
    distanceKm: round(distanceKm),
    deliveryFee: round(deliveryFee),
    minOrderAmount: Number(zone.minOrderAmount),
  }
}

export function validateDeliveryDay(deliveryDate, zone, settings, now = new Date()) {
  if (!isDeliveryDay(deliveryDate, zone)) {
    return { ok: false, code: 'NOT_DELIVERY_DAY', message: 'Ese día no hay entregas programadas en tu zona' }
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (deliveryDate.getTime() < today.getTime()) {
    return { ok: false, code: 'PAST_DATE', message: 'La fecha de entrega ya pasó' }
  }
  if (deliveryDate.getTime() === today.getTime() && !canOrderToday(settings, now)) {
    return { ok: false, code: 'CUTOFF_PASSED', message: 'Pasó la hora de corte para entregas de hoy' }
  }
  return { ok: true }
}

export { parseLocalDate }