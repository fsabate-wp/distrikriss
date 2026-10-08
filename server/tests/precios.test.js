import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import {
  round2,
  precioConDescuento,
  descuentoValido,
  respetaPaso,
  subtotalDeLineas,
  unidadesDeVenta,
  precioPorUnidad,
  MAX_CANTIDAD_LINEA,
  descripcionFactura,
} from '../src/lib/precios.js'

/**
 * El carrito del navegador sobre `localStorage` falso, para probar las acciones
 * del store en Node sin levantar un navegador.
 */
function montarCarrito() {
  const guardado = new Map()
  globalThis.localStorage = {
    getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
    setItem: (k, v) => guardado.set(k, v),
    removeItem: (k) => guardado.delete(k),
    clear: () => guardado.clear(),
  }
  setActivePinia(createPinia())
  return guardado
}

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

/**
 * Copia literal de apps/app/src/utils/format.js para el precio por unidad.
 */
function unidadesDeVentaCliente(minQuantity) {
  const n = Number(minQuantity)
  return Number.isFinite(n) && n > 0 ? n : 1
}
function precioPorUnidadCliente(precio, minQuantity) {
  const p = Number(precio) || 0
  const unidades = unidadesDeVentaCliente(minQuantity)
  if (unidades === 1) return p
  return Math.round((p / unidades) * 1e6) / 1e6
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

test('el precio por unidad coincide entre cliente y servidor', () => {
  // El precio del catálogo es el de la bandeja. Si el carrito y el servidor lo
  // interpretan distinto, el cliente ve un total y se le cobra otro.
  const minimos = [1, 0.25, 0.5, 2, 4, 6, 50, 100, 400, 500, 1000]
  const casos = []
  for (let cents = 1; cents <= 30000; cents += 3) {
    for (const min of minimos) casos.push([cents / 100, min])
  }
  let divergencias = 0
  for (const [precio, minimo] of casos) {
    const cliente = precioPorUnidadCliente(precio, minimo)
    const servidor = precioPorUnidad(precio, minimo)
    if (cliente !== servidor) {
      divergencias += 1
      if (divergencias <= 5) {
        assert.fail(`divergencia en precio=${precio} minimo=${minimo}: cliente=${cliente} servidor=${servidor}`)
      }
    }
  }
  assert.equal(divergencias, 0, `${divergencias} de ${casos.length} casos difieren`)
  assert.ok(casos.length > 50000, `solo se probaron ${casos.length} casos`)
})

test('el precio del catálogo es el de la unidad minima, no el de una unidad', () => {
  // El bug: una bandeja de 400 g a $1 son $1 los 400 g, no $1 por gramo. Con
  // la regla anterior, una sola bandeja salia a $400.
  const precioBandeja = 1
  const pesoBandeja = 400

  const porGramo = precioPorUnidad(precioBandeja, pesoBandeja)
  assert.equal(porGramo, 0.0025, 'el precio por gramo es 1/400')

  assert.equal(round2(porGramo * pesoBandeja), 1, 'una bandeja cuesta lo que dice el catálogo')
  assert.equal(round2(porGramo * pesoBandeja * 2), 2, 'dos bandejas, el doble')
  assert.equal(round2(porGramo * pesoBandeja * 3), 3, 'tres bandejas, el triple')
  // Lo que pasaba antes: 1 * 400 = 400 dólares por una bandeja.
  assert.notEqual(round2(precioBandeja * pesoBandeja), 1)
})

test('un producto con minimo 1 no cambia de precio', () => {
  // La regla es uniforme: si el mínimo es 1, el divisor es 1 y nada cambia. Por
  // eso los productos por kilo o por unidad siguen igual que siempre.
  assert.equal(unidadesDeVenta(1), 1)
  assert.equal(precioPorUnidad(2.5, 1), 2.5)
  assert.equal(precioPorUnidad(2.5, null), 2.5)
  assert.equal(precioPorUnidad(2.5, 0), 2.5)
  assert.equal(precioPorUnidad(2.5, -3), 2.5)
})

test('un minimo de 4 unidades tambien es un empaque', () => {
  // No solo los gramos: hay "Unidad" con mínimo 4 y 6 que son fundas de peras,
  // piña o tomates. El precio es el de la funda, no el de una unidad suelta.
  assert.equal(precioPorUnidad(1, 4), 0.25)
  assert.equal(round2(precioPorUnidad(1, 4) * 4), 1)
  assert.equal(round2(precioPorUnidad(1, 6) * 6), 1)
})

test('el precio por unidad conserva decimales aunque sean muchos', () => {
  // $1 repartidos en 400 g da 0.0025. Redondeado a dos decimales sería 0.00 y
  // el total de la línea se perdería, que es justo lo que pasaba.
  assert.notEqual(precioPorUnidad(1, 400), 0)
  assert.equal(precioPorUnidad(1.1, 400), 0.00275)
  assert.equal(precioPorUnidad(1, 1000), 0.001)
  assert.equal(precioPorUnidad(0.01, 400), 0.000025)
})

test('el descuento se aplica antes de repartir por la unidad minima', () => {
  // Bandeja de 400 g a $2 con 50% de descuento: $1 la bandeja, $0.0025 el gramo.
  // El orden importa para lo que se guarda y se factura: si se repartiera antes
  // de descontar, el precio por gramo guardado sería 0.005 en vez de 0.0025, y
  // el XML declararía un precio unitario que no es el que se cobró.
  const porGramo = precioPorUnidad(precioConDescuento(2, 50), 400)
  assert.equal(porGramo, 0.0025, 'el gramo guardado es el del precio ya descontado')
  assert.equal(round2(porGramo * 400), 1, 'la bandeja descontada cuesta la mitad')
  assert.notEqual(precioPorUnidad(2, 400), porGramo, 'repartir antes de descontar daría otra cosa')
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

// ---------------------------------------------------------------------------
// El botón "+" de la tarjeta del catálogo.
//
// `Product.stock = -1` significa SIN LÍMITE, no "agotado". El store comprobaba
// `stock <= 0` y rechazaba el producto de vuelta, así que, con el valor por
// defecto del esquema y con la importación CSV que fija -1, casi ningún
// producto se podía añadir desde la tarjeta: el clic no hacía nada y sin error
// ni aviso. Estos tests fijan el comportamiento correcto.
// ---------------------------------------------------------------------------

async function carritoNuevo() {
  montarCarrito()
  const { useCartStore } = await import('../../apps/app/src/stores/cart.js')
  return useCartStore()
}

test('el boton + funciona con stock ilimitado (stock = -1)', async () => {
  const cart = await carritoNuevo()
  const producto = { id: 'p1', name: 'Papa', unit: 'Gramos', price: 10, discount: 0, stock: -1, minQuantity: 400, stepQuantity: 400 }
  assert.equal(cart.add(producto), true, 'un producto sin límite de stock se puede añadir')
  assert.equal(cart.items.length, 1, 'queda en el carrito')
  assert.equal(cart.items[0].quantity, 400, 'agrega el mínimo por defecto')
})

test('el stock -1 no se confunde con agotado', async () => {
  const cart = await carritoNuevo()
  // -1 es ilimitado; solo el 0 real significa que no hay.
  assert.equal(cart.add({ id: 'p1', name: 'A', unit: 'Unidad', price: 1, stock: 0, minQuantity: 1 }), false)
  assert.equal(cart.items.length, 0, 'stock 0 no entra al carrito')
})

test('con stock acotado no se puede superar el disponible', async () => {
  const cart = await carritoNuevo()
  const producto = { id: 'p1', name: 'Papa', unit: 'Gramos', price: 10, stock: 500, minQuantity: 100, stepQuantity: 50 }
  assert.equal(cart.add(producto, 100), true)
  // 100 + 500 = 600 > 500 disponibles.
  assert.equal(cart.add(producto, 500), false, 'rechaza pasar del stock')
  assert.equal(cart.items[0].quantity, 100, 'el carrito conserva lo que ya tenía')
})

test('a granel se compra por bandejas enteras, sin fracciones', async () => {
  const cart = await carritoNuevo()
  // Bandeja de 400 g: el paso es el mínimo, así que solo caben 400, 800, 1200.
  const producto = { id: 'p1', name: 'Champiñones', unit: 'Gramos', price: 8, stock: -1, minQuantity: 400, stepQuantity: 400 }
  assert.equal(cart.add(producto, 400), true, 'una bandeja')
  assert.equal(cart.add(producto, 800), true, 'dos bandejas')
  assert.equal(cart.items[0].quantity, 1200, 'acumula tres bandejas')
  // 635 g no es medio kilo ni una bandeja: no se prepara.
  assert.equal(respetaPaso(635, 400), false, 'el servidor rechaza 635 g con bandeja de 400')
})

test('una cantidad a granel invalida no se guarda', async () => {
  const cart = await carritoNuevo()
  const producto = { id: 'p1', name: 'Ajo', unit: 'Gramos', price: 8, stock: -1, minQuantity: 400, stepQuantity: 400 }
  for (const mala of [0, -5, NaN]) {
    assert.equal(cart.add(producto, mala), false, `rechaza ${mala}`)
  }
  assert.equal(cart.items.length, 0, 'nada entra al carrito')
})

test('setQuantity ajusta al paso hacia arriba, nunca por debajo de lo pedido', async () => {
  const cart = await carritoNuevo()
  cart.add({ id: 'p1', name: 'Espinaca', unit: 'Gramos', price: 6, stock: -1, minQuantity: 400, stepQuantity: 400 }, 400)
  cart.setQuantity('p1', 635)
  const q = cart.items[0].quantity
  assert.ok(q % 400 === 0, `la cantidad final es múltiplo de la bandeja (${q})`)
  assert.ok(q >= 635, `no queda por debajo de lo pedido (${q})`)
  assert.equal(q, 800, '635 g se redondea a dos bandejas, nunca a una y media')
})

test('el carrito guarda el precio por gramo, no el de la bandeja', async () => {
  const cart = await carritoNuevo()
  // Bandeja de 400 g a $1. El carrito tiene que guardar 0.0025 por gramo para
  // que el total de la línea dé $1 y no $400.
  const producto = { id: 'p1', name: 'Champiñones', unit: 'Gramos', price: 1, discount: 0, stock: -1, minQuantity: 400, stepQuantity: 400 }
  assert.equal(cart.add(producto, 400), true)
  assert.equal(cart.items[0].price, 0.0025, 'guarda el precio por gramo')
  assert.equal(cart.items[0].salePrice, 1, 'y guarda aparte el precio de la bandeja, que es el que se enseña')
  assert.equal(cart.subtotal, 1, 'una bandeja cuesta $1')
})

test('el carrito suma varias bandejas sin multiplicar por el peso dos veces', async () => {
  const cart = await carritoNuevo()
  const producto = { id: 'p1', name: 'Espinaca', unit: 'Gramos', price: 1.5, discount: 0, stock: -1, minQuantity: 400, stepQuantity: 400 }
  cart.add(producto, 400)
  cart.add(producto, 800)
  assert.equal(cart.items[0].quantity, 1200, 'tres bandejas en total')
  assert.equal(cart.subtotal, 4.5, 'tres bandejas a $1.50 son $4.50')
})

test('un producto de unidad suelta no cambia de precio', async () => {
  const cart = await carritoNuevo()
  const producto = { id: 'p1', name: 'Ajo en cáscara', unit: 'Kilo', price: 2.5, discount: 0, stock: -1, minQuantity: 1, stepQuantity: 1 }
  cart.add(producto, 3)
  assert.equal(cart.items[0].price, 2.5, 'con mínimo 1 el precio es el de la unidad')
  assert.equal(cart.items[0].salePrice, 2.5)
  assert.equal(cart.subtotal, 7.5, '3 kg a $2.50 son $7.50')
})

test('una funda de 4 unidades se cobra por la funda', async () => {
  const cart = await carritoNuevo()
  // "Pera", unidad "Unidad", mínimo 4, presentación "Funda de plástico": el
  // precio del catálogo es el de la funda, no el de una pera.
  const producto = { id: 'p1', name: 'Pera', unit: 'Unidad', price: 1, discount: 0, stock: -1, minQuantity: 4, stepQuantity: 4 }
  cart.add(producto, 4)
  assert.equal(cart.items[0].price, 0.25)
  assert.equal(cart.subtotal, 1, 'una funda de 4 peras cuesta $1')
})

test('un carrito guardado antes del cambio se reconstruye', async () => {
  // Un carrito en localStorage de una versión anterior guardaba el precio de la
  // bandeja en `price` y no traía `salePrice`. Al leerlo hay que convertirlo, o
  // el total sale multiplicado por 400.
  const guardado = montarCarrito()
  setActivePinia(createPinia())
  guardado.set(
    'distrikriss-cart',
    JSON.stringify([
      { productId: 'p1', name: 'Champiñones', unit: 'Gramos', price: 1, minQuantity: 400, stepQuantity: 400, quantity: 400 },
    ]),
  )
  const { useCartStore } = await import('../../apps/app/src/stores/cart.js')
  const cart = useCartStore()
  assert.equal(cart.items[0].price, 0.0025, 'convierte el precio antiguo al precio por gramo')
  assert.equal(cart.items[0].salePrice, 1, 'y conserva el precio de la bandeja para mostrarlo')
  assert.equal(cart.subtotal, 1, 'el total sale bien sin que el cliente vuelva a agregar el producto')
})

test('el carrito guarda el precio ya descontado, no el de lista', async () => {
  const cart = await carritoNuevo()
  cart.add({ id: 'p1', name: 'Arroz', unit: 'Kilo', price: 10, discount: 20, stock: -1, minQuantity: 1 }, 2)
  assert.equal(cart.items[0].price, 8, 'guarda 10 con 20% de descuento = 8')
})