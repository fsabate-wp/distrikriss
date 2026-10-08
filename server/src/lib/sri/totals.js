import { taxFor, isValidIvaRate, round2 } from './xml.js'
import { descripcionFactura, descripcionCantidadVenta, anexoUnidadVenta } from '../precios.js'

/**
 * Calculo fiscal del comprobante: precios, descuentos, bases imponibles y
 * totales. Es codigo puro a proposito: no toca la base de datos ni la red, asi
 * que se puede verificar exhaustivamente en pruebas.
 *
 * Convencion de precios: OrderItem.price es siempre el precio unitario cobrado
 * (con descuento ya aplicado) y OrderItem.listPrice el precio de catalogo. El
 * descuento fiscal es la diferencia entre ambos. Asi el total del comprobante
 * se deriva siempre de lo que realmente se cobro y no puede descuadrar por
 * aplicar el descuento dos veces.
 *
 * El precio del catalogo se trata como IVA incluido, que es como se muestra al
 * consumidor, y de ahi se extrae la base.
 */

export const DELIVERY_LINE_CODE = 'SERVICIO-ENTREGA'
export const DELIVERY_LINE_DESCRIPTION = 'Servicio de entrega a domicilio'

/** Exige que la tarifa de IVA exista en el catalogo del SRI. */
export function resolveRate(rate, fallback = 15) {
  const value = Number(rate ?? fallback)
  if (!isValidIvaRate(value)) {
    throw new Error(`La tarifa de IVA ${value}% no es válida. Usa una de: 0, 2, 3, 4, 5, 10, 12, 14, 15.`)
  }
  return value
}

/** Convierte el detalle del pedido en lineas fiscales. */
export function buildLines(order, settings) {
  const globalRate = resolveRate(Number(settings.sriIvaRate) || 15, 15)
  const deliveryTaxable = settings.sriDeliveryTaxable !== false
  const lines = []
  let totalDiscount = 0

  for (const item of order.items) {
    const rate = resolveRate(item.ivaRate, globalRate)
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Cantidad inválida en la línea "${item.name}"`)
    }

    // El precio unitario de OrderItem es SIEMPRE lo que se cobró (con descuento
    // aplicado) y listPrice es el precio de catálogo. El descuento se deriva de
    // la diferencia entre ambos, no de volver a aplicar el porcentaje sobre un
    // precio ya descontado, que es lo que hacía que el total no cuadrara.
    const unitCharged = Number(item.price)
    const unitList = item.listPrice != null ? Number(item.listPrice) : unitCharged
    if (!Number.isFinite(unitCharged) || unitCharged < 0) {
      throw new Error(`Precio inválido en la línea "${item.name}"`)
    }

    const grossTotal = round2(unitList * quantity)
    const chargedTotal = round2(unitCharged * quantity)
    // El descuento nunca es negativo ni supera el importe de lista.
    const discount = Math.min(Math.max(round2(grossTotal - chargedTotal), 0), Math.max(grossTotal, 0))
    totalDiscount = round2(totalDiscount + discount)

    const base = round2(chargedTotal / (1 + rate / 100))
    // La cantidad del XML es numérica y va en la unidad de medida: 800. La
    // parte humana ("2 cajas") va en la descripción, que es donde el SRI
    // permite texto, y de donde el lector la saca. Se lee del snapshot de la
    // línea, no del producto actual.
    const anexo = anexoUnidadVenta(item)
    const descripcion = descripcionFactura(
      anexo ? `${item.name}${item.presentation ? ` - ${item.presentation}` : ''} ${anexo}` : item.name,
      item.presentation && !anexo ? item.presentation : '',
    )
    lines.push({
      code: item.productId || item.name,
      sriCode: item.sriCode || null,
      // La descripción se recorta al límite del SRI: sin esto, un producto con
      // nombre y presentación largos produce un XML que el SRI rechaza.
      description: descripcion,
      quantity,
      // Cómo se lee la cantidad en la RIDE: "2 cajas" con "800 g" de apoyo.
      venta: descripcionCantidadVenta(item),
      // Sin redondear a 2 decimales: son los que hacen que cantidad x precio
      // unitario cuadre con la base cuando la cantidad es fraccionaria.
      unitPrice: base / quantity,
      base,
      taxRate: rate,
      taxValue: round2(chargedTotal - base),
      discount,
    })
  }

  const deliveryTotal = Number(order.deliveryFee || 0)
  if (deliveryTotal > 0) {
    // El servicio de entrega puede estar gravado o exonerado segun el regimen.
    const rate = deliveryTaxable ? globalRate : 0
    const base = round2(deliveryTotal / (1 + rate / 100))
    lines.push({
      code: DELIVERY_LINE_CODE,
      sriCode: null,
      description: DELIVERY_LINE_DESCRIPTION,
      quantity: 1,
      venta: { principal: '1 entrega', detalle: '' },
      unitPrice: base,
      base,
      taxRate: rate,
      taxValue: round2(deliveryTotal - base),
      discount: 0,
    })
  }

  if (lines.length === 0) throw new Error('No hay lineas para facturar')
  return { lines, totalDiscount, globalRate }
}

/** Agrupa las bases por tarifa para <totalConImpuestos>. */
export function buildTaxGroups(lines) {
  const map = new Map()
  for (const l of lines) {
    const tax = taxFor(l.taxRate)
    const existing = map.get(tax.percentageCode)
    if (existing) {
      existing.base = round2(existing.base + l.base)
      existing.value = round2(existing.value + l.taxValue)
    } else {
      map.set(tax.percentageCode, {
        code: tax.code,
        percentageCode: tax.percentageCode,
        rate: tax.rate,
        base: l.base,
        value: l.taxValue,
      })
    }
  }
  return [...map.values()]
}

export function computeTotals(lines, totalDiscount) {
  const totalSinImpuestos = round2(lines.reduce((acc, l) => acc + l.base, 0))
  const totalImpuestos = round2(lines.reduce((acc, l) => acc + l.taxValue, 0))
  return {
    totalSinImpuestos,
    totalImpuestos,
    totalDiscount: round2(totalDiscount),
    total: round2(totalSinImpuestos + totalImpuestos),
  }
}

/**
 * El total que produce el XML tiene que coincidir con el total del pedido.
 * Si divergen, el comprobante fiscal queda en contradiccion con el comercial y
 * no se emite: es preferible avisar ahora que dejar un documento que el SRI
 * aceptaria y que despues no se podria defender.
 *
 * La tolerancia es de un centimo (redondeo), con un epsilon extra porque en coma
 * flotante un centimo exacto puede compararse como 0.010000000000000009.
 */
export function assertReconciled(computed, order) {
  const orderTotal = round2(Number(order.total))
  const difference = Math.abs(computed.total - orderTotal)
  if (difference > 0.01 + 1e-9) {
    throw new Error(
      `El total de la factura (${computed.total.toFixed(2)}) no coincide con el total del pedido ` +
        `(${orderTotal.toFixed(2)}). No se emite el comprobante para evitar un documento fiscal discordante.`,
    )
  }
  return true
}
