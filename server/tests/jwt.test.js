import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'clave-de-prueba-0000000000000000000000000000'
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-de-prueba-0000000000000000000000000000'

const {
  signRefreshToken,
  verifyRefreshToken,
  accessCookieOptions,
  refreshCookieOptions,
} = await import('../src/lib/jwt.js')

const JWT_MODULE = new URL('../src/lib/jwt.js', import.meta.url).href

function probeJwt(vars) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-jwt-'))
  const archivo = path.join(dir, 'probe.mjs')
  fs.writeFileSync(
    archivo,
    `import { accessCookieOptions, refreshCookieOptions } from ${JSON.stringify(JWT_MODULE)}\n` +
      `console.log(JSON.stringify({ access: accessCookieOptions(), refresh: refreshCookieOptions() }))\n`,
  )
  try {
    const salida = execFileSync(process.execPath, [archivo], {
      env: { ...process.env, ...vars },
      encoding: 'utf8',
    })
    return JSON.parse(salida.trim().split('\n').pop())
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('el refresh token lleva la version de sesion', () => {
  assert.equal(verifyRefreshToken(signRefreshToken({ id: 'u1' })).ver, 0, 'por defecto 0')
  assert.equal(verifyRefreshToken(signRefreshToken({ id: 'u1', tokenVersion: 4 })).ver, 4)
})

test('un token sin ver (emitido antes) cuenta como version 0', () => {
  // Compatibilidad: los tokens existentes no traen `ver`; deben seguir valiendo
  // hasta que el usuario cierre sesion (que sube la version).
  const payload = verifyRefreshToken(signRefreshToken({ id: 'u1' }))
  assert.equal(payload.ver ?? 0, 0)
})

test('las cookies son httpOnly y no se cachean en desarrollo', () => {
  const acc = accessCookieOptions('/')
  const ref = refreshCookieOptions('/api/auth')
  assert.equal(acc.httpOnly, true)
  assert.equal(ref.httpOnly, true)
  assert.equal(acc.secure, false, 'en desarrollo (http) la cookie no puede ir Secure')
  assert.equal(ref.path, '/api/auth', 'el refresh solo viaja a auth')
  assert.equal(acc.sameSite, 'lax')
})

test('en produccion la cookie va siempre Secure', () => {
  // Con SameSite=None el navegador exige Secure: sin esto, y sin COOKIE_SECURE
  // puesto, la sesion no funcionaba en produccion en silencio.
  const opciones = probeJwt({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    ADMIN_PASSWORD: 'clave-admin-real-2026',
    COOKIE_SECURE: '',
  })
  assert.equal(opciones.access.secure, true, 'access Secure aunque COOKIE_SECURE no este')
  assert.equal(opciones.refresh.secure, true)
  assert.equal(opciones.access.sameSite, 'none')
})
