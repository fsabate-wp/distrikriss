import { haversineKm, polygonFromCircle, closeRing, dentroDeZona, verticesOf, distanciaAlBordeM } from './geo.js'
import { prisma } from './prisma.js'
import { parseLocalDate, startOfLocalDay, minutesOfDay, localDateKey, addDays } from './date.js'

const round = (n, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec

/** Cuantos dias hacia adelante se puede agendar una entrega. */
export const MAX_DIAS_ANTICIPACION = 30

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!s) throw Object.assign(new Error('Configuración no disponible'), { status: 500 })
  return s
}

export async function ensureDefaultZone() {
  let count
  try {
    count = await prisma.deliveryZone.count()
  } catch {
    return
  }
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
  let count
  try {
    count = await prisma.deliveryZone.count()
  } catch {
    return []
  }
  if (count === 0) await ensureDefaultZone()
  return prisma.deliveryZone.findMany({ orderBy: { sortOrder: 'asc' } })
}

export async function getZoneById(id) {
  if (!id) return null
  return prisma.deliveryZone.findUnique({ where: { id } })
}

/**
 * Zona que cubre un punto.
 *
 * Si el punto cae en varias zonas (el panel avisa de solapamientos, pero nada lo
 * impide), se elige la de menor superficie: es la mas especifica y por tanto la
 * que aplica el envio y el minimo que tienen sentido. Antes se tomaba la primera
 * de la lista, asi que el resultado dependia del orden en que el administrador
 * dejo las zonas.
 */
export function resolveZone(lat, lng, zones) {
  const candidatos = (zones || []).filter((z) => z.enabled && dentroDeZona(lat, lng, z.polygon))
  if (candidatos.length === 0) return null
  if (candidatos.length === 1) return candidatos[0]

  return candidatos.reduce((mejor, z) => {
    const areaZ = areaKm2(z.polygon)
    const areaMejor = areaKm2(mejor.polygon)
    if (areaZ !== areaMejor) return areaZ < areaMejor ? z : mejor
    // Empate: decide el id, para que el resultado sea siempre el mismo.
    return String(z.id) < String(mejor.id) ? z : mejor
  })
}

/** Area aproximada de un poligono en km2, por el teorema del area. */
export function areaKm2(polygon) {
  const vertices = verticesOf(polygon)
  if (vertices.length < 3) return Infinity
  const latKm = 110.574
  const lngKm = 111.32 * Math.cos((vertices[0].lat * Math.PI) / 180)
  let area = 0
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const a = vertices[i]
    const b = vertices[i + 1]
    area += a.lng * lngKm * (b.lat * latKm) - b.lng * lngKm * (a.lat * latKm)
  }
  return Math.abs(area / 2)
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

/**
 * Disponibilidad de los horarios de una fecha concreta.
 *
 * Es informativa: entre esta consulta y el pedido puede entrar otra peticion.
 * La reserva real la hace reserveSlot, que si bloquea filas.
 */
export async function slotAvailabilityFor(date, zone) {
  const { counts } = await occupancyFor(date)
  return (zone?.slots ?? []).map((slot) => {
    const bookedCount = counts[slot.id] ?? 0
    const capacity = Number(slot.capacity) || 0
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

/**
 * Cuantos pedidos ocupan cada horario en una fecha.
 *
 * La comparacion es por dia calendario exacto (medianoche local), no por rango,
 * para que PostgreSQL pueda usar el indice.
 */
export async function occupancyFor(date) {
  const dia = startOfLocalDay(date)
  const booked = await prisma.order.groupBy({
    by: ['slotId'],
    where: {
      deliveryDate: dia,
      status: { notIn: ['CANCELLED'] },
    },
    _count: { _all: true },
  })
  return { dia, counts: Object.fromEntries(booked.map((b) => [b.slotId, b._count._all])) }
}

/** Capacidad declarada de un horario dentro de una zona. */
export function capacityOf(zone, slotId) {
  const slot = (zone?.slots ?? []).find((s) => s.id === slotId)
  return Math.max(0, Number(slot?.capacity) || 0)
}

/** Aplica la disponibilidad a los horarios de una zona. */
export function slotsWithAvailability(zone, counts = {}) {
  return (zone?.slots ?? []).map((slot) => {
    const booked = Number(counts[slot.id]) || 0
    const capacity = Number(slot.capacity) || 0
    return {
      id: slot.id,
      label: slot.label,
      start: slot.start,
      end: slot.end,
      capacity,
      booked,
      remaining: Math.max(0, capacity - booked),
      available: booked < capacity,
    }
  })
}

/**
 * Ocupación de varias fechas en una sola consulta.
 *
 * El selector de horarios pedía un GROUP BY por día, lo que multiplicaba las
 * consultas por los días de la semana. Aquí se resuelve de una vez.
 */
export async function occupancyForDates(dates) {
  if (!dates.length) return { countsByDate: {} }
  const dias = dates.map((d) => startOfLocalDay(d))
  const min = new Date(Math.min(...dias))
  const max = new Date(dias.reduce((acc, d) => (d > acc ? d : acc), dias[0]))
  max.setHours(23, 59, 59, 999)

  const rows = await prisma.order.groupBy({
    by: ['deliveryDate', 'slotId'],
    where: {
      deliveryDate: { gte: min, lte: max },
      status: { notIn: ['CANCELLED'] },
    },
    _count: { _all: true },
  })

  const countsByDate = {}
  for (const d of dates) countsByDate[localDateKey(d)] = {}
  for (const row of rows) {
    const key = localDateKey(row.deliveryDate)
    if (!countsByDate[key]) continue
    countsByDate[key][row.slotId] = (countsByDate[key][row.slotId] || 0) + row._count._all
  }
  return { countsByDate }
}

/**
 * Reserva un horario de forma atomica, dentro de la transaccion del pedido.
 *
 * La comprobacion previa de disponibilidad puede quedar obsoleta entre la
 * peticion del cliente y el guardado: dos personas pueden ver "disponible" a la
 * vez y ambas presentar el pedido. Aqui se bloquean las filas de los pedidos
 * concurrentes con FOR UPDATE y se vuelve a contar, de modo que solo una gana el
 * sitio y la otra recibe SLOT_FULL.
 */
export async function reserveSlot(tx, { date, zone, slotId }) {
  const dia = startOfLocalDay(date)
  const capacidad = capacityOf(zone, slotId)
  if (capacidad <= 0) {
    throw Object.assign(new Error('Ese horario no tiene plazas disponibles'), {
      status: 409,
      code: 'SLOT_FULL',
    })
  }

  /**
   * Bloqueo de la fila antes de contar.
   *
   * PostgreSQL no admite FOR UPDATE con agregados, así que se bloquea una fila
   * concreta de la serie y se cuenta después, ya dentro del bloqueo. Cuando la
   * zona aún no tiene pedidos, el bloqueo recae sobre la fila del producto
   * virtual de la serie, que existe siempre y serializa a todos los que compiten
   * por ese horario.
   */
  // La fila de bloqueo se crea si falta. El ON CONFLICT DO NOTHING de PostgreSQL
  // serializa tambien a los que intentan crearla a la vez, asi que el caso
  // "la fila no existe todavia" no abre una ventana de sobreventa.
  await tx.$queryRaw`
    INSERT INTO "SlotLock" ("slotKey", "updatedAt")
    VALUES (${`${localDateKey(dia)}|${slotId}`}, NOW())
    ON CONFLICT ("slotKey") DO UPDATE SET "updatedAt" = "SlotLock"."updatedAt"
  `
  await tx.$queryRaw`
    SELECT "slotKey" FROM "SlotLock"
    WHERE "slotKey" = ${`${localDateKey(dia)}|${slotId}`}
    FOR UPDATE
  `

  const [{ booked } = { booked: 0 }] = await tx.$queryRaw`
    SELECT COUNT(*)::int AS booked
    FROM "Order"
    WHERE "deliveryDate" = ${dia}
      AND "slotId" = ${slotId}
      AND "status" <> 'CANCELLED'
  `

  const ocupadas = Number(booked)
  if (ocupadas >= capacidad) {
    throw Object.assign(new Error('Ese horario acaba de ocuparse. Elige otro'), {
      status: 409,
      code: 'SLOT_FULL',
    })
  }
  return { ocupadas, capacidad }
}

/** Crea las filas de bloqueo de los horarios de las zonas existentes. */
export async function ensureSlotLocks() {
  const zonas = await prisma.deliveryZone.findMany({ select: { id: true, slots: true } })
  const claves = new Set()
  for (const z of zonas) {
    for (const s of z.slots || []) claves.add(`${z.id}|${s.id}`)
  }
  if (!claves.size) return 0
  return prisma.slotLock.createMany({
    data: [...claves].map((slotKey) => ({ slotKey, updatedAt: new Date() })),
    skipDuplicates: true,
  }).then((r) => r.count)
}

export async function deliveryCheck(lat, lng) {
  const settings = await getSettings()
  const zones = await getZones()
  const zone = resolveZone(lat, lng, zones)
  const distanceKm = round(haversineKm(settings.storeLat, settings.storeLng, Number(lat), Number(lng)))
  const storeAddress = settings.storeAddress || ''

  if (!zone) {
    // Distancia a la zona más cercana: convierte un "no" seco en algo accionable
    // ("moves 400 m al norte y te cubrimos"). Con varias zonas, la más cercana
    // puede no ser la primera de la lista.
    let masCercaKm = null
    let nombreCercana = null
    for (const z of zones.filter((x) => x.enabled)) {
      const km = round(distanciaAlBordeM(Number(lat), Number(lng), z.polygon) / 1000)
      if (masCercaKm === null || km < masCercaKm) {
        masCercaKm = km
        nombreCercana = z.name
      }
    }
    return {
      withinZone: false,
      zoneId: null,
      zoneName: null,
      distanceKm,
      deliveryFee: 0,
      minOrderAmount: Number(settings.minOrderAmount),
      nearestZoneKm: masCercaKm,
      nearestZoneName: nombreCercana,
      storeAddress,
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
    nearestZoneKm: 0,
    nearestZoneName: zone.name,
    storeAddress,
  }
}

/**
 * Valida la fecha de entrega.
 *
 * Las comparaciones se hacen por DIA CALENDARIO, no por marca de tiempo. Antes
 * se comparaba el instante exacto: un pedido de "hoy" hecho a la 00:30 en hora
 * de Guayaquil y validado por un servidor en UTC se rechazaba como fecha ya
 * pasada. El dia se compara como fecha local, que es como lo ve el cliente.
 */
export function validateDeliveryDay(deliveryDate, zone, settings, now = new Date()) {
  if (!isDeliveryDay(deliveryDate, zone)) {
    return { ok: false, code: 'NOT_DELIVERY_DAY', message: 'Ese dia no hay entregas programadas en tu zona' }
  }
  const hoy = startOfLocalDay(now)
  const elegido = startOfLocalDay(deliveryDate)
  if (elegido.getTime() < hoy.getTime()) {
    return { ok: false, code: 'PAST_DATE', message: 'La fecha de entrega ya paso' }
  }
  if (elegido.getTime() === hoy.getTime() && !canOrderToday(settings, now)) {
    return { ok: false, code: 'CUTOFF_PASSED', message: 'Paso la hora de corte para entregas de hoy' }
  }
  // Sin tope, un cliente puede agendar con un ano de antelacion y el pedido se
  // pierde en la bandeja sin que nadie lo note.
  const limite = startOfLocalDay(addDays(now, MAX_DIAS_ANTICIPACION))
  if (elegido.getTime() > limite.getTime()) {
    return {
      ok: false,
      code: 'TOO_FAR_AHEAD',
      message: `Solo se puede agendar con hasta ${MAX_DIAS_ANTICIPACION} dias de anticipacion`,
    }
  }
  return { ok: true }
}

export { parseLocalDate }