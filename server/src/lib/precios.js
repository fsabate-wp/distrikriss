/**
 * Precio unitario de venta: una sola definicion para el servidor.
 *
 * El cliente tiene su propia copia en apps/app/src/utils/format.js. Ambas deben
 * dar el mismo resultado: si divergen, el carrito muestra una cifra y el pedido
 * cobra otra. La prueba tests/precios.test.js lo comprueba.
 */

/** Redondeo monetario a dos decimales. */
export const round2 = (n) => Math.round(Number(n) * 100) / 100

/**
 * Aplica el descuento de un producto a su precio de catálogo.
 *
 * El precio del catálogo se trata como IVA incluido (es lo que se muestra al
 * consumidor). Un descuento de 100% equivale a un producto gratis.
 */
export function precioConDescuento(precio, descuento) {
  const pct = Number(descuento) || 0
  if (pct >= 100) return 0
  if (pct <= 0) return round2(Number(precio || 0))
  return round2(Number(precio || 0) * (1 - pct / 100))
}

/** Descuento acotado a un porcentaje utilizable. */
export function descuentoValido(descuento) {
  return Math.min(Math.max(Number(descuento) || 0, 0), 100)
}

/**
 * Subtotal del pedido: la suma de las líneas se redondea al final, que es como
 * lo presenta el carrito. El servidor redondea cada línea antes de sumar, así
 * que ambos caminos pueden diferir en un céntimo. Se usa el mismo criterio en
 * los dos lados: redondeo por línea, que es lo que acaba viendo el cliente en el
 * detalle de cada artículo.
 */
export function subtotalDeLineas(lineas) {
  return round2(lineas.reduce((acc, l) => acc + round2(Number(l.unitPrice) * Number(l.quantity)), 0))
}

/**
 * ¿La cantidad pedida respeta el paso de venta del producto?
 *
 * Un producto a granel se vende en múltiplos: 0.5 kg en pasos de 0.5, no 0.333.
 * Se compara contra el múltiplo más cercano con tolerancia de coma flotante.
 */
export function respetaPaso(cantidad, step) {
  const q = Number(cantidad)
  const s = Number(step)
  if (!Number.isFinite(q) || q <= 0) return false
  if (!Number.isFinite(s) || s <= 0) return true
  const pasos = q / s
  const entero = Math.round(pasos)
  return Math.abs(pasos - entero) <= 1e-6
}

/** Cantidad máxima por línea: evita pedidos absurdos o de abuso. */
export const MAX_CANTIDAD_LINEA = 5000

/** Número máximo de líneas en un pedido. */
export const MAX_LINEAS_PEDIDO = 100

/**
 * Cuántos caracteres admite un producto.
 *
 * El SRI limita <descripcion> a 300 y <codigoPrincipal> a 25. Si el nombre y la
 * presentación se combinan sin recortar, un producto con nombre largo produce un
 * XML que el SRI rechaza y se pierde la factura entera.
 */
export const MAX_NOMBRE_PRODUCTO = 160
export const MAX_DESCRIPCION_FACTURA = 300

/**
 * Descripción para la factura: nombre y presentación, con los limites del SRI.
 *
 * Si hay que recortar, se conserva el final del texto: en "Papa — Malla 5lb" lo
 * informativo es la presentación, no el nombre repetido.
 */
export function descripcionFactura(nombre, presentacion = '') {
  const texto = [nombre, presentacion].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim()
  if (texto.length <= MAX_DESCRIPCION_FACTURA) return texto
  const cola = ` - ${presentacion}`.trim()
  const presupuesto = MAX_DESCRIPCION_FACTURA - cola.length
  if (presupuesto > 20) return `${String(nombre).slice(0, presupuesto).trimEnd()}${cola}`
  return texto.slice(texto.length - MAX_DESCRIPCION_FACTURA)
}