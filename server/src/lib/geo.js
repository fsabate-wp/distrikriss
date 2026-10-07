import { booleanPointInPolygon } from '@turf/turf'

const EARTH_RADIUS_KM = 6371
const KM_POR_GRADO_LAT = 110.574

// Tolerancia para considerar que un punto está DENTRO de una zona.
//
// turf excluye el borde del polígono: una casa située exactamente en el límite
// se rechazaba como "fuera de zona". Con esta tolerancia, un punto a menos de
// ~1,5 m del borde cuenta como dentro, que es lo que espera alguien que está
// pagando un envío a la tienda de al lado.
export const TOLERANCIA_BORDE_M = 1.5

export function toRadians(deg) {
  return (deg * Math.PI) / 180
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Distancia en grados de latitud que equivale a una cantidad de metros. */
export function gradosPorMetro(metros) {
  return metros / 1000 / KM_POR_GRADO_LAT
}

export function withinRadiusKm(lat1, lng1, lat2, lng2, radiusKm) {
  return haversineKm(lat1, lng1, lat2, lng2) <= radiusKm
}

export function polygonFromCircle(lat, lng, radiusKm, segments = 48) {
  const latKm = KM_POR_GRADO_LAT
  const lngKm = 111.32 * Math.cos((lat * Math.PI) / 180)
  const points = []
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const dLat = (Math.sin(angle) * radiusKm) / latKm
    const dLng = (Math.cos(angle) * radiusKm) / lngKm
    points.push([lng + dLng, lat + dLat])
  }
  points.push([...points[0]])
  return { type: 'Polygon', coordinates: [points] }
}

/** Vértices de un polígono, como {lat, lng}. */
export function verticesOf(polygon) {
  if (!polygon || polygon.type !== 'Polygon') return []
  return (polygon.coordinates?.[0] || []).map(([lng, lat]) => ({ lat, lng }))
}

/**
 * ¿Cae un punto dentro de una zona, con tolerancia en el borde?
 *
 * Se usa el predicado de turf y, si el punto está fuera pero muy cerca del
 * borde, se acepta. La diferencia entre "fuera de la zona" y "justo al lado" no
 * le importa a quien está pidiendo, y un rechazo por 20 cm molesta más que el
 * riesgo de entregar a un vecino.
 */
export function dentroDeZona(lat, lng, polygon, toleranciaM = TOLERANCIA_BORDE_M) {
  if (!esPoligonoUtilizable(polygon)) return false
  const anillo = closeRing(polygon)
  // turf lanza excepción si el anillo está vacío o no está cerrado, y una zona
  // mal dibujada en el panel dejaría el endpoint de cobertura caído en lugar de
  // responder "no cubrimos". Se trata como zona inválida.
  try {
    const pt = { type: 'Feature', geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] } }
    if (booleanPointInPolygon(pt, anillo)) return true
  } catch {
    return false
  }
  return distanciaAlBordeM(Number(lat), Number(lng), polygon) <= toleranciaM
}

/** ¿El polígono tiene forma suficiente para decidir si un punto cae dentro? */
export function esPoligonoUtilizable(polygon) {
  if (!polygon || polygon.type !== 'Polygon') return false
  const ring = polygon.coordinates?.[0]
  return Array.isArray(ring) && ring.length >= 3
}

/** Distancia mínima al borde, en metros. */
export function distanciaAlBordeM(lat, lng, polygon) {
  const vertices = verticesOf(polygon)
  if (vertices.length < 2) return Infinity

  const latKm = KM_POR_GRADO_LAT
  const lngKm = 111.32 * Math.cos((lat * Math.PI) / 180)
  // Plano local en metros: a escala urbana la proyección es precisa y evita
  // trigonometría por vértice.
  const px = lng * lngKm * 1000
  const py = lat * latKm * 1000

  let mejor = Infinity
  for (let i = 0; i < vertices.length - 1; i += 1) {
    const a = { x: vertices[i].lng * lngKm * 1000, y: vertices[i].lat * latKm * 1000 }
    const b = { x: vertices[i + 1].lng * lngKm * 1000, y: vertices[i + 1].lat * latKm * 1000 }
    mejor = Math.min(mejor, distanciaSegmento(px, py, a, b))
  }
  return mejor
}

function distanciaSegmento(px, py, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const largo2 = dx * dx + dy * dy
  if (largo2 === 0) return Math.hypot(px - a.x, py - a.y)
  let t = ((px - a.x) * dx + (py - a.y) * dy) / largo2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

export function closeRing(polygon) {
  if (!polygon || polygon.type !== 'Polygon') return polygon
  return {
    ...polygon,
    coordinates: polygon.coordinates.map((ring) => {
      if (ring.length < 3) return ring
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] === last[0] && first[1] === last[1]) return ring
      return [...ring, [...first]]
    }),
  }
}
