import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDeliveryDay, isDeliveryDay, computeDeliveryFee, capacityOf, MAX_DIAS_ANTICIPACION } from '../src/lib/delivery.js'

const zone = {
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  slots: [
    { id: 'manana', label: 'Mañana', capacity: 2 },
    { id: 'tarde', label: 'Tarde', capacity: 1 },
  ],
  deliveryFeeBase: 2,
  deliveryFeePerKm: 0.5,
  minOrderAmount: 10,
}

const settings = { orderCutoff: '18:00' }

function dia(offset) {
  const d = new Date(2026, 9, 6, 12, 0) // 6 de octubre de 2026, mediodía
  d.setDate(d.getDate() + offset)
  return d
}

test('una fecha de hoy antes de la hora de corte se acepta', () => {
  const r = validateDeliveryDay(dia(0), zone, settings, dia(0))
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('una fecha de hoy despues del corte se rechaza', () => {
  const ahora = new Date(2026, 9, 6, 19, 0)
  const r = validateDeliveryDay(ahora, zone, settings, ahora)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'CUTOFF_PASSED')
})

test('un dia sin entrega programada se rechaza', () => {
  const soloLunes = { ...zone, deliveryDays: [1] }
  // 2026-10-06 es martes.
  const r = validateDeliveryDay(dia(0), soloLunes, settings, dia(0))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'NOT_DELIVERY_DAY')
})

test('una fecha pasada se rechaza', () => {
  const r = validateDeliveryDay(dia(-1), zone, settings, dia(0))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'PAST_DATE')
})

test('hoy a las 00:30 no se rechaza como fecha pasada', () => {
  // El defecto: se comparaba el instante exacto, no el dia. Un pedido hecho de
  // madrugada en Guayaquil, validado por un servidor en UTC, caia en el dia
  // anterior y se rechazaba.
  const madrugada = new Date(2026, 9, 6, 0, 30)
  const r = validateDeliveryDay(madrugada, zone, settings, madrugada)
  assert.equal(r.ok, true, `deberia aceptarse: ${JSON.stringify(r)}`)
})

test('agendar muy lejos se rechaza', () => {
  const r = validateDeliveryDay(dia(MAX_DIAS_ANTICIPACION + 1), zone, settings, dia(0))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'TOO_FAR_AHEAD')
})

test('el limite de anticipacion es inclusivo', () => {
  const r = validateDeliveryDay(dia(MAX_DIAS_ANTICIPACION), zone, settings, dia(0))
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('isDeliveryDay lee el dia de la semana de la fecha', () => {
  assert.equal(isDeliveryDay(new Date(2026, 9, 5), zone), true) // lunes
  assert.equal(isDeliveryDay(new Date(2026, 9, 5), { deliveryDays: [0] }), false) // domingo
  assert.equal(isDeliveryDay(new Date(2026, 9, 5), { deliveryDays: [] }), false)
  assert.equal(isDeliveryDay(new Date(2026, 9, 5), {}), false)
})

test('el envio se calcula con base mas distancia', () => {
  assert.equal(computeDeliveryFee(0, zone), 2)
  assert.equal(computeDeliveryFee(2, zone), 3)
  assert.equal(computeDeliveryFee(10, zone), 7)
})

test('la capacidad del horario se lee de la zona', () => {
  assert.equal(capacityOf(zone, 'manana'), 2)
  assert.equal(capacityOf(zone, 'tarde'), 1)
  assert.equal(capacityOf(zone, 'inexistente'), 0)
  assert.equal(capacityOf(null, 'manana'), 0)
  assert.equal(capacityOf({}, 'manana'), 0)
})

test('una zona sin capacidad declarada no acepta pedidos', () => {
  // Capacidad 0 significa "sin plazas". Si se tratara como ilimitado, un horario
  // mal configurado aceptaria pedidos sin limite.
  assert.equal(capacityOf({ slots: [{ id: 'x', capacity: 0 }] }, 'x'), 0)
  assert.equal(capacityOf({ slots: [{ id: 'x' }] }, 'x'), 0)
})