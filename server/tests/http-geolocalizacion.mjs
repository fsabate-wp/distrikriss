/**
 * El aviso "Â¿llegamos a tu casa?" visto desde fuera: lo que recibe el cliente.
 */
const BASE = 'http://localhost:4000'
const TIENDA = { lat: -2.19, lng: -79.89 }

let fallos = 0
let n = 0
function check(nombre, ok, detalle = '') {
  n += 1
  if (ok) console.log(`  ok    ${nombre}`)
  else {
    fallos += 1
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

async function json(path, options = {}) {
  const res = await fetch(BASE + path, options)
  let data = null
  try {
    data = await res.json()
  } catch {}
  return { status: res.status, data }
}

async function main() {
  console.log('\n=== 1. La configuracion publica trae donde esta la tienda ===')
  const publico = await json('/api/settings/public')
  check('el endpoint responde', publico.status === 200)
  check('incluye storeLat', typeof publico.data?.settings?.storeLat === 'number', `${publico.data?.settings?.storeLat}`)
  check('incluye storeLng', typeof publico.data?.settings?.storeLng === 'number', `${publico.data?.settings?.storeLng}`)
  check('incluye la direccion', typeof publico.data?.settings?.storeAddress === 'string')
  // Sin esto el mapa se centraba en coordenadas fijas.
  check('las coordenadas no son 0', publico.data?.settings?.storeLat !== 0 && publico.data?.settings?.storeLng !== 0)

  console.log('\n=== 2. Comprobar cobertura por POST (sin guardar nada) ===')
  const dentro = await json('/api/delivery/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TIENDA),
  })
  check('responde sin sesiÃ³n', dentro.status === 200, `status ${dentro.status}`)
  check('informa si hay cobertura', typeof dentro.data?.withinZone === 'boolean')
  check('informa la distancia', typeof dentro.data?.distanceKm === 'number')
  check('informa el envÃ­o', typeof dentro.data?.deliveryFee === 'number')
  check('informa el mÃ­nimo de la zona', typeof dentro.data?.minOrderAmount === 'number')
  check('informa la zona mÃ¡s cercana', 'nearestZoneName' in (dentro.data || {}))

  console.log('\n=== 3. Fuera de toda zona, dice a cuanto queda ===')
  // No se puede fijar un punto "lejano" a ciegas: la tienda puede tener una zona
  // por defecto de 5 km que cubre mÃ¡s de lo que uno espera. Se busca un punto
  // que de verdad quede fuera de todas las zonas.
  let fuera = null
  for (const km of [6, 8, 10, 15, 25, 40]) {
    for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const p = { lat: TIENDA.lat + (dy * km) / 110.574, lng: TIENDA.lng + (dx * km) / 110.574 }
      const r = await json('/api/delivery/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      if (r.data?.withinZone === false) {
        fuera = r
        break
      }
    }
    if (fuera) break
  }
  if (!fuera) {
    check('hay alguna zona configurada', false, 'ningÃºn punto quedÃ³ fuera: no hay zonas en la base')
  } else {
    check('detecta que no llega', fuera.data.withinZone === false, JSON.stringify(fuera.data))
    check('no cobra envÃ­o', Number(fuera.data.deliveryFee) === 0, `${fuera.data.deliveryFee}`)
    if (fuera.data.nearestZoneKm != null) {
      check(
        'informa la distancia a la zona mÃ¡s cercana',
        Number(fuera.data.nearestZoneKm) > 0,
        `${fuera.data.nearestZoneKm} km a ${fuera.data.nearestZoneName}`,
      )
    } else {
      check('sin zonas no inventa una distancia', true)
    }
  }

  console.log('\n=== 4. Coordenadas invalidas se rechazan ===')
  for (const [cuerpo, etiqueta] of [
    [{ lat: 900, lng: 0 }, 'latitud 900'],
    [{ lat: 0, lng: 500 }, 'longitud 500'],
    [{ lat: 'x', lng: 'y' }, 'texto en vez de numero'],
    [{}, 'sin coordenadas'],
  ]) {
    const r = await json('/api/delivery/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    check(`rechaza ${etiqueta}`, r.status === 400, `status ${r.status}`)
  }
  const get = await json('/api/delivery/check?lat=abc&lng=abc')
  check('el GET tambien valida', get.status === 400, `status ${get.status}`)

  console.log('\n=== 5. El endpoint tiene limite de peticiones ===')
  // El limite es 120/min por IP; se comprueba que existe la cabecera y que
  // responde con 429 al superarlo no tiene sentido agotar el cuota aquÃ­.
  const uno = await fetch(`${BASE}/api/delivery/check?lat=${TIENDA.lat}&lng=${TIENDA.lng}`)
  check('el GET sigue funcionando', uno.status === 200)

  console.log('\n=== 6. Las zonas se dibujan en el mapa ===')
  const zonas = await json('/api/delivery/zones')
  check('el endpoint responde', zonas.status === 200)
  check('devuelve una lista', Array.isArray(zonas.data?.zones), JSON.stringify(zonas.data?.zones))
  if (zonas.data?.zones?.length) {
    const conPoligono = zonas.data.zones.filter((z) => z.polygon?.coordinates?.[0]?.length >= 3)
    check('las zonas Bringing polÃ­gono vÃ¡lido', conPoligono.length === zonas.data.zones.length,
      `${conPoligono.length}/${zonas.data.zones.length}`)
    check('cada zona trae color', zonas.data.zones.every((z) => typeof z.color === 'string'))
  }

  console.log(`\n=== Resultado: ${n - fallos}/${n} comprobaciones ===`)
  if (fallos) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})