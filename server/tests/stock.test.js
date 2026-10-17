import test from 'node:test'
import assert from 'node:assert/strict'
import { stockLimitado, alcanzaElStock, STOCK_SIN_LIMITE } from '../src/lib/stock.js'

test('el stock negativo es "sin limite", no "agotado"', () => {
  assert.equal(STOCK_SIN_LIMITE, -1)
  assert.equal(stockLimitado(-1), false)
  assert.equal(stockLimitado(0), true)
  assert.equal(alcanzaElStock(-1, 999999), true, 'sin limite siempre alcanza')
})

test('el stock 0 no deja pedir nada', () => {
  assert.equal(stockLimitado(0), true)
  assert.equal(alcanzaElStock(0, 1), false)
  assert.equal(alcanzaElStock(0, 0.5), false)
})

test('alcanza hasta el limite exacto y no mas', () => {
  assert.equal(alcanzaElStock(10, 10), true)
  assert.equal(alcanzaElStock(10, 10.01), false)
  assert.equal(alcanzaElStock(10, 6), true)
})

test('el stock admite fracciones, como la cantidad a granel', () => {
  // El defecto: con `stock` en entero, un stock de 0.5 no podia representarse y
  // descontar 1.5 kg dejaba el stock invalido.
  assert.equal(alcanzaElStock(0.5, 0.5), true, 'media unidad disponible vende media')
  assert.equal(alcanzaElStock(2.5, 1.5), true, 'dos kilos y medio dan para uno y medio')
  assert.equal(alcanzaElStock(2.5, 3), false, 'y no para tres')
})

test('la tolerancia de coma flotante no bloquea un pedido valido', () => {
  // 0.1 + 0.2 es 0.30000000000000004 en coma flotante.
  const cantidad = 0.1 + 0.2
  assert.equal(alcanzaElStock(0.3, cantidad), true, 'un stock de 0.3 alcanza para 0.1 + 0.2')
})
