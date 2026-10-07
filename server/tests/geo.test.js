import test from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineKm,
  closeRing,
  polygonFromCircle,
  dentroDeZona,
  distanciaAlBordeM,
  TOLERANCIA_BORDE_M,
} from '../src/lib/geo.js'
import { resolveZone, areaKm2 } from '../src/lib/delivery.js'

const TIENDA = { lat: -2.228329, lng: -79.900772 }

/** Rectángulo de `ancho` x `alto` km alrededor de un centro. */
function rectangulo(centro, anchoKm, altoKm) {
  const latKm = 110.574
  const lngKm = 111.32 * Math.cos((centro.lat * Math.PI) / 180)
  const lat1 = centro.lat - altoKm / 2 / latKm
  const lat2 = centro.lat + altoKm / 2 / latKm
  const lng1 = centro.lng - anchoKm / 2 / lngKm
  const lng2 = centro.lng + anchoKm / 2 / lngKm
  return {
    type: 'Polygon',
    coordinates: [[[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2], [lng1, lat1]]],
  }
}

function mover(centro, kmLat, kmLng) {
  const latKm = 110.574
  const lngKm = 111.32 * Math.cos((centro.lat * Math.PI) / 180)
  return { lat: centro.lat + kmLat / latKm, lng: centro.lng + kmLng / lngKm }
}

const zona = (nombre, centro, ancho, alto, extra = {}) => ({
  id: nombre,
  name: nombre,
  enabled: true,
  polygon: rectangulo(centro, ancho, alto),
  ...extra,
})

// ---------------------------------------------------------------- geometría

test('haversine mide lo esperado', () => {
  assert.equal(haversineKm(TIENDA.lat, TIENDA.lng, TIENDA.lat, TIENDA.lng), 0)
  const d = haversineKm(TIENDA.lat, TIENDA.lng, TIENDA.lat + 0.01, TIENDA.lng)
  assert.ok(Math.abs(d - 1.108) < 0.02, `0.01° de lat = ${d}`)
  // Un grado de longitud en el ecuador es ~111 km.
  const dLng = haversineKm(TIENDA.lat, TIENDA.lng, TIENDA.lat, TIENDA.lng + 1)
  assert.ok(Math.abs(dLng - 111.3) < 1, `${dLng}`)
})

test('closeRing cierra el polígono sin duplicar si ya lo está', () => {
  const cerrado = rectangulo(TIENDA, 2, 2)
  const otra = closeRing(cerrado)
  assert.equal(otra.coordinates[0].length, cerrado.coordinates[0].length)
  const abierto = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
  const cerrada = closeRing(abierto)
  const ring = cerrada.coordinates[0]
  assert.deepEqual(ring[0], ring[ring.length - 1])
})

test('el centro de una zona cae dentro de ella', () => {
  const z = rectangulo(TIENDA, 3, 3)
  assert.equal(dentroDeZona(TIENDA.lat, TIENDA.lng, z), true)
})

test('un punto claramente fuera no cuenta como dentro', () => {
  const z = rectangulo(TIENDA, 3, 3)
  const lejos = mover(TIENDA, 20, 0)
  assert.equal(dentroDeZona(lejos.lat, lejos.lng, z), false)
  assert.ok(distanciaAlBordeM(lejos.lat, lejos.lng, z) > 1000)
})

test('un punto en el borde, o a centímetros, sí cuenta como dentro', () => {
  const z = rectangulo(TIENDA, 3, 3)
  const [lng1, lat1] = z.coordinates[0][0]
  // Justo en la arista.
  assert.equal(dentroDeZona(lat1, lng1, z), true, 'el borde debe contar como dentro')
  // A 10 cm hacia fuera.
  const fuera = { lat: lat1 - 0.000001, lng: (lng1 + z.coordinates[0][1][0]) / 2 }
  assert.equal(
    dentroDeZona(fuera.lat, fuera.lng, z),
    true,
    `${Math.round(distanciaAlBordeM(fuera.lat, fuera.lng, z))} cm del borde debe contar como dentro`,
  )
  // A 5 m hacia fuera ya no.
  const lejos = { lat: lat1 - 0.000045, lng: (lng1 + z.coordinates[0][1][0]) / 2 }
  assert.equal(dentroDeZona(lejos.lat, lejos.lng, z), false, '5 m fuera ya no debe contar')
})

test('la tolerancia del borde es de unos metros, no de kilómetros', () => {
  assert.ok(TOLERANCIA_BORDE_M >= 1 && TOLERANCIA_BORDE_M <= 5, `tolerancia=${TOLERANCIA_BORDE_M}`)
})

test('distanciaAlBordeM crece al alejarse del polígono', () => {
  const z = rectangulo(TIENDA, 3, 3)
  const dentro = distanciaAlBordeM(TIENDA.lat, TIENDA.lng, z)
  const lejos = mover(TIENDA, 4, 0)
  const fuera = distanciaAlBordeM(lejos.lat, lejos.lng, z)
  assert.ok(dentro > 0, 'el centro está a media anchura del borde')
  assert.ok(fuera > dentro, `${fuera} debería ser mayor que ${dentro}`)
  assert.ok(fuera > 500, `esperaba >500 m, obtuve ${fuera}`)
})

test('un polígono degenerado no rompe nada', () => {
  assert.equal(dentroDeZona(0, 0, null), false)
  assert.equal(dentroDeZona(0, 0, { type: 'Polygon', coordinates: [[]] }), false)
  assert.equal(dentroDeZona(0, 0, { type: 'Point', coordinates: [0, 0] }), false, 'un punto no es una zona')
  assert.equal(distanciaAlBordeM(0, 0, null), Infinity)
  assert.equal(distanciaAlBordeM(0, 0, { type: 'Polygon', coordinates: [[]] }), Infinity)
  // Un anillo de dos puntos no forma polígono, pero no debe lanzar.
  assert.equal(typeof distanciaAlBordeM(0, 0, { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }), 'number')
})

test('el círculo por defecto tiene el radio anunciado', () => {
  const circulo = polygonFromCircle(TIENDA.lat, TIENDA.lng, 5)
  const ring = circulo.coordinates[0]
  assert.deepEqual(ring[0], ring[ring.length - 1], 'debe cerrar el anillo')
  let max = 0
  let min = Infinity
  for (const [lng, lat] of ring) {
    const d = haversineKm(TIENDA.lat, TIENDA.lng, lat, lng)
    max = Math.max(max, d)
    min = Math.min(min, d)
  }
  assert.ok(Math.abs(max - 5) < 0.15, `radio máximo ${max}`)
  assert.ok(Math.abs(min - 5) < 0.05, `radio mínimo ${min}`)
})

// ---------------------------------------------------------------- resolución

test('resolveZone devuelve null si no hay ninguna zona que cubra', () => {
  const zonas = [zona('Centro', TIENDA, 3, 3)]
  const lejos = mover(TIENDA, 50, 50)
  assert.equal(resolveZone(lejos.lat, lejos.lng, zonas), null)
})

test('resolveZone encuentra la zona que cubre el punto', () => {
  const zonas = [zona('Norte', mover(TIENDA, 20, 0), 3, 3), zona('Centro', TIENDA, 3, 3)]
  assert.equal(resolveZone(TIENDA.lat, TIENDA.lng, zonas).name, 'Centro')
})

test('una zona desactivada no cubre', () => {
  const zonas = [zona('Centro', TIENDA, 3, 3, { enabled: false })]
  assert.equal(resolveZone(TIENDA.lat, TIENDA.lng, zonas), null)
})

test('si dos zonas cubren el mismo punto, gana la más específica', () => {
  // Sin desempate, el resultado dependía del orden de la lista.
  const grande = zona('Grande', TIENDA, 10, 10)
  const pequena = zona('Pequena', TIENDA, 2, 2)
  const punto = mover(TIENDA, 0.5, 0.5)
  const enAmbas = [grande, pequena].every((z) => dentroDeZona(punto.lat, punto.lng, z.polygon))
  assert.equal(enAmbas, true, 'el punto debe caer en las dos')

  assert.equal(resolveZone(punto.lat, punto.lng, [grande, pequena]).name, 'Pequena')
  assert.equal(resolveZone(punto.lat, punto.lng, [pequena, grande]).name, 'Pequena', 'el orden no debe importar')
})

test('el desempate es estable ante areas iguales', () => {
  const a = zona('B', TIENDA, 4, 4)
  const b = zona('A', TIENDA, 4, 4)
  const p = mover(TIENDA, 0.2, 0.2)
  const uno = resolveZone(p.lat, p.lng, [a, b])
  const otro = resolveZone(p.lat, p.lng, [b, a])
  assert.equal(uno.name, otro.name, 'con areas iguales debe decidir siempre el mismo')
})

test('areaKm2 distingue tamaños', () => {
  const pequena = areaKm2(rectangulo(TIENDA, 1, 1))
  const grande = areaKm2(rectangulo(TIENDA, 4, 4))
  assert.ok(grande > pequena, `${grande} debe ser mayor que ${pequena}`)
  assert.ok(Math.abs(pequena - 1) < 0.1, `1x1 km = ${pequena} km²`)
  assert.ok(Math.abs(grande - 16) < 1.6, `4x4 km = ${grande} km²`)
})

test('areaKm2 de un polígono degenerado es infinito', () => {
  assert.equal(areaKm2(null), Infinity)
  assert.equal(areaKm2({ type: 'Polygon', coordinates: [[]] }), Infinity)
})