import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAccessKey, mod11CheckDigit, randomCode8, guayaquilParts } from '../src/lib/sri/clave.js'

const WEIGHTS = [2, 3, 4, 5, 6, 7]

function mod11Sum(base) {
  const digits = String(base).split('').reverse()
  return digits.reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i % WEIGHTS.length], 0)
}

test('mod11 mapea los restos 0, 1 y >=2 correctamente', () => {
  // El algoritmo de la clave de acceso: check = 11 - (suma % 11), y los
  // resultados 10 y 11 se convierten en 1 y 0 respectivamente.
  let restos = new Set()
  for (let i = 0; i < 20000; i += 1) {
    const base = String(i).padStart(48, '0')
    const resto = mod11Sum(base) % 11
    restos.add(resto)
    const esperado = resto === 0 ? 0 : resto === 1 ? 1 : 11 - resto
    assert.equal(mod11CheckDigit(base), esperado)
    assert.ok(mod11CheckDigit(base) >= 0 && mod11CheckDigit(base) <= 9, 'el digito debe ser un unico caracter')
  }
  assert.ok(restos.size >= 10, 'no se recorrio todo el rango de restos')
})

test('la clave de acceso tiene 49 digitos y el ultimo es el verificador', () => {
  const clave = buildAccessKey({
    date: new Date('2026-10-06T20:30:00Z'),
    ruc: '1791312120001',
    docCode: '01',
    environment: 2,
    establishment: '003',
    emissionPoint: '001',
    sequential: 42,
  })
  assert.equal(clave.length, 49)
  assert.match(clave, /^\d{49}$/)
  assert.equal(Number(clave[48]), mod11CheckDigit(clave.slice(0, 48)))
})

test('la clave lleva la fecha de Guayaquil y no la del servidor', () => {
  // 2026-10-07T02:00:00Z es 2026-10-06T21:00 en Guayaquil: el dia local es un dia
  // menos. Con un servidor en UTC se pondria el 07 y la clave no cuadraria con
  // <fechaEmision>, que el SRI rechaza.
  const instante = new Date('2026-10-07T02:00:00Z')
  const partes = guayaquilParts(instante)
  assert.equal(partes.dd, '06')
  assert.equal(partes.mm, '10')
  assert.equal(partes.aaaa, '2026')
  assert.equal(partes.formatted, '06/10/2026')

  const clave = buildAccessKey({
    date: instante,
    ruc: '1791312120001',
    docCode: '01',
    environment: 1,
    establishment: '003',
    emissionPoint: '001',
    sequential: 1,
  })
  assert.equal(clave.slice(0, 8), '06102026')
  assert.equal(clave.slice(8, 10), '01') // codDoc
  assert.equal(clave.slice(10, 23), '1791312120001') // ruc
  assert.equal(clave[23], '1') // ambiente
  assert.equal(clave.slice(24, 27), '003') // establecimiento
  assert.equal(clave.slice(27, 30), '001') // punto de emision
  assert.equal(clave.slice(30, 39), '000000001') // secuencial
  assert.equal(clave[47], '1') // tipo de emisor
})

test('solo el ambiente 1 se codifica como produccion', () => {
  for (const environment of [2, '2', 0, null, undefined, 5, -1]) {
    const clave = buildAccessKey({
      date: new Date('2026-01-15T12:00:00Z'),
      ruc: '1791312120001',
      docCode: '01',
      environment,
      establishment: '003',
      emissionPoint: '001',
      sequential: 1,
    })
    assert.equal(clave[23], '2', `ambiente ${environment} deberia codificarse como 2`)
  }
  const prod = buildAccessKey({
    date: new Date('2026-01-15T12:00:00Z'),
    ruc: '1791312120001',
    docCode: '01',
    environment: 1,
    establishment: '003',
    emissionPoint: '001',
    sequential: 1,
  })
  assert.equal(prod[23], '1')
})

test('el codigo aleatorio de 8 digitos no se repite de forma sistematica', () => {
  const valores = new Set()
  for (let i = 0; i < 2000; i += 1) {
    const code = randomCode8()
    assert.match(code, /^\d{8}$/)
    valores.add(code)
  }
  assert.ok(valores.size > 1950, `demasiadas colisiones: ${valores.size}/2000`)
})

test('guayaquilParts no se desfasa al cruzar medianoches', () => {
  const casos = [
    // Un instante UTC ya es el dia siguiente en Guayaquil (UTC-5).
    ['2026-01-01T04:59:59Z', '31/12/2025'],
    ['2026-01-01T05:00:01Z', '01/01/2026'],
    ['2026-07-15T04:30:00Z', '14/07/2026'],
    ['2026-12-31T23:00:00Z', '31/12/2026'],
    // Un instante UTC todavia es el dia anterior en Guayaquil.
    ['2027-01-01T04:30:00Z', '31/12/2026'],
    ['2027-01-01T05:00:01Z', '01/01/2027'],
  ]
  for (const [iso, esperado] of casos) {
    assert.equal(guayaquilParts(new Date(iso)).formatted, esperado, iso)
  }
})
