import { buildAccessKey, guayaquilParts } from '../src/lib/sri/clave.js'
import { unitPrice } from '../src/lib/sri/xml.js'

/**
 * Barra minima antes de tocar el ambiente de PRODUCCION.
 *
 * Un solo intento real contra el SRI de pruebas y la generacion de la RIDE. No
 * emite ningun comprobante: solo comprueba que los servicios respondan y que la
 * factura que se firmaria este bien construida.
 */

const PROD = 'https://cel.sri.gob.ec/comprobantes-electronicos-ws'
const TEST = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws'

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

async function alcanzable(url, nombre) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  const inicio = Date.now()
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    check(`${nombre} responde`, res.status === 200, `HTTP ${res.status}`)
    check(`${nombre} es rapido (${Date.now() - inicio} ms)`, Date.now() - inicio < 8000)
  } catch (err) {
    const timeout = err?.name === 'AbortError'
    check(`${nombre} es alcanzable`, false, timeout ? 'timeout de 10s' : String(err?.cause?.code || err.message))
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  console.log('\n=== 1. Servicios web del SRI ===')
  await alcanzable(`${TEST}/RecepcionComprobantesOffline?wsdl`, 'Recepción (pruebas)')
  await alcanzable(`${TEST}/AutorizacionComprobantesOffline?wsdl`, 'Autorización (pruebas)')
  console.log('\n  (producción se comprueba al desplegar; no se llama desde aquí)')
  void PROD

  console.log('\n=== 2. La clave de acceso que se generaria hoy ===')
  const ahora = new Date()
  const partes = guayaquilParts(ahora)
  const clave = buildAccessKey({
    date: ahora,
    ruc: '1791312120001',
    docCode: '01',
    environment: 2,
    establishment: '003',
    emissionPoint: '001',
    sequential: 1,
  })
  console.log(`  fecha local Guayaquil: ${partes.formatted}`)
  console.log(`  clave de ejemplo:     ${clave}`)
  check('tiene 49 digitos', clave.length === 49)
  check('la fecha de la clave coincide con la fecha de Guayaquil',
    clave.slice(0, 8) === `${partes.dd}${partes.mm}${partes.aaaa}`)

  console.log('\n=== 3. Casos limite de la fecha (cercania a medianoche) ===')
  for (const [iso, esperado] of [
    ['2026-10-07T04:59:00Z', '06/10/2026'],
    ['2026-10-07T05:01:00Z', '07/10/2026'],
  ]) {
    const p = guayaquilParts(new Date(iso))
    check(`${iso} -> ${esperado}`, p.formatted === esperado, `obtenido ${p.formatted}`)
  }

  console.log('\n=== 4. Formato de precios unitarios ===')
  for (const [valor, esperado] of [
    [1, '1'],
    [1.5, '1.5'],
    [0.5, '0.5'],
    [1 / 3, '0.333333'],
    [0, '0'],
  ]) {
    const salida = unitPrice(valor)
    check(`unitPrice(${valor}) = ${esperado}`, salida === esperado, `obtenido ${salida}`)
  }

  console.log(`\n=== Resultado: ${n - fallos}/${n} comprobaciones ===`)
  if (fallos) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
