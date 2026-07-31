import { haversineKm } from './geo.js'
import { prisma } from './prisma.js'
import { parseLocalDate, startOfLocalDay, minutesOfDay } from './date.js'

const round = (n, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!s) throw Object.assign(new Error('Configuración no disponible'), { status: 500 })
  return s
}

export function computeDeliveryFee(distanceKm, settings) {
  const base = Number(settings.deliveryFeeBase) || 0
  const perKm = Number(settings.deliveryFeePerKm) || 0
  return round(base + perKm * distanceKm)
}

export function isDeliveryDay(date, settings) {
  const days = settings.deliveryDays ?? []
  return Array.isArray(days) && days.includes(date.getDay())
}

export function canOrderToday(settings, now = new Date()) {
  const cutoff = settings.orderCutoff || '18:00'
  const [ch, cm] = cutoff.split(':').map(Number)
  return minutesOfDay(now) < ch * 60 + cm
}

export function nextDeliveryDates(settings, now = new Date(), count = 7) {
  const dates = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!canOrderToday(settings, now)) cursor.setDate(cursor.getDate() + 1)
  let guard = 0
  while (dates.length < count && guard < 60) {
    if (isDeliveryDay(cursor, settings)) dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
    guard += 1
  }
  return dates
}

export async function slotAvailabilityFor(date, settings) {
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
  return (settings.slots ?? []).map((slot) => {
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
  const distanceKm = haversineKm(settings.storeLat, settings.storeLng, Number(lat), Number(lng))
  const withinRadius = distanceKm <= settings.deliveryRadiusKm
  const deliveryFee = withinRadius ? computeDeliveryFee(distanceKm, settings) : 0
  return {
    distanceKm: round(distanceKm),
    withinRadius,
    deliveryFee: round(deliveryFee),
  }
}

export function validateDeliveryDay(deliveryDate, settings, now = new Date()) {
  if (!isDeliveryDay(deliveryDate, settings)) {
    return { ok: false, code: 'NOT_DELIVERY_DAY', message: 'Ese día no hay entregas programadas' }
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
