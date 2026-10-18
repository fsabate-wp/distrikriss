import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_PASSWORD_POR_DEFECTO,
  resolveAdminPassword,
  assertSeedAdminPassword,
  decisionAdminSeed,
} from '../prisma/seed-admin.js'

test('sin ADMIN_PASSWORD el seed usaria la contrasena conocida', () => {
  const r = resolveAdminPassword({})
  assert.equal(r.password, ADMIN_PASSWORD_POR_DEFECTO)
  assert.equal(r.esPorDefecto, true)
})

test('con ADMIN_PASSWORD propia no es la de por defecto', () => {
  const r = resolveAdminPassword({ ADMIN_PASSWORD: 'algo-largo-y-unico' })
  assert.equal(r.password, 'algo-largo-y-unico')
  assert.equal(r.esPorDefecto, false)
})

test('en produccion el seed se detiene si la contrasena es la de por defecto', () => {
  assert.throws(
    () => assertSeedAdminPassword({ NODE_ENV: 'production' }),
    /ADMIN_PASSWORD/,
    'no debe crear un admin con contrasena conocida',
  )
  assert.throws(
    () => assertSeedAdminPassword({ NODE_ENV: 'production', ADMIN_PASSWORD: ADMIN_PASSWORD_POR_DEFECTO }),
    /ADMIN_PASSWORD/,
    'tampoco si la definen con el valor por defecto',
  )
})

test('en produccion con ADMIN_PASSWORD propia el seed continua', () => {
  const r = assertSeedAdminPassword({ NODE_ENV: 'production', ADMIN_PASSWORD: 'secreta-y-larga' })
  assert.equal(r.esPorDefecto, false)
})

test('en desarrollo se permite el aviso sin bloquear', () => {
  const r = assertSeedAdminPassword({ NODE_ENV: 'development' })
  assert.equal(r.esPorDefecto, true)
})

test('si el admin no existe se crea', () => {
  assert.equal(decisionAdminSeed({ existe: false, coincidePorDefecto: false, esPorDefecto: true }), 'crear')
})

test('un admin sembrado inseguro se rota al fijar la variable', () => {
  assert.equal(decisionAdminSeed({ existe: true, coincidePorDefecto: true, esPorDefecto: false }), 'rotar')
})

test('no se pisa la contrasena que el operador ya cambio', () => {
  assert.equal(decisionAdminSeed({ existe: true, coincidePorDefecto: false, esPorDefecto: false }), 'dejar')
  // Tampoco se "rota" a la misma por defecto (no cambiaria nada).
  assert.equal(decisionAdminSeed({ existe: true, coincidePorDefecto: true, esPorDefecto: true }), 'dejar')
})
