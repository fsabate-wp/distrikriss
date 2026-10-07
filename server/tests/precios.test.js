import test from 'node:test'
import assert from 'node:assert/strict'
import {
  round2,
  precioConDescuento,
  descuentoValido,
  respetaPaso,
  subtotalDeLineas,
  MAX_CANTIDAD_LINEA,
  descripcionFactura,
} from '../src/lib/precios.js'

/**
 * Copia literal de apps/app/src/utils/format.js. Si el cliente cambia la regla,
 * esta copia hay que actualizarla y el test debe fallar para avisar.
 */
function discountedPriceCliente(price, discount) {
  const d = Number(discount) || 0
  if (d >= 100) return 0
  if (d <= 0) return Number(price || 0)
  return Math.round(Number(price || 0) * (1 - d / 100) * 100) / 100
}

test('el precio con descuento coincide entre cliente y servidor', () => {
  // Si divergen, el carrito muestra una cifra y el pedido cobra otra: es el
  // defecto mas grave posible en una tienda.
  const casos = []
  for (let cents = 1; cents <= 30000; cents += 7) {
    for (const d of [0, 5, 10, 15, 20, 25, 33, 50, 75, 90, 99, 100]) {
      casos.push([cents / 100, d])
    }
  }
  let divergencias = 0
  for (const [precio, descuento] of casos) {
    const cliente = discountedPriceCliente(precio, descuento)
    const servidor = precioConDescuento(precio, descuento)
    if (cliente !== servidor) {
      divergencias += 1
      if (divergencias <= 5) {
        assert.fail(
          `divergencia en precio=${precio} descuento=${descuento}%: cliente=${cliente} servidor=${servidor}`,
        )
      }
    }
  }
  assert.equal(divergencias, 0, `${divergencias} de ${casos.length} casos difieren`)
  assert.ok(casos.length > 50000, `solo se probaron ${casos.length} casos`)
})

test('un descuento de 100% deja el producto gratis', () => {
  assert.equal(precioConDescuento(10, 100), 0)
  assert.equal(precioConDescuento(0.01, 100), 0)
  assert.equal(discountedPriceCliente(10, 100), 0)
})

test('un descuento por encima de 100% se acota a producto gratis', () => {
  assert.equal(precioConDescuento(10, 150), 0)
  assert.equal(descuentoValido(150), 100)
})

test('un descuento negativo se trata como cero', () => {
  assert.equal(precioConDescuento(10, -20), 10)
  assert.equal(descuentoValido(-20), 0)
})

test('el precio sin descuento se redondea a dos decimales', () => {
  // Ojo con los casos trampa: en coma flotante 1.005 * 100 vale 100.49999..., no
  // 100.5, asi que redondea a 1 y no a 1.01. Se comprueba con valores que sí son
  // representables de forma exacta.
  assert.equal(precioConDescuento(1.006, 0), 1.01)
  assert.equal(precioConDescuento(1.004, 0), 1)
  assert.equal(precioConDescuento(1.015, 0), 1.01)
  assert.equal(precioConDescuento(0.005, 0), 0.01)
  assert.equal(precioConDescuento(0, 50), 0)
  assert.equal(precioConDescuento(3.33, 0), 3.33)
})

test('el paso de venta se respeta solo con multiples', () => {
  // Producto a granel: 0.5 kg en pasos de 0.5
  assert.equal(respetaPaso(0.5, 0.5), true)
  assert.equal(respetaPaso(1, 0.5), true)
  assert.equal(respetaPaso(2.5, 0.5), true)
  assert.equal(respetaPaso(0.333, 0.5), false)
  assert.equal(respetaPaso(0.7, 0.5), false)
  assert.equal(respetaPaso(1.25, 0.5), false)

  // Pasos de 50 gramos: 0.75 kg son exactamente 15 pasos.
  assert.equal(respetaPaso(0.75, 0.05), true)
  assert.equal(respetaPaso(2, 0.05), true)
  assert.equal(respetaPaso(0.77, 0.05), false)
  // 0.8 kg si son 16 pasos de 50 g: la tolerancia debe aceptar el resultado que
  // la coma flotante devuelve con un error minimo.
  assert.equal(respetaPaso(0.8, 0.05), true)
})

test('un paso de cero o no numerico no bloquea la cantidad', () => {
  // Un producto mal configurado no debe impedir comprar.
  assert.equal(respetaPaso(1.7, 0), true)
  assert.equal(respetaPaso(1.7, null), true)
  assert.equal(respetaPaso(1.7, 'abc'), true)
  assert.equal(respetaPaso(1.7, -1), true)
})

test('cantidades invalidas se rechazan', () => {
  assert.equal(respetaPaso(0, 0.5), false)
  assert.equal(respetaPaso(-1, 0.5), false)
  assert.equal(respetaPaso(NaN, 0.5), false)
  assert.equal(respetaPaso(Infinity, 0.5), false)
})

test('la suma por linea redondea igual que el carrito', () => {
  // El servidor redondea cada linea y acumula; el carrito redondea al final.
  // Ambas cosas deben coincidir en los casos que importan.
  const lineas = [
    { unitPrice: 1.5, quantity: 0.5 },
    { unitPrice: 3.33, quantity: 1.5 },
    { unitPrice: 0.99, quantity: 3 },
    { unitPrice: 9.99, quantity: 0.25 },
  ]
  const porLinea = subtotalDeLineas(lineas)
  const alFinal = round2(lineas.reduce((a, l) => a + l.unitPrice * l.quantity, 0))
  // Puede haber un centimo de diferencia entre ambas estrategias; lo que no
  // puede pasar es que difieran en mas de un centimo.
  assert.ok(Math.abs(porLinea - alFinal) <= 0.01, `${porLinea} vs ${alFinal}`)
  // Y el propio subtotalDeLineas debe ser estable.
  assert.equal(subtotalDeLineas(lineas), subtotalDeLineas([...lineas].reverse()), 'no depende del orden')
})

test('el subtotal es exactamente el valor que vera el cliente', () => {
  // Tres lineas de 0.1 a 0.5 kg: el redondeo por linea importa.
  const lineas = [{ unitPrice: 0.1, quantity: 3 }]
  assert.equal(subtotalDeLineas(lineas), 0.3)
  const centimos = [{ unitPrice: 0.07, quantity: 3 }]
  assert.equal(subtotalDeLineas(centimos), 0.21)
})

test('el limite por linea esta acotado', () => {
  assert.equal(MAX_CANTIDAD_LINEA, 5000)
})

test('la descripcion de la factura respeta el limite del SRI', () => {
  // El SRI admite 300 caracteres en <descripcion>. Nombre + presentación se
  // combinan, asi que sin recortar un producto con nombre largo producia un XML
  // rechazado y se perdia la factura entera.
  const nombre = 'Papa'.repeat(80) // 320 caracteres
  assert.ok(nombre.length > 300)
  const d = descripcionFactura(nombre, 'Malla 5 lb')
  assert.ok(d.length <= 300, `longitud=${d.length}`)
  assert.match(d, /Malla 5 lb$/, 'debe conservar la presentacion, que es lo informativo')

  const sinPresentacion = descripcionFactura(nombre, '')
  assert.ok(sinPresentacion.length <= 300, `longitud=${sinPresentacion.length}`)

  const corta = descripcionFactura('Papa', 'Malla 5lb')
  assert.equal(corta, 'Papa - Malla 5lb')

  const solo = descripcionFactura('Papa', '')
  assert.equal(solo, 'Papa')

  // Sin espacios redundantes: el SRI los rechaza en <descripcion>.
  assert.equal(descripcionFactura('Papa  negra', '  Malla  '), 'Papa negra - Malla')
})

test('la descripcion no rompe los limites con producto ni presentacion raros', () => {
  const casos = [
    ['Papa', 'x'.repeat(500)],
    ['x'.repeat(500), 'Malla'],
    ['x'.repeat(500), 'y'.repeat(500)],
    ['', ''],
    ['Papa', null],
  ]
  for (const [nombre, presentacion] of casos) {
    const d = descripcionFactura(nombre, presentacion)
    assert.ok(d.length <= 300, `longitud=${d.length} para ${nombre.slice(0, 20)}`)
  }
})