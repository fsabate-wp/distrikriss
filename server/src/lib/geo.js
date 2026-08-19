const EARTH_RADIUS_KM = 6371

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

export function withinRadiusKm(lat1, lng1, lat2, lng2, radiusKm) {
  return haversineKm(lat1, lng1, lat2, lng2) <= radiusKm
}

export function polygonFromCircle(lat, lng, radiusKm, segments = 48) {
  const latKm = 110.574
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
