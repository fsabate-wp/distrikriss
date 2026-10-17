import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingRetryWhere, STUCK_GRACE_MS } from '../src/lib/sri/retry.js'

const AHORA = new Date('2026-10-17T12:00:00.000Z')

test('el worker incluye los comprobantes sin nextRetryAt (huerfanos)', () => {
  // El defecto: solo se filtraba nextRetryAt <= ahora, que en SQL excluye NULL.
  // Un comprobante que quedo SIGNED/RECEIVED porque el proceso murio a mitad de
  // envio quedaba fuera del reintento para siempre.
  const where = pendingRetryWhere(AHORA)
  const ramaNull = where.OR.find((b) => b.nextRetryAt === null && b.updatedAt)
  assert.ok(ramaNull, 'falta la rama para nextRetryAt en null')
  assert.ok(ramaNull.updatedAt.lt instanceof Date)
  // Solo toma los que llevan un rato asi: los de un envio en curso no se tocan.
  assert.deepEqual(ramaNull.updatedAt.lt, new Date(AHORA.getTime() - STUCK_GRACE_MS))
  assert.ok(STUCK_GRACE_MS > 0)
})

test('el worker sigue tomando los reintentos ya programados', () => {
  const where = pendingRetryWhere(AHORA)
  assert.ok(where.OR.some((b) => b.nextRetryAt?.lte instanceof Date))
  assert.deepEqual(where.status.in, ['SIGNED', 'RECEIVED', 'FAILED'])
  assert.ok(where.retryCount.lt > 0)
})
