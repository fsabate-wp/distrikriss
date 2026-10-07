/**
 * Construccion del XML de la factura electronica (SRI, version 1.1.0).
 *
 * Reglas del SRI que este archivo respeta y que antes no se cumplian:
 *  - <precioUnitario> admite hasta 6 decimales cuando la cantidad es fraccionaria.
 *    Redondearlo a 2 hace que <cantidad> * <precioUnitario> no cuadre con
 *    <precioTotalSinImpuesto> y el comprobante se rechaza. Con venta a granel
 *    (pasos de 50 g) esto ocurre en una de cada siete combinaciones reales.
 *  - Las tarifas de IVA deben existir en el catalogo del SRI. Una tarifa no
 *    catalogueada no puede caer silenciosamente en 15%: el SRI compara
 *    <tarifa> contra el <codigoPorcentaje> y rechaza.
 *  - <descripcion> admite 300 caracteres; <codigoPrincipal>, 25.
 *  - Los textos deben ser validos en XML 1.0: sin caracteres de control.
 */

export const IVA_CODES = {
  0: { code: '2', percentageCode: '6' }, // IVA 0%
  2: { code: '2', percentageCode: '7' }, // IVA 2% (transFERencias/contenedores)
  3: { code: '2', percentageCode: '8' }, // IVA 3% (vivienda,istencial)
  4: { code: '2', percentageCode: '9' }, // IVA 4% (turismo)
  5: { code: '2', percentageCode: '5' }, // IVA 5% (construccion, transporte terrestre p)
  10: { code: '2', percentageCode: '1' }, // IVA 10% (alimentos,(confiteria, panaderia)
  12: { code: '2', percentageCode: '2' }, // IVA 12% (alimentos preparados)
  14: { code: '2', percentageCode: '3' }, // IVA 14% (servicios de streaks)
  15: { code: '2', percentageCode: '4' }, // IVA 15% (general)
}

export const DEFAULT_IVA_RATE = 15

const MAX_DESC = 300
const MAX_CODE = 25
const MAX_ADDITIONAL_NAME = 60
const MAX_ADDITIONAL_VALUE = 500

/**
 * Caracteres que XML 1.0 no admite en un documento, ni siquiera escapados.
 * Si un nombre de producto los trae, el XML resultante no es parseable por el
 * SRI y se pierde el comprobante entero.
 */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g
/** Elimina caracteres no representables en XML 1.0. */
export function sanitizeXmlText(value) {
  return String(value ?? '').replace(INVALID_XML_CHARS, '')
}

export function escapeXml(value) {
  return sanitizeXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Normaliza un texto para un campo del SRI: sin saltos de linea ni espacios
 * duplicados (el SRI los rechaza en <descripcion>), recortado al maximo.
 */
export function sriText(value, max = MAX_DESC) {
  return sanitizeXmlText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Redondeo a 2 decimales (montos). */
export const round2 = (n) => Math.round(Number(n) * 100) / 100

/**
 * Formatea un precio unitario. Usa hasta 6 decimales y recorta los ceros
 * sobrantes. El cero de las unidades se conserva siempre: el SRI espera
 * "0.500000" y ".5" no es un numero con forma decimal aceptable.
 */
export function unitPrice(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0.000000'
  return n
    .toFixed(6)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

export const money = (n) => Number(n || 0).toFixed(2)

/** Cantidad: hasta 6 decimales, recortada. El SRI no admite mas. */
export function qty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  return n
    .toFixed(6)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

/**
 * Resuelve el codigo de impuesto de una tarifa.
 * Lanza si la tarifa no existe en el catalogo: es preferible no emitir un
 * comprobante mal formado que emitir uno que el SRI va a rechazar.
 */
export function taxFor(rate) {
  const normalized = Number(rate)
  const found = IVA_CODES[normalized]
  if (!found) {
    throw new Error(
      `Tarifa de IVA ${rate}% no existe en el catalogo del SRI. ` +
        `Validas: ${Object.keys(IVA_CODES).join(', ')}.`,
    )
  }
  return { ...found, rate: normalized }
}

export function isValidIvaRate(rate) {
  return Object.prototype.hasOwnProperty.call(IVA_CODES, Number(rate))
}

export function formatDateGuayaquil(date) {
  const d = date instanceof Date ? date : new Date(date)
  const gmt5 = new Date(d.getTime() - 5 * 60 * 60 * 1000)
  const dd = String(gmt5.getUTCDate()).padStart(2, '0')
  const mm = String(gmt5.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${gmt5.getUTCFullYear()}`
}

export function buildInvoiceXml({
  environment,
  ruc,
  businessName,
  tradeName,
  matrixAddress,
  accessKey,
  docCode = '01',
  establishment,
  emissionPoint,
  sequential,
  issueDate,
  establishmentAddress,
  specialContributor,
  obligadoContabilidad,
  buyer,
  currency = 'USD',
  totalSinImpuestos,
  totalDescuento = 0,
  groups,
  total,
  propina = 0,
  paymentForm,
  lines,
  additional = [],
  motivoNotaCredito,
}) {
  const env = Number(environment) === 1 ? 1 : 2
  const hasSpecialContributor = specialContributor && String(specialContributor).trim() !== ''
  const buyerIsFinal = !buyer || buyer.type === '07'

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('La factura debe tener al menos una linea de detalle')
  }
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('La factura debe declarar al menos un totalImpuesto')
  }

  const linesXml = lines
    .map((l) => {
      const lineIva = taxFor(l.taxRate)
      return `<detalle>
      <codigoPrincipal>${escapeXml(sriText(l.code, MAX_CODE))}</codigoPrincipal>
      ${l.sriCode ? `<codigoSRI>${escapeXml(sriText(l.sriCode, MAX_CODE))}</codigoSRI>` : ''}
      <descripcion>${escapeXml(sriText(l.description, MAX_DESC))}</descripcion>
      <cantidad>${qty(l.quantity)}</cantidad>
      <precioUnitario>${unitPrice(l.unitPrice ?? 0)}</precioUnitario>
      <descuento>${money(l.discount ?? 0)}</descuento>
      <precioTotalSinImpuesto>${money(l.base)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>${lineIva.code}</codigo>
          <codigoPorcentaje>${lineIva.percentageCode}</codigoPorcentaje>
          <tarifa>${money(lineIva.rate)}</tarifa>
          <baseImponible>${money(l.base)}</baseImponible>
          <valor>${money(l.taxValue)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`
    })
    .join('\n    ')

  const totalTaxesXml = groups
    .map(
      (g) => `<totalImpuesto>
        <codigo>${g.code}</codigo>
        <codigoPorcentaje>${g.percentageCode}</codigoPorcentaje>
        <baseImponible>${money(g.base)}</baseImponible>
        <valor>${money(g.value)}</valor>
      </totalImpuesto>`,
    )
    .join('\n        ')

  const additionalXml = additional
    .filter((a) => a && sriText(a.value, MAX_ADDITIONAL_VALUE))
    .map(
      (a) =>
        `    <campoAdicional nombre="${escapeXml(sriText(a.name, MAX_ADDITIONAL_NAME))}">${escapeXml(sriText(a.value, MAX_ADDITIONAL_VALUE))}</campoAdicional>`,
    )
    .join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${env}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXml(sriText(businessName, MAX_DESC))}</razonSocial>
    ${tradeName ? `<nombreComercial>${escapeXml(sriText(tradeName, MAX_DESC))}</nombreComercial>` : ''}
    <ruc>${escapeXml(String(ruc))}</ruc>
    <claveAcceso>${escapeXml(accessKey)}</claveAcceso>
    <codDoc>${escapeXml(String(docCode))}</codDoc>
    <estab>${escapeXml(String(establishment))}</estab>
    <ptoEmi>${escapeXml(String(emissionPoint))}</ptoEmi>
    <secuencial>${String(sequential).padStart(9, '0')}</secuencial>
    <dirMatriz>${escapeXml(sriText(matrixAddress, MAX_DESC))}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${formatDateGuayaquil(issueDate)}</fechaEmision>
    <dirEstablecimiento>${escapeXml(sriText(establishmentAddress || matrixAddress, MAX_DESC))}</dirEstablecimiento>
    ${hasSpecialContributor ? `<contribuyenteEspecial>${escapeXml(sriText(specialContributor, MAX_CODE))}</contribuyenteEspecial>` : ''}
    ${motivoNotaCredito ? `<motivoNotaCredito>${escapeXml(sriText(motivoNotaCredito, MAX_DESC))}</motivoNotaCredito>` : ''}
    <obligadoContabilidad>${obligadoContabilidad ? 'SI' : 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${escapeXml(String(buyerIsFinal ? '07' : buyer.type))}</tipoIdentificacionComprador>
    ${buyerIsFinal ? '' : `<razonSocialComprador>${escapeXml(sriText(buyer.name, MAX_DESC))}</razonSocialComprador>
    <identificacionComprador>${escapeXml(String(buyer.id))}</identificacionComprador>`}
    ${buyer?.address ? `<direccionComprador>${escapeXml(sriText(buyer.address, MAX_DESC))}</direccionComprador>` : ''}
    <totalSinImpuestos>${money(totalSinImpuestos)}</totalSinImpuestos>
    <totalDescuento>${money(totalDescuento)}</totalDescuento>
    <totalConImpuestos>
        ${totalTaxesXml}
    </totalConImpuestos>
    <propina>${money(propina)}</propina>
    <importeTotal>${money(total)}</importeTotal>
    <moneda>${escapeXml(sriText(currency, 10))}</moneda>
    <pagos>
      <pago>
        <formaPago>${escapeXml(String(paymentForm))}</formaPago>
        <total>${money(total)}</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    ${linesXml}
  </detalles>
  ${additionalXml ? `<infoAdicional>
  ${additionalXml}
  </infoAdicional>` : ''}
</factura>`
}

/**
 * Estructura del XML de nota de credito. Mismo raiz del comprobante que la
 * factura, con codDoc 07 y referencia al comprobante que anula.
 */
export function buildCreditNoteXml({
  environment,
  ruc,
  businessName,
  tradeName,
  matrixAddress,
  accessKey,
  docCode = '07',
  establishment,
  emissionPoint,
  sequential,
  issueDate,
  establishmentAddress,
  specialContributor,
  obligadoContabilidad,
  buyer,
  currency = 'USD',
  totalSinImpuestos,
  totalDescuento = 0,
  groups,
  total,
  motivo,
  referenced: ref,
  lines,
}) {
  const env = Number(environment) === 1 ? 1 : 2
  const hasSpecialContributor = specialContributor && String(specialContributor).trim() !== ''
  const buyerIsFinal = !buyer || buyer.type === '07'

  const linesXml = lines
    .map((l) => {
      const lineIva = taxFor(l.taxRate)
      return `<detalle>
      <codigoPrincipal>${escapeXml(sriText(l.code, MAX_CODE))}</codigoPrincipal>
      <descripcion>${escapeXml(sriText(l.description, MAX_DESC))}</descripcion>
      <cantidad>${qty(l.quantity)}</cantidad>
      <precioUnitario>${unitPrice(l.unitPrice ?? 0)}</precioUnitario>
      <precioTotalSinImpuesto>${money(l.base)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>${lineIva.code}</codigo>
          <codigoPorcentaje>${lineIva.percentageCode}</codigoPorcentaje>
          <tarifa>${money(lineIva.rate)}</tarifa>
          <baseImponible>${money(l.base)}</baseImponible>
          <valor>${money(l.taxValue)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`
    })
    .join('\n    ')

  const totalTaxesXml = groups
    .map(
      (g) => `<totalImpuesto>
        <codigo>${g.code}</codigo>
        <codigoPorcentaje>${g.percentageCode}</codigoPorcentaje>
        <baseImponible>${money(g.base)}</baseImponible>
        <valor>${money(g.value)}</valor>
      </totalImpuesto>`,
    )
    .join('\n        ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<notaCredito id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${env}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXml(sriText(businessName, MAX_DESC))}</razonSocial>
    ${tradeName ? `<nombreComercial>${escapeXml(sriText(tradeName, MAX_DESC))}</nombreComercial>` : ''}
    <ruc>${escapeXml(String(ruc))}</ruc>
    <claveAcceso>${escapeXml(accessKey)}</claveAcceso>
    <codDoc>${escapeXml(String(docCode))}</codDoc>
    <estab>${escapeXml(String(establishment))}</estab>
    <ptoEmi>${escapeXml(String(emissionPoint))}</ptoEmi>
    <secuencial>${String(sequential).padStart(9, '0')}</secuencial>
    <dirMatriz>${escapeXml(sriText(matrixAddress, MAX_DESC))}</dirMatriz>
  </infoTributaria>
  <infoNotaCredito>
    <fechaEmision>${formatDateGuayaquil(issueDate)}</fechaEmision>
    <dirEstablecimiento>${escapeXml(sriText(establishmentAddress || matrixAddress, MAX_DESC))}</dirEstablecimiento>
    ${hasSpecialContributor ? `<contribuyenteEspecial>${escapeXml(sriText(specialContributor, MAX_CODE))}</contribuyenteEspecial>` : ''}
    <tipoIdentificacionComprador>${escapeXml(String(buyerIsFinal ? '07' : buyer.type))}</tipoIdentificacionComprador>
    ${buyerIsFinal ? '' : `<razonSocialComprador>${escapeXml(sriText(buyer.name, MAX_DESC))}</razonSocialComprador>
    <identificacionComprador>${escapeXml(String(buyer.id))}</identificacionComprador>`}
    ${buyer?.address ? `<direccionComprador>${escapeXml(sriText(buyer.address, MAX_DESC))}</direccionComprador>` : ''}
    <obligadoContabilidad>${obligadoContabilidad ? 'SI' : 'NO'}</obligadoContabilidad>
    <motivo>${escapeXml(sriText(motivo, MAX_DESC))}</motivo>
    <totalSinImpuestos>${money(totalSinImpuestos)}</totalSinImpuestos>
    <totalDescuento>${money(totalDescuento)}</totalDescuento>
    <totalConImpuestos>
        ${totalTaxesXml}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${money(total)}</importeTotal>
    <moneda>${escapeXml(sriText(currency, 10))}</moneda>
  </infoNotaCredito>
  <refunds>
    <refund>
      <refundID>${escapeXml(String(ref.number))}</refundID>
      <refundReason>${escapeXml(sriText(ref.reason, MAX_DESC))}</refundReason>
    </refund>
  </refunds>
  <detalles>
    ${linesXml}
  </detalles>
</notaCredito>`
}
