import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * El arranque del servidor no debe depender de que el negocio tenga configurada
 * la facturación. Se comprueba en procesos aparte porque config.js se resuelve
 * una vez al cargarse.
 */

const CONFIG = new URL('../src/config.js', import.meta.url).href

function arrancar(vars) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sri-boot-'))
  const archivo = path.join(dir, 'probe.mjs')
  fs.writeFileSync(archivo, `import ${JSON.stringify(CONFIG)}\nconsole.log('ARRANQUE OK')\n`)
  const env = { ...process.env, ...vars }
  for (const [k, v] of Object.entries(vars)) {
    if (v === null) delete env[k]
  }
  try {
    const salida = execFileSync(process.execPath, [archivo], { env, encoding: 'utf8' })
    return { ok: true, salida }
  } catch (err) {
    return { ok: false, salida: `${err.stdout || ''}${err.stderr || ''}` }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const CLAVES_BUENAS = {
  JWT_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  ADMIN_PASSWORD: 'clave-admin-real-2026',
}

test('produccion arranca aunque el negocio aun no tenga SRI configurado', () => {
  const r = arrancar({
    NODE_ENV: 'production',
    SRI_CERT_SECRET: null,
    ...CLAVES_BUENAS,
  })
  assert.equal(r.ok, true, `debe arrancar sin SRI_CERT_SECRET:\n${r.salida}`)
  assert.match(r.salida, /ARRANQUE OK/)
})

test('produccion arranca con SRI_CERT_SECRET definida', () => {
  const r = arrancar({
    NODE_ENV: 'production',
    SRI_CERT_SECRET: 'c'.repeat(64),
    ...CLAVES_BUENAS,
  })
  assert.equal(r.ok, true, r.salida)
})

test('produccion con SRI_CERT_SECRET vacia tambien arranca', () => {
  // El panel avisara de que falta, pero la tienda debe funcionar.
  const r = arrancar({ NODE_ENV: 'production', SRI_CERT_SECRET: '', ...CLAVES_BUENAS })
  assert.equal(r.ok, true, r.salida)
})

test('JWT_SECRET por defecto si bloquea el arranque', () => {
  // Esta comprobacion si es critica: con el secreto de ejemplo un atacante
  // firma su propio token de ADMIN y controla la emision de facturas.
  const r = arrancar({
    NODE_ENV: 'production',
    JWT_SECRET: 'dev-secret',
    SRI_CERT_SECRET: 'c'.repeat(64),
  })
  assert.equal(r.ok, false, 'no debe arrancar con el secreto de ejemplo')
  assert.match(r.salida, /JWT_SECRET/)
})

test('ADMIN_PASSWORD por defecto si bloquea el arranque', () => {
  // Se parte de las claves correctas y se deja solo la del admin en su valor
  // de ejemplo: es el unico defecto que debe aparecerse en el mensaje.
  const r = arrancar({
    ...CLAVES_BUENAS,
    NODE_ENV: 'production',
    ADMIN_PASSWORD: 'distrikriss-admin',
  })
  assert.equal(r.ok, false)
  assert.match(r.salida, /ADMIN_PASSWORD/)
})

test('desarrollo arranca sin configurar nada', () => {
  const r = arrancar({ NODE_ENV: 'development', SRI_CERT_SECRET: null, JWT_SECRET: 'dev-secret' })
  assert.equal(r.ok, true, r.salida)
})

test('el aviso nombra solo las variables que faltan', () => {
  const r = arrancar({
    NODE_ENV: 'production',
    JWT_SECRET: 'dev-secret',
    JWT_REFRESH_SECRET: 'dev-refresh-secret',
    ADMIN_PASSWORD: 'distrikriss-admin',
  })
  assert.equal(r.ok, false)
  for (const v of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_PASSWORD']) {
    assert.match(r.salida, new RegExp(v))
  }
  // SRI_CERT_SECRET no debe aparecer: su ausencia no es un fallo de arranque.
  assert.doesNotMatch(r.salida, /SRI_CERT_SECRET/)
})
