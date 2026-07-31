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
