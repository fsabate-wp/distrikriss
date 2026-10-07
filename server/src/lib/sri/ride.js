import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { money, qty, formatDateGuayaquil } from './xml.js'

/**
 * Representacion impresa del comprobante (RIDE).
 *
 * Sin esto el cliente recibe un XML que no puede leer ni validar: el SRI exige
 * una RIDE para que la factura sirva como respaldo de la deduccion del IVA. Los
 * tres elementos que la hacen util son el codigo de barras/QR con la
 * CLAVEACCESO, el numero de autorizacion y la firma digital visible.
 */

const PAGE_MARGIN = 40
const BLUE = '#1B5E20'
const GREY = '#666666'
const LINE = '#D0D0D0'

const VERIFY_URLS = {
  1: 'https://www.sri.gob.ec/online/verificacionComprobantes',
  2: 'https://celcer.sri.gob.ec/verificacion/ComprobantesSinAutorizacion',
}

/** Texto legible de un valor que puede venir como Decimal de Prisma. */
const txt = (v) => (v === null || v === undefined ? '' : String(v))

function drawHeader(doc, { invoice, settings }) {
  const y = PAGE_MARGIN
  doc
    .fillColor(BLUE)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(txt(settings.businessName), PAGE_MARGIN, y, { width: 330 })
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(GREY)
    .text(
      [
        txt(settings.tradeName) ? `Nombre comercial: ${txt(settings.tradeName)}` : null,
        `RUC: ${txt(settings.ruc)}`,
        `Dirección: ${txt(settings.sriAddress || settings.storeAddress)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      PAGE_MARGIN,
      y + 16,
      { width: 330 },
    )

  doc
    .fillColor(BLUE)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('RIDE', 400, y, { width: 155, align: 'right' })
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(GREY)
    .text(
      ['Recibo Electrónico', invoice.docType === 'NOTA_CREDITO' ? 'Nota de Crédito' : 'Factura'].join('\n'),
      400,
      y + 16,
      { width: 155, align: 'right' },
    )

  doc.moveTo(PAGE_MARGIN, y + 62).lineTo(555, y + 62).lineWidth(0.8).strokeColor(BLUE).stroke()
}

function drawBox(doc, { invoice, settings }) {
  const top = PAGE_MARGIN + 74
  const height = 74
  doc.roundedRect(PAGE_MARGIN, top, 515, height, 4).lineWidth(0.6).strokeColor(LINE).stroke()

  const label = (t, x, y) =>
    doc.font('Helvetica').fontSize(6.5).fillColor(GREY).text(t.toUpperCase(), x, y, { width: 150 })

  const value = (t, x, y, width = 150, size = 9) =>
    doc.font('Helvetica-Bold').fontSize(size).fillColor('#000000').text(txt(t), x, y, { width })

  const col2 = PAGE_MARGIN + 175
  const col3 = PAGE_MARGIN + 350

  label('Número de comprobante', PAGE_MARGIN + 8, top + 9)
  value(invoice.number, PAGE_MARGIN + 8, top + 18)

  label('Fecha de emisión', col2, top + 9)
  value(formatDateGuayaquil(invoice.issueDate), col2, top + 18)

  label('Clave de acceso', col3, top + 9)
  value(txt(invoice.accessKey), col3, top + 18, 158, 7)

  label('Número de autorización', PAGE_MARGIN + 8, top + 42)
  value(invoice.authorizationNumber || 'Pendiente', PAGE_MARGIN + 8, top + 51)

  label('Fecha de autorización', col2, top + 42)
  value(
    invoice.authorizationDate ? formatDateGuayaquil(invoice.authorizationDate) : 'Pendiente',
    col2,
    top + 51,
  )

  label('Ambiente', col3, top + 42)
  value(invoice.environment === 1 ? 'PRODUCCIÓN' : 'PRUEBAS', col3, top + 51)

  // El aviso de ambiente de pruebas debe ser visible, no un detalle en letra
  // chica: un comprobante de pruebas no sirve para deducir IVA.
  if (invoice.environment !== 1) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#B71C1C')
      .text('SIN VALIDEZ TRIBUTARIA · AMBIENTE DE PRUEBAS', PAGE_MARGIN + 8, top + height - 12)
  }
  return top + height
}

function drawBuyer(doc, order, y) {
  const billing = order.billingData || {}
  doc.font('Helvetica').fontSize(6.5).fillColor(GREY).text('CLIENTE', PAGE_MARGIN, y)
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#000000')
    .text(
      [
        billing.name ? `Razón social: ${billing.name}` : 'Consumidor final',
        billing.id ? `Identificación: ${billing.id}` : null,
        billing.address ? `Dirección: ${billing.address}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      PAGE_MARGIN,
      y + 9,
      { width: 515 },
    )
  return y + 46
}

/**
 * Dibuja el QR con el CLAVEACCESO autorizado.
 * Sin authorizationProof no se puede generar uno valido, y es preferible
 * avisarlo a imprimir un QR que no escanea.
 */
async function drawQr(doc, invoice, y) {
  if (!invoice.authorizationProof) {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#B71C1C')
      .text(
        'Comprobante sin autorización del SRI: este documento no representa una factura válida.',
        PAGE_MARGIN,
        y,
        { width: 515 },
      )
    return y + 20
  }

  const modules = qrMatrix(invoice.authorizationProof)
  if (!modules) return y

  const size = modules.length
  const scale = Math.min(100 / size, 4)
  const box = size * scale
  doc.rect(PAGE_MARGIN, y, box, box).lineWidth(0.4).strokeColor('#DDDDDD').stroke()
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) {
        doc.rect(PAGE_MARGIN + c * scale, y + r * scale, scale, scale).fillColor('#000000').fill()
      }
    }
  }
  return y + box + 6
}

/** Matriz de modulos del QR, como arreglo de filas de booleanos. */
function qrMatrix(value) {
  try {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const { data, size } = qr.modules
    if (!data || !size) return null
    const rows = []
    for (let r = 0; r < size; r += 1) {
      const row = new Array(size)
      for (let c = 0; c < size; c += 1) row[c] = data[r * size + c] === 1
      rows.push(row)
    }
    return rows
  } catch {
    return null
  }
}

/**
 * Genera el PDF de la RIDE. Resuelve con un Buffer.
 */
export async function renderRide({ invoice, order, settings, lines, totals, groups }) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, info: {
    Title: `Comprobante ${invoice.number}`,
    Author: txt(settings.businessName),
    Subject: `Clave de acceso ${txt(invoice.accessKey)}`,
  } })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))

  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  drawHeader(doc, { invoice, settings })
  let y = drawBox(doc, { invoice, settings })
  y += 14
  y = drawBuyer(doc, order, y)

  // Cabecera de la tabla de detalle
  const cols = { desc: PAGE_MARGIN, qty: 360, price: 415, discount: 465, base: PAGE_MARGIN }
  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLUE)
  doc.text('DESCRIPCIÓN', cols.desc, y, { width: 280 })
  doc.text('CANT.', cols.qty, y, { width: 45, align: 'right' })
  doc.text('PRECIO UNIT.', cols.price, y, { width: 50, align: 'right' })
  doc.text('DESC.', cols.discount, y, { width: 40, align: 'right' })
  doc.text('TOTAL SIN IMP.', 505, y, { width: 50, align: 'right' })
  y += 12
  doc.moveTo(PAGE_MARGIN, y - 3).lineTo(555, y - 3).lineWidth(0.5).strokeColor(LINE).stroke()

  for (const line of lines) {
    if (y > 700) {
      doc.addPage()
      y = PAGE_MARGIN
    }
    doc.font('Helvetica').fontSize(7.5).fillColor('#000000')
    doc.text(txt(line.description), cols.desc, y, { width: 285 })
    doc.text(qty(line.quantity), cols.qty, y, { width: 45, align: 'right' })
    doc.text(Number(line.unitPrice).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''), cols.price, y, {
      width: 50,
      align: 'right',
    })
    doc.text(money(line.discount), cols.discount, y, { width: 40, align: 'right' })
    doc.text(money(line.base), 505, y, { width: 50, align: 'right' })
    y += 12
    if (line.taxRate !== undefined) {
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(GREY)
        .text(`IVA ${Number(line.taxRate).toFixed(2)}%`, cols.desc, y, { width: 285 })
      y += 10
    }
  }

  y += 4
  doc.moveTo(PAGE_MARGIN, y).lineTo(555, y).lineWidth(0.5).strokeColor(LINE).stroke()
  y += 8

  const row = (label, value, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8)
      .fillColor(bold ? '#000000' : GREY)
      .text(label, 300, y, { width: 140 })
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8)
      .fillColor('#000000')
      .text(value, 440, y, { width: 115, align: 'right' })
    y += 12
  }

  row('Total sin impuestos', money(totals.totalSinImpuestos))
  for (const g of groups) {
    row(`IVA ${Number(g.rate).toFixed(2)}%`, money(g.value))
  }
  if (Number(totals.totalDiscount) > 0) row('Descuentos', money(totals.totalDiscount))
  row('IMPORTE TOTAL', money(totals.total), true)

  y += 8
  y = await drawQr(doc, invoice, y)

  doc.font('Helvetica').fontSize(6.5).fillColor(GREY)
  if (invoice.authorizationProof) {
    doc.text('Autorizado por el Servicio de Rentas Internas del Ecuador.', PAGE_MARGIN, y + 6, { width: 300 })
    doc.text(
      `Verificación: ${VERIFY_URLS[invoice.environment] || VERIFY_URLS[1]}`,
      PAGE_MARGIN,
      y + 15,
      { width: 300 },
    )
  }
  doc
    .font('Helvetica')
    .fontSize(6)
    .fillColor(GREY)
    .text(
      'Representación Impresa del Documento Electrónico. La información contenida en esta RIDE refleja el estado del comprobante en el momento de su generación.',
      PAGE_MARGIN,
      780,
      { width: 515 },
    )

  doc.end()
  return done
}
