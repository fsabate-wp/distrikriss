export function money(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

export function discountedPrice(price, discount) {
  const d = Number(discount) || 0
  if (d >= 100) return 0
  if (d <= 0) return Number(price || 0)
  return Math.round(Number(price || 0) * (1 - d / 100) * 100) / 100
}

/**
 * Copia literal de server/src/lib/precios.js. Si el servidor cambia la regla,
 * esta copia hay que actualizarla y precios.test.js debe fallar.
 *
 * El precio del catálogo es el de la unidad mínima (la bandeja), no el de una
 * unidad de medida: $1 por una bandeja de 400 g son $0.0025 por gramo. Con la
 * regla anterior el total de la línea salía multiplicado por 400.
 */
export function unidadesDeVenta(minQuantity) {
  const n = Number(minQuantity)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function precioPorUnidad(precio, minQuantity) {
  const p = Number(precio) || 0
  const unidades = unidadesDeVenta(minQuantity)
  if (unidades === 1) return p
  return Math.round((p / unidades) * 1e6) / 1e6
}

/**
 * Cómo se llama la unidad en la que realmente se vende un producto.
 *
 * El tendero compra y vende cajas, fundas y bandejas; los gramos solo sirven
 * para pesar. La presentación del catálogo ("Caja de plástico", "Funda
 * poliester") dice cuál es, así que se usa su primera palabra en vez de
 * inventar un nombre.
 */
export function nombreUnidadVenta(presentation, unit) {
  const p = String(presentation || '').trim()
  if (p) return p.split(/[\s-]+/)[0].toLowerCase()
  const u = String(unit || '').toLowerCase()
  if (['gramos', 'g', 'gramo', 'kilo', 'kg', 'kilogramo', 'libra', 'lb'].includes(u)) return 'bandeja'
  return 'unidad'
}

/**
 * Plural español sencillo.
 *
 * Alcanza para "caja" -> "cajas" y "unidad" -> "unidades". No cubre el resto de
 * la lengua, y no hace falta: los empaque tienen nombre propio en la
 * presentación del catálogo.
 */
export function pluralizar(palabra, n) {
  if (Math.abs(Number(n) - 1) < 1e-9) return palabra
  if (/(z|d)$/i.test(palabra)) return `${palabra}es`
  if (/[aeiouáéíóú]$/i.test(palabra)) return `${palabra}s`
  return `${palabra}s`
}

/**
 * Cómo se lee una cantidad en el carrito y el checkout.
 *
 * Un producto que se vende por empaque se lee en empaque: "2 cajas", con los
 * 800 gramos como dato secundario. Leer "800 Gramos" hides lo que el cliente
 * compró y parece queumbentó 800 piezas.
 *
 * Devuelve dos partes: la principal (cuántas cajas) y el detalle (el peso).
 */
export function descripcionCantidad({ quantity, minQuantity, presentation, unit }) {
  const n = Number(quantity) || 0
  const unidades = unidadesDeVenta(minQuantity)

  if (unidades <= 1) {
    return { principal: `${formatQtyCorto(n)} ${unit || 'unidad'}`, detalle: '' }
  }

  const cajas = Math.round((n / unidades) * 100) / 100
  const nombre = nombreUnidadVenta(presentation, unit)
  const principal = `${formatQtyCorto(cajas)} ${pluralizar(nombre, cajas)}`
  // El peso solo tiene sentido si el producto se mide en masa o volumen.
  const detalle = ['gramos', 'g', 'gramo', 'kilo', 'kg', 'kilogramo', 'libra', 'lb'].includes(
    String(unit || '').toLowerCase(),
  )
    ? `${formatQtyCorto(n)} ${String(unit).toLowerCase()}`
    : `${formatQtyCorto(unidades)} por ${nombre}`
  return { principal, detalle }
}

function formatQtyCorto(v) {
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

export function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-EC', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatDateLong(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-EC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleString('es-EC', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const STATUS_LABELS = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'En preparación',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

export const PAYMENT_LABELS = {
  TRANSFER: 'Transferencia',
  COD: 'Contra reembolso',
}

export const INVOICE_STATUS_LABELS = {
  AUTHORIZED: 'Autorizada por el SRI',
  RECEIVED: 'Recibida, esperando autorización',
  SIGNED: 'Firmada, enviando',
  DRAFT: 'Preparada',
  NO_CERTIFICATE: 'Error del certificado',
  REJECTED: 'Rechazada por el SRI',
  NOT_AUTHORIZED: 'No autorizada',
  FAILED: 'Error de envío',
  CREDITED: 'Anulada con nota de crédito',
}

/** Estados en los que no tiene sentido reintentar: el SRI ya dio su respuesta. */
export const INVOICE_TERMINAL_STATUSES = ['AUTHORIZED', 'NOT_AUTHORIZED', 'REJECTED', 'CREDITED']

/** Estados que requieren la atención del administrador. */
export const INVOICE_PROBLEM_STATUSES = ['NO_CERTIFICATE', 'REJECTED', 'NOT_AUTHORIZED', 'FAILED']

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
