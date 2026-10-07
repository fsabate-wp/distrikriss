import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// La clave de cifrado se fija antes de importar el modulo: encryptSecret lee
// config.sri.certSecret, que se resuelve desde el entorno al cargar config.js.
process.env.SRI_CERT_SECRET = crypto.randomBytes(32).toString('hex')

const { encryptSecret, decryptSecret, isEncrypted, safeEqual, fingerprint } = await import(
  '../src/lib/crypto.js'
)

test('un secreto cifrado vuelve a leerse igual', () => {
  for (const valor of ['clave-del-p12', 'con espacios y símbolos !@#$%', 'ñáéíóú', 'x'.repeat(500)]) {
    const cifrado = encryptSecret(valor)
    assert.notEqual(cifrado, valor, 'el texto plano no debe quedar a la vista')
    assert.equal(decryptSecret(cifrado), valor)
  }
})

test('el cifrado es aleatorio: dos veces el mismo secreto dan salidas distintas', () => {
  const a = encryptSecret('misma-clave')
  const b = encryptSecret('misma-clave')
  assert.notEqual(a, b, 'sin IV aleatorio dos ciphertexts identicos delatan equivalencia')
  assert.equal(decryptSecret(a), decryptSecret(b), 'misma clave, mismo texto plano')
})

test('un ciphertext alterado se detecta en vez de devolver basura', () => {
  const cifrado = encryptSecret('clave-del-p12')
  const partes = cifrado.split('.')
  // Se voltea un byte del texto cifrado.
  const ct = Buffer.from(partes[3], 'base64')
  ct[0] ^= 0xff
  partes[3] = ct.toString('base64')
  assert.throws(() => decryptSecret(partes.join('.')), /unable to authenticate|bad decrypt|Unsupported state/i)
})

test('un payload corrupto o de otro formato se rechaza con un mensaje claro', () => {
  assert.throws(() => decryptSecret('no-es-un-secreto'), /formato desconocido/)
  assert.throws(() => decryptSecret('v2.a.b.c'), /formato desconocido/)
  assert.throws(() => decryptSecret('v1.solo.tres'), /formato desconocido/)
})

test('un valor vacio se mantiene vacio y no inventa un ciphertext', () => {
  for (const vacio of ['', null, undefined]) {
    assert.equal(encryptSecret(vacio), '')
    assert.equal(decryptSecret(''), '')
    assert.equal(isEncrypted(''), false)
  }
})

test('isEncrypted distingue un ciphertext de un texto plano heredado', () => {
  const cifrado = encryptSecret('clave')
  assert.equal(isEncrypted(cifrado), true)
  assert.equal(isEncrypted('clave-en-claro'), false)
  assert.equal(isEncrypted('v1.incompleto'), false)
})

test('safeEqual no filtra informacion por la longitud', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual('', ''), true)
  assert.equal(safeEqual(null, ''), true)
  assert.equal(safeEqual(undefined, null), true)
})

test('la huella de un archivo cambia con el contenido', () => {
  const a = fingerprint(Buffer.from('certificado-1'))
  const b = fingerprint(Buffer.from('certificado-2'))
  assert.notEqual(a, b)
  assert.equal(a, fingerprint(Buffer.from('certificado-1')), 'la huella es estable')
  assert.match(a, /^[0-9a-f]{32}$/)
})

test('el ciphertext lleva version, IV, tag y texto cifrado', () => {
  const partes = encryptSecret('hola').split('.')
  assert.equal(partes.length, 4)
  assert.equal(partes[0], 'v1')
  assert.equal(Buffer.from(partes[1], 'base64').length, 12, 'IV de 12 bytes para GCM')
  assert.equal(Buffer.from(partes[2], 'base64').length, 16, 'tag de 16 bytes para GCM')
  assert.ok(Buffer.from(partes[3], 'base64').length > 0)
})

test('sin SRI_CERT_SECRET el cifrado falla con instrucciones, no en silencio', async () => {
  // Proceso aparte: tanto config.js como la cache de claves ya estan resueltos
  // en este, y la comprobación debe partir de un entorno limpio.
  // En PRODUCCION la clave es obligatoria, porque de lo contrario una contrasa
  // guardada quedaria cifrada con una clave derivada y seria ilegible al
  // desplegar de verdad.
  const script = `
    import { encryptSecret } from ${JSON.stringify(new URL('../src/lib/crypto.js', import.meta.url).href)}
    try {
      encryptSecret('x')
      console.log('NO_FALLO')
    } catch (err) {
      console.log('ERROR:' + err.message)
    }
  `
  const archivo = path.join(os.tmpdir(), `sri-crypto-${Date.now()}.mjs`)
  fs.writeFileSync(archivo, script)
  // Se parte de un entorno de produccion valido (claves de ejemplo del repo
  // sustituidas por valores reales) para que el unico fallo posible sea la
  // ausencia de SRI_CERT_SECRET.
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    ADMIN_PASSWORD: 'clave-admin-real-2026',
  }
  delete env.SRI_CERT_SECRET
  try {
    const salida = execFileSync(process.execPath, [archivo], { env, encoding: 'utf8' })
    assert.notEqual(salida.trim(), 'NO_FALLO', 'en produccion no se debe cifrar sin la clave')
    assert.match(salida, /Falta SRI_CERT_SECRET/)
    assert.match(salida, /openssl rand -hex 32/)
  } finally {
    fs.rmSync(archivo, { force: true })
  }
})

test('en desarrollo el cifrado funciona sin SRI_CERT_SECRET', async () => {
  // Un negocio que todavia no factura no debe tener que configurar nada extra
  // para que la tienda funcione: en desarrollo se deriva una clave del secreto
  // de JWT y el certificado de pruebas queda cifrado igualmente.
  const script = `
    import { encryptSecret, decryptSecret } from ${JSON.stringify(new URL('../src/lib/crypto.js', import.meta.url).href)}
    const c = encryptSecret('clave-de-pruebas')
    console.log('CIFRADO:' + decryptSecret(c))
  `
  const archivo = path.join(os.tmpdir(), `sri-crypto-dev-${Date.now()}.mjs`)
  fs.writeFileSync(archivo, script)
  const env = { ...process.env, NODE_ENV: 'development' }
  delete env.SRI_CERT_SECRET
  try {
    const salida = execFileSync(process.execPath, [archivo], { env, encoding: 'utf8' })
    assert.match(salida, /CIFRADO:clave-de-pruebas/)
  } finally {
    fs.rmSync(archivo, { force: true })
  }
})
