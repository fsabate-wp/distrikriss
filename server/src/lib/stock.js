/**
 * Reglas del stock.
 *
 * El stock comparte unidad con la cantidad del pedido (gramos, kilos, unidades)
 * y puede ser decimal, porque a granel se vende por tramos como 0.5 kg. Un valor
 * negativo significa SIN LÍMITE, no "agotado": el catálogo entero llega con -1 y
 * tratarlo como cero dejaría media tienda invendible.
 */

export const STOCK_SIN_LIMITE = -1

/** ¿Se controla la existencia? Un stock negativo es "sin límite". */
export function stockLimitado(stock) {
  return Number(stock) >= 0
}

/**
 * ¿Alcanza el stock para la cantidad pedida?
 *
 * Sin límite siempre alcanza. Con límite, la comparación tolera el error de
 * redondeo de la coma flotante: 0.1 + 0.2 es 0.30000000000000004, y un pedido de
 * 0.3 kg no puede fallar por esa centésima inexistente.
 */
export function alcanzaElStock(stock, cantidad) {
  if (!stockLimitado(stock)) return true
  return Number(stock) + 1e-9 >= Number(cantidad)
}
