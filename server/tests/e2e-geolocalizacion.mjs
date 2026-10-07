/**
 * Flujo de cobertura de extremo a extremo: zonas reales, puntos reales y el
 * endpoint que usa el aviso "¿llegamos a tu casa?".
 */
process.env.SRI_CERT_SECRET ||= 'clave-solo-para-el-entorno-de-pruebas-000000'

const { prisma } = await import('../src/lib/prisma.js')
const { deliveryCheck, resolveZone, areaKm2 } = await import('../src/lib/delivery.js')
const { dentroDeZona, distanciaAlBordeM } = await import('../src/lib/geo.js')

let fallos = 0
let n = 0
const sello = `GEO${Date.now().toString().slice(-6)}`
const TIENDA = { lat: -2.19, lng: -79.89 }

function check(nombre, ok, detalle = '') {
  n += 1
  if (ok) console.log(`  ok    ${nombre}`)
  else {
    fallos += 1
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

/** Rectángulo en grados alrededor de un centro, en metros de lado. */
function caja(centro, anchoM, altoM) {
  const latKm = 110.574
  const lngKm = 111.32 * Math.cos((centro.lat * Math.PI) / 180)
  const lat1 = centro.lat - altoM / 2 / 1000 / latKm
  const lat2 = centro.lat + altoM / 2 / 1000 / latKm
  const lng1 = centro.lng - anchoM / 2 / 1000 / lngKm
  const lng2 = centro.lng + anchoM / 2 / 1000 / lngKm
  return {
    type: 'Polygon',
    coordinates: [[[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2], [lng1, lat1]]],
  }
}

async function main() {
  console.log('\n=== Preparacion ===')
  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      storeName: 'DistriKriss',
      storeLat: TIENDA.lat,
      storeLng: TIENDA.lng,
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      openHours: {},
      slots: [],
      bankTransfer: {},
      storeAddress: 'Av. Amazonas N34-567',
    },
    update: { storeLat: TIENDA.lat, storeLng: TIENDA.lng, storeAddress: 'Av. Amazonas N34-567' },
  })
  await prisma.deliveryZone.deleteMany({ where: { name: { contains: sello } } })

  // Se borran todas las zonas, incluida la de por defecto que el sistema crea
  // sola: si sigue activa, cubre con su radio y enmascara el comportamiento de
  // las zonas de prueba.
  const borradas = await prisma.deliveryZone.deleteMany({})
  console.log(`  ${borradas.count} zonas previas eliminadas`)

  // Zona grande (4 km) y una pequeña (1 km) que se solapan a propósito.
  await prisma.deliveryZone.create({
    data: {
      name: `Grande ${sello}`,
      polygon: caja(TIENDA, 4000, 4000),
      enabled: true,
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      slots: [{ id: 'man', label: 'Mañana', start: '09:00', end: '12:00', capacity: 5 }],
      deliveryFeeBase: 2,
      deliveryFeePerKm: 0.5,
      minOrderAmount: 10,
      sortOrder: 0,
    },
  })
  await prisma.deliveryZone.create({
    data: {
      name: `Pequena ${sello}`,
      polygon: caja(TIENDA, 1000, 1000),
      enabled: true,
      deliveryDays: [1],
      slots: [{ id: 'tarde', label: 'Tarde', start: '15:00', end: '18:00', capacity: 2 }],
      deliveryFeeBase: 3,
      deliveryFeePerKm: 0.8,
      minOrderAmount: 25,
      sortOrder: 1,
    },
  })
  // Una zona deshabilitada sobre la tienda: no debe alterar nada.
  await prisma.deliveryZone.create({
    data: {
      name: `Inactiva ${sello}`,
      polygon: caja(TIENDA, 6000, 6000),
      enabled: false,
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      slots: [],
      deliveryFeeBase: 0,
      deliveryFeePerKm: 0,
      minOrderAmount: 0,
      sortOrder: 2,
    },
  })
  console.log('  3 zonas creadas (grande, pequeña solapada, inactiva)')

  const zonas = await prisma.deliveryZone.findMany({ where: { name: { contains: sello } } })

  console.log('\n=== 1. Un punto dentro de la zona pequena ===')
  const dentro = await deliveryCheck(TIENDA.lat, TIENDA.lng)
  check('detecta cobertura', dentro.withinZone === true, JSON.stringify(dentro))
  // Solapadas: debe ganar la más específica, no la primera de la lista.
  check(
    `elige la zona mas especifica (${dentro.zoneName})`,
    dentro.zoneName.includes('Pequena'),
    dentro.zoneName,
  )
  check('el minimo es el de la zona elegida', Number(dentro.minOrderAmount) === 25, `${dentro.minOrderAmount}`)
  check('el envio es el de la zona elegida', Number(dentro.deliveryFee) === 3, `${dentro.deliveryFee}`)
  check('expone la direccion de la tienda', dentro.storeAddress === 'Av. Amazonas N34-567', dentro.storeAddress)
  check('indica que no hay distancia a la zona mas cercana', Number(dentro.nearestZoneKm) === 0)

  console.log('\n=== 2. Un punto en la corona de la zona pequena ===')
  const corona = { lat: TIENDA.lat + 0.8 / 110.574, lng: TIENDA.lng }
  const enCorona = await deliveryCheck(corona.lat, corona.lng)
  check('sigue dentro (solo en la grande)', enCorona.withinZone === true, JSON.stringify(enCorona))
  check('y ahora gana la grande', enCorona.zoneName.includes('Grande'), enCorona.zoneName)
  check('el minimo baja a 10', Number(enCorona.minOrderAmount) === 10, `${enCorona.minOrderAmount}`)

  console.log('\n=== 3. Un punto fuera de todas las zonas ===')
  const fuera = { lat: TIENDA.lat + 0.02, lng: TIENDA.lng + 0.02 } // ~3,5 km
  const info = await deliveryCheck(fuera.lat, fuera.lng)
  check('detecta que no hay cobertura', info.withinZone === false, JSON.stringify(info))
  check('no cobra envío', Number(info.deliveryFee) === 0, `${info.deliveryFee}`)
  check('informa la distancia a la zona mas cercana', Number(info.nearestZoneKm) > 0, `${info.nearestZoneKm} km`)
  check('y como se llama', typeof info.nearestZoneName === 'string', `${info.nearestZoneName}`)

  console.log('\n=== 4. Justo en el borde de una zona ===')
  const grande = zonas.find((z) => z.name.includes('Grande'))
  const [lng1, lat1] = grande.polygon.coordinates[0][0]
  const enBorde = await deliveryCheck(lat1, lng1)
  check('el borde cuenta como cobertura', enBorde.withinZone === true, JSON.stringify(enBorde))
  const fueraPorPoco = await deliveryCheck(lat1 - 0.00003, lng1 + 0.0005)
  check('a 3 m fuera ya no', fueraPorPoco.withinZone === false, JSON.stringify(fueraPorPoco))
  check('y dice a cuanto queda', Number(fueraPorPoco.nearestZoneKm) < 0.1, `${fueraPorPoco.nearestZoneKm} km`)

  console.log('\n=== 5. Una zona deshabilitada no cubre ===')
  const soloInactiva = zonas.filter((z) => z.name.includes('Inactiva'))
  check('resolveZone la ignora', resolveZone(TIENDA.lat, TIENDA.lng, soloInactiva) === null)
  check(
    'su area no altera el area calculada',
    areaKm2(grande.polygon) > areaKm2(zonas.find((z) => z.name.includes('Pequena')).polygon),
  )

  console.log('\n=== 6. Zona con poligono roto ===')
  const rota = { id: 'rota', name: 'Rota', enabled: true, polygon: { type: 'Polygon', coordinates: [[]] } }
  check('no lanza con un anillo vacio', resolveZone(0, 0, [rota]) === null)
  const sinCerrar = { id: 'x', name: 'X', enabled: true, polygon: { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01]]] } }
  check('no lanza con un anillo abierto', typeof resolveZone(0.005, 0.005, [sinCerrar]) !== 'undefined')

  console.log('\n=== 7. La configuracion publica trae la ubicacion de la tienda ===')
  const { PUBLIC_FIELDS } = await (async () => {
    const fs = await import('node:fs')
    const fuente = fs.readFileSync('C:/Users/USER/Desktop/distrikriss/server/src/routes/settings.routes.js', 'utf8')
    const bloque = fuente.match(/const PUBLIC_FIELDS = \{[\s\S]*?\n\}/)[0]
    return {
      PUBLIC_FIELDS: Object.fromEntries(
        [...bloque.matchAll(/(\w+):\s*true/g)].map((m) => [m[1], true]),
      ),
    }
  })()
  for (const campo of ['storeLat', 'storeLng', 'storeAddress', 'deliveryRadiusKm']) {
    check(`${campo} es publico`, PUBLIC_FIELDS[campo] === true)
  }

  console.log('\n=== Limpieza ===')
  await prisma.deliveryZone.deleteMany({ where: { name: { contains: sello } } })
  console.log('  zonas de prueba eliminadas')

  console.log(`\n=== Resultado: ${n - fallos}/${n} comprobaciones ===`)
  if (fallos) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('\n*** fallo la prueba de cobertura ***')
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())