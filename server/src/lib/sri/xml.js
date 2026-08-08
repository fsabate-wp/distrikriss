const escape = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const money = (n) => Number(n).toFixed(2)

export const TAX_CODES = {
  0: { code: '2', percentageCode: '6' },
  5: { code: '2', percentageCode: '5' },
  12: { code: '2', percentageCode: '2' },
  14: { code: '2', percentageCode: '3' },
  15: { code: '2', percentageCode: '4' },
}

function taxFor(rate) {
  return TAX_CODES[Number(rate)] || TAX_CODES[15]
}

function fmtDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function fmtQty(n) {
  const value = Number(n)
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
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
  tax,
  total,
  propina = 0,
  paymentForm,
  lines,
  additional = [],
}) {
  const env = Number(environment) === 1 ? 1 : 2
  const iva = taxFor(tax.rate)
  const hasSpecialContributor = specialContributor && String(specialContributor).trim() !== ''
  const buyerIsFinal = !buyer || buyer.type === '07'

  const linesXml = lines
    .map((l) => {
      const lineIva = taxFor(l.taxRate)
      return `<detalle>
      <codigoPrincipal>${escape(l.code)}</codigoPrincipal>
      <descripcion>${escape(l.description)}</descripcion>
      <cantidad>${fmtQty(l.quantity)}</cantidad>
      <precioUnitario>${money(l.unitPrice ?? 0)}</precioUnitario>
      <descuento>${money(l.discount ?? 0)}</descuento>
      <precioTotalSinImpuesto>${money(l.base)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>${lineIva.code}</codigo>
          <codigoPorcentaje>${lineIva.percentageCode}</codigoPorcentaje>
          <tarifa>${money(l.taxRate)}</tarifa>
          <baseImponible>${money(l.base)}</baseImponible>
          <valor>${money(l.taxValue)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`
    })
    .join('\n    ')

  const totalTaxesXml = tax.groups
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
    .map((a) => `    <campoAdicional nombre="${escape(a.name)}">${escape(a.value)}</campoAdicional>`)
    .join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${env}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escape(businessName)}</razonSocial>
    ${tradeName ? `<nombreComercial>${escape(tradeName)}</nombreComercial>` : ''}
    <ruc>${ruc}</ruc>
    <claveAcceso>${accessKey}</claveAcceso>
    <codDoc>${docCode}</codDoc>
    <estab>${establishment}</estab>
    <ptoEmi>${emissionPoint}</ptoEmi>
    <secuencial>${String(sequential).padStart(9, '0')}</secuencial>
    <dirMatriz>${escape(matrixAddress)}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fmtDate(issueDate)}</fechaEmision>
    <dirEstablecimiento>${escape(establishmentAddress || matrixAddress)}</dirEstablecimiento>
    ${hasSpecialContributor ? `<contribuyenteEspecial>${escape(specialContributor)}</contribuyenteEspecial>` : ''}
    <obligadoContabilidad>${obligadoContabilidad ? 'SI' : 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${buyerIsFinal ? '07' : buyer.type}</tipoIdentificacionComprador>
    ${buyerIsFinal ? '' : `<razonSocialComprador>${escape(buyer.name)}</razonSocialComprador>
    <identificacionComprador>${escape(buyer.id)}</identificacionComprador>`}
    ${buyer?.address ? `<direccionComprador>${escape(buyer.address)}</direccionComprador>` : ''}
    <totalSinImpuestos>${money(totalSinImpuestos)}</totalSinImpuestos>
    <totalDescuento>${money(totalDescuento)}</totalDescuento>
    <totalConImpuestos>
        ${totalTaxesXml}
    </totalConImpuestos>
    <propina>${money(propina)}</propina>
    <importeTotal>${money(total)}</importeTotal>
    <moneda>${escape(currency)}</moneda>
    <pagos>
      <pago>
        <formaPago>${paymentForm}</formaPago>
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
