import test from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import {
  buildInvoiceXml,
  buildCreditNoteXml,
  taxFor,
  isValidIvaRate,
  unitPrice,
  sriText,
  sanitizeXmlText,
  round2,
  IVA_CODES,
} from '../src/lib/sri/xml.js'
import { buildLines, buildTaxGroups, computeTotals, assertReconciled } from '../src/lib/sri/totals.js'

const settingsBase = {
  sriIvaRate: 15,
  sriDeliveryTaxable: true,
}

function pedido(items, extra = {}) {
  return {
    deliveryFee: 0,
    total: 0,
    items,
    ...extra,
  }
}

test('las tarifas de IVA son las del catalogo del SRI', () => {
  assert.equal(taxFor(0).percentageCode, '6')
  assert.equal(taxFor(5).percentageCode, '5')
  assert.equal(taxFor(12).percentageCode, '2')
  assert.equal(taxFor(14).percentageCode, '3')
  assert.equal(taxFor(15).percentageCode, '4')
  assert.equal(taxFor(2).percentageCode, '7')
  assert.equal(taxFor(3).percentageCode, '8')
  assert.equal(taxFor(10).percentageCode, '1')
  assert.equal(taxFor(4).percentageCode, '9')
  for (const tasa of Object.keys(IVA_CODES)) {
    assert.equal(IVA_CODES[tasa].code, '2', 'todo el catalogo es IVA')
    assert.equal(taxFor(tasa).rate, Number(tasa))
  }
  // Cada tarifa necesita un codigo distinto: el SRI los usa para identificar el
  // regimen y no admite dos tarifas con el mismo codigoPorcentaje.
  const codigos = Object.values(IVA_CODES).map((t) => t.percentageCode)
  assert.equal(new Set(codigos).size, codigos.length, 'codigoPorcentaje duplicado')
})

test('una tarifa de IVA inexistente lanza en lugar de caer a 15%', () => {
  // El defecto: taxFor(8) devolvia 15% en silencio, y el <tarifa> del XML decia
  // 8.00 con un <codigoPorcentaje> de 15%. El SRI lo rechazaba.
  for (const tasa of [8, 13, 16, 20, 7.5, -1, 100]) {
    assert.equal(isValidIvaRate(tasa), false, `${tasa} no deberia ser valida`)
    assert.throws(() => taxFor(tasa), /catalogo del SRI/)
  }
  assert.throws(() => buildLines(pedido([{ productId: 'p1', name: 'Papa', price: 1, quantity: 1, ivaRate: 8 }]), settingsBase), /no es válida/)
})

test('precioUnitario conserva los decimales que hacen cuadrar la linea', () => {
  // El defecto: toFixed(2) hacia que cantidad x precioUnitario no coincidiera con
  // precioTotalSinImpuesto. Con venta a granel fallaba en ~15% de las lineas.
  const lineas = pedido([
    { productId: 'p1', name: 'Papa', price: 9.25, quantity: 4.5, ivaRate: 15 },
    { productId: 'p2', name: 'Arroz', price: 1.5, quantity: 0.5, ivaRate: 15 },
    { productId: 'p3', name: 'Lenteja', price: 0.99, quantity: 0.333, ivaRate: 15 },
  ])
  const { lines } = buildLines(lineas, settingsBase)
  for (const l of lines) {
    const unit = Number(unitPrice(l.unitPrice))
    const reconstruido = round2(unit * l.quantity)
    assert.ok(
      Math.abs(reconstruido - l.base) <= 0.01,
      `descuadre en ${l.code}: ${unit} x ${l.quantity} = ${reconstruido} vs base ${l.base}`,
    )
  }
})

test('precioUnitario sale con hasta 6 decimales y sin ceros de mas', () => {
  assert.equal(unitPrice(2), '2')
  assert.equal(unitPrice(2.5), '2.5')
  assert.equal(unitPrice(0.5), '0.5')
  // El cero de las unidades no se recorta: ".333333" no es un numero aceptable.
  assert.equal(unitPrice(1 / 3), '0.333333')
  assert.equal(unitPrice(0), '0')
  assert.equal(unitPrice(0.1), '0.1')
  assert.equal(unitPrice(1.23456789), '1.234568')
  assert.match(unitPrice(12.3456789), /^\d+\.\d{1,6}$/)
  for (const v of [0.5, 1 / 3, 0.123456789, 0.000001]) {
    assert.ok(unitPrice(v).startsWith('0.'), `se perdio el cero en ${v}: ${unitPrice(v)}`)
  }
  // Un valor por debajo de la precision admitida colapsa a cero, no a ".000000".
  assert.equal(unitPrice(1e-7), '0')
  // Un valor que redondea a una unidad entera debe perder los decimales, no el cero.
  assert.equal(unitPrice(99.9999999), '100')
})

test('cantidad x precioUnitario cuadra en una barrida amplia de precios', () => {
  const qtys = [0.1, 0.125, 0.25, 0.3, 0.333, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4.5]
  const tarifas = [0, 5, 12, 14, 15]
  let probados = 0
  for (let cents = 5; cents <= 3000; cents += 5) {
    const price = cents / 100
    for (const q of qtys) {
      for (const rate of tarifas) {
        const { lines } = buildLines(
          pedido([{ productId: 'x', name: 'Prod', price, quantity: q, ivaRate: rate }]),
          settingsBase,
        )
        const unit = Number(unitPrice(lines[0].unitPrice))
        assert.ok(
          Math.abs(unit * q - lines[0].base) <= 0.01,
          `descuadre: precio=${price} qty=${q} tasa=${rate} -> ${unit * q} vs ${lines[0].base}`,
        )
        probados += 1
      }
    }
  }
  assert.ok(probados > 40000, `solo se probaron ${probados} combinaciones`)
})

test('el descuento se deriva del precio cobrado, sin aplicarlo dos veces', () => {
  // El defecto original: el servidor cobraba product.price sin aplicar discount y
  // la factura declaraba <descuento>0.00. Al arreglarlo, el descuento se aplicaba
  // sobre el precio ya descontado y el total se iba.
  const listPrice = 20
  const pct = 25
  const unitCharged = 15 // lo que ve y paga el cliente
  const order = pedido([
    {
      productId: 'p1',
      name: 'Papa',
      price: unitCharged,
      quantity: 2,
      ivaRate: 15,
      discountPct: pct,
      listPrice,
    },
  ])
  order.total = round2(unitCharged * 2)
  const { lines, totalDiscount } = buildLines(order, settingsBase)

  assert.equal(lines.length, 1)
  assert.equal(totalDiscount, 10, 'descuento: (20 - 15) x 2 = 10.00')
  assert.equal(lines[0].discount, 10)
  // Cobrado 30.00 -> base 30.00/1.15 = 26.09
  assert.equal(lines[0].base, 26.09)
  assert.equal(lines[0].taxValue, 3.91)

  const totals = computeTotals(lines, totalDiscount)
  assert.equal(totals.total, 30, 'el total debe ser el cobrado, no el doble de descuento')
  assert.equal(totals.totalDiscount, 10)
  assertReconciled(totals, order)
})

test('sin listPrice el descuento se asume ya aplicado en el precio', () => {
  // Un OrderItem antiguo no tiene listPrice: entonces no hay descuento que emitir.
  const order = pedido([{ productId: 'p1', name: 'Papa', price: 15, quantity: 2, ivaRate: 15 }])
  order.total = 30
  const { lines, totalDiscount } = buildLines(order, settingsBase)
  assert.equal(totalDiscount, 0)
  assert.equal(lines[0].discount, 0)
  assertReconciled(computeTotals(lines, totalDiscount), order)
})

test('un producto sin descuento deja el descuento en cero', () => {
  const order = pedido([{ productId: 'p1', name: 'Papa', price: 10, quantity: 3, ivaRate: 15, listPrice: 10 }])
  order.total = 30
  const { lines, totalDiscount } = buildLines(order, settingsBase)
  assert.equal(totalDiscount, 0)
  assert.equal(lines[0].discount, 0)
})

test('el descuento nunca es negativo aunque el precio supere el de lista', () => {
  const order = pedido([
    { productId: 'p1', name: 'Papa', price: 25, quantity: 1, ivaRate: 15, listPrice: 20 },
  ])
  order.total = 25
  const { lines, totalDiscount } = buildLines(order, settingsBase)
  assert.equal(totalDiscount, 0, 'cobrar mas que el precio de lista no es un descuento')
  assert.equal(lines[0].discount, 0)
})

test('un descuento del 100% deja el total en cero sin romper los calculos', () => {
  const order = pedido([
    { productId: 'p1', name: 'Papa', price: 0, quantity: 3, ivaRate: 15, listPrice: 10 },
  ])
  order.total = 0
  const { lines, totalDiscount } = buildLines(order, settingsBase)
  assert.equal(totalDiscount, 30)
  assert.equal(lines[0].base, 0)
  assert.equal(lines[0].taxValue, 0)
  const totals = computeTotals(lines, totalDiscount)
  assert.equal(totals.total, 0)
  assertReconciled(totals, order)
})

test('varias lineas con descuento distintos suman bien', () => {
  const order = pedido([
    { productId: 'a', name: 'A', price: 9, quantity: 2, ivaRate: 15, listPrice: 10 },
    { productId: 'b', name: 'B', price: 50, quantity: 1, ivaRate: 15, listPrice: 100 },
    { productId: 'c', name: 'C', price: 11.5, quantity: 1, ivaRate: 15, listPrice: 11.5 },
  ])
  order.total = 18 + 50 + 11.5
  const { lines, totalDiscount } = buildLines(order, settingsBase)
  assert.equal(totalDiscount, 2 + 50 + 0)
  const totals = computeTotals(lines, totalDiscount)
  assert.equal(totals.total, 79.5)
  assertReconciled(totals, order)
})

test('el servicio de entrega se puede marcar como no gravado', () => {
  const order = pedido([{ productId: 'p1', name: 'Papa', price: 10, quantity: 1, ivaRate: 15 }], {
    deliveryFee: 2,
  })
  order.total = 12
  const gravado = buildLines(order, settingsBase)
  const entregaGravada = gravado.lines.find((l) => l.code === 'SERVICIO-ENTREGA')
  assert.equal(entregaGravada.taxRate, 15)
  assert.equal(entregaGravada.base, 1.74)
  assert.equal(entregaGravada.taxValue, 0.26)

  const exonerado = buildLines(order, { ...settingsBase, sriDeliveryTaxable: false })
  const entregaExonerada = exonerado.lines.find((l) => l.code === 'SERVICIO-ENTREGA')
  assert.equal(entregaExonerada.taxRate, 0)
  assert.equal(entregaExonerada.base, 2)
  assert.equal(entregaExonerada.taxValue, 0)
})

test('las bases se agrupan por tarifa en <totalConImpuestos>', () => {
  const order = pedido([
    { productId: 'a', name: 'General', price: 11.5, quantity: 1, ivaRate: 15 },
    { productId: 'b', name: 'General 2', price: 23, quantity: 1, ivaRate: 15 },
    { productId: 'c', name: 'Cero', price: 10, quantity: 1, ivaRate: 0 },
    { productId: 'd', name: 'Doce', price: 11.2, quantity: 1, ivaRate: 12 },
  ])
  const { lines } = buildLines(order, settingsBase)
  const groups = buildTaxGroups(lines)
  assert.equal(groups.length, 3)

  const g15 = groups.find((g) => g.percentageCode === '4')
  const g0 = groups.find((g) => g.percentageCode === '6')
  const g12 = groups.find((g) => g.percentageCode === '2')
  // 11.50/1.15 = 10.00 y 23.00/1.15 = 20.00
  assert.equal(g15.base, 30)
  assert.equal(g15.value, 4.5)
  assert.equal(g15.rate, 15)
  assert.equal(g0.base, 10)
  assert.equal(g0.value, 0)
  assert.equal(g0.rate, 0)
  assert.equal(g12.base, 10)
  assert.equal(g12.value, 1.2)

  // La suma de los grupos debe igualar los totales del comprobante.
  const totals = computeTotals(lines, 0)
  assert.equal(round2(groups.reduce((a, g) => a + g.base, 0)), totals.totalSinImpuestos)
  assert.equal(round2(groups.reduce((a, g) => a + g.value, 0)), totals.totalImpuestos)
})

test('la reconciliacion aborta si el XML no cuadra con el pedido', () => {
  const order = pedido([{ productId: 'p1', name: 'Papa', price: 10, quantity: 1, ivaRate: 15 }])
  order.total = 99
  const { lines } = buildLines(order, settingsBase)
  const totals = computeTotals(lines, 0)
  assert.throws(() => assertReconciled(totals, order), /no coincide con el total del pedido/)
})

test('la reconciliacion tolera un centavo de diferencia aritmetica', () => {
  // En coma flotante |0.21 - 0.22| da 0.010000000000000009: sin un epsilon, un
  // centimo legitimo de redondeo haria fallar la comprobacion.
  const order = pedido([{ productId: 'p1', name: 'Papa', price: 0.07, quantity: 3, ivaRate: 15 }])
  const { lines, totalDiscount } = buildLines(order, settingsBase)
  const totals = computeTotals(lines, totalDiscount)
  assert.equal(totals.total, 0.21)
  order.total = 0.22
  assert.equal(assertReconciled(totals, order), true)
  order.total = 0.23
  assert.throws(() => assertReconciled(totals, order), /no coincide/)
})

test('un pedido sin lineas no se puede facturar', () => {
  assert.throws(() => buildLines(pedido([]), settingsBase), /No hay lineas/)
  assert.throws(
    () => buildLines(pedido([{ productId: 'p', name: 'X', price: 1, quantity: 0, ivaRate: 15 }]), settingsBase),
    /Cantidad inválida/,
  )
})

test('los textos se sanean a caracteres validos de XML 1.0', () => {
  // Caracteres de control que XML 1.0 no admite ni escapados: si llegaran al
  // nombre de un producto, el XML entero seria ilegible para el SRI.
const NUL = String.fromCharCode(0)
  const BS = String.fromCharCode(8)
  const VT = String.fromCharCode(11)
  const FF = String.fromCharCode(12)
  const US = String.fromCharCode(31)
  const conNul = 'Papa' + NUL + 'belluca'
  const conBs = 'Papa' + BS + 'lenteja'
  const conVt = 'Papa' + VT + 'lenteja'
  const conFf = 'Papa' + FF + 'lenteja'
  const conUs = 'Papa' + US + 'lenteja'
  assert.equal(sanitizeXmlText(conNul), 'Papabelluca')
  assert.equal(sanitizeXmlText(conBs), 'Papalenteja')
  assert.equal(sanitizeXmlText(conVt), 'Papalenteja')
  assert.equal(sanitizeXmlText(conFf), 'Papalenteja')
  assert.equal(sanitizeXmlText(conUs), 'Papalenteja')
  // El tabulador y el salto de linea si son validos y se conservan.
  assert.equal(sanitizeXmlText('Papa\tLenteja'), 'Papa\tLenteja')
  assert.equal(sanitizeXmlText('Papa\nLenteja'), 'Papa\nLenteja')
  // Un nombre con ampersand no debe romper el XML ni producir entidad suelta.
  const xml = buildInvoiceXml(
    basePayload({
      lines: [
        { code: 'c', description: 'Tomate & "papa"', quantity: 1, unitPrice: 1, base: 1, taxRate: 15, taxValue: 0 },
      ],
    }),
  )
  assert.match(xml, /Tomate &amp; &quot;papa&quot;/)
  assert.doesNotMatch(xml, /<descripcion>[^<]*Tomate & /)
})

test('las descripciones se recortan a los limites del SRI', () => {
  const largo = 'A'.repeat(500)
  assert.equal(sriText(largo).length, 300)
  assert.equal(sriText(largo, 25).length, 25)
  assert.equal(sriText('  con   espacios \n duplicados '), 'con espacios duplicados')
})

function basePayload(overrides = {}) {
  return {
    environment: 2,
    ruc: '1791312120001',
    businessName: 'DISTRIKRISS SA',
    accessKey: '0610202601179131212000120030010000000011234567814',
    docCode: '01',
    establishment: '003',
    emissionPoint: '001',
    sequential: 1,
    issueDate: new Date('2026-10-06T15:00:00Z'),
    establishmentAddress: 'Av. Amazonas N34-567',
    specialContributor: '',
    obligadoContabilidad: true,
    buyer: { type: '04', id: '1791312120001', name: 'CLIENTE SA', address: 'Quito' },
    currency: 'USD',
    totalSinImpuestos: 10,
    totalDescuento: 0,
    groups: [{ code: '2', percentageCode: '4', rate: 15, base: 10, value: 1.5 }],
    total: 11.5,
    propina: 0,
    paymentForm: '01',
    lines: [{ code: 'c', description: 'Papa', quantity: 1, unitPrice: 10, base: 10, taxRate: 15, taxValue: 1.5 }],
    ...overrides,
  }
}

test('el XML declara los campos que el SRI exige', () => {
  const xml = buildInvoiceXml(basePayload())
  for (const tag of [
    'ambiente', 'tipoEmision', 'razonSocial', 'ruc', 'claveAcceso', 'codDoc', 'estab', 'ptoEmi',
    'secuencial', 'dirMatriz', 'fechaEmision', 'dirEstablecimiento', 'obligadoContabilidad',
    'tipoIdentificacionComprador', 'razonSocialComprador', 'identificacionComprador',
    'totalSinImpuestos', 'totalDescuento', 'totalConImpuestos', 'totalImpuesto', 'propina',
    'importeTotal', 'moneda', 'pagos', 'formaPago', 'detalle', 'codigoPrincipal', 'descripcion',
    'cantidad', 'precioUnitario', 'precioTotalSinImpuesto', 'impuestos', 'codigoPorcentaje',
    'tarifa', 'baseImponible', 'valor',
  ]) {
    assert.ok(xml.includes(`<${tag}>`), `falta <${tag}>`)
  }
  assert.equal(xml.match(/<claveAcceso>([0-9]{49})<\/claveAcceso>/)[1].length, 49)
  assert.match(xml, /<secuencial>000000001<\/secuencial>/)
  assert.match(xml, /<tipoIdentificacionComprador>04<\/tipoIdentificacionComprador>/)
})

test('consumidor final omite razon social e identificacion del comprador', () => {
  const xml = buildInvoiceXml(basePayload({ buyer: { type: '07', id: '1712345678', name: 'Juan' } }))
  assert.match(xml, /<tipoIdentificacionComprador>07<\/tipoIdentificacionComprador>/)
  assert.doesNotMatch(xml, /razonSocialComprador/)
  assert.doesNotMatch(xml, /identificacionComprador/)
})

test('la fecha de emision del XML va en hora de Guayaquil', () => {
  // Mismo instante que en clave.test.js: en Guayaquil es el dia anterior.
  const xml = buildInvoiceXml(basePayload({ issueDate: new Date('2026-10-07T02:00:00Z') }))
  assert.match(xml, /<fechaEmision>06\/10\/2026<\/fechaEmision>/)
  const xml2 = buildInvoiceXml(basePayload({ issueDate: new Date('2026-10-07T18:00:00Z') }))
  assert.match(xml2, /<fechaEmision>07\/10\/2026<\/fechaEmision>/)
})

test('el XML no se puede construir sin lineas ni sin grupos de impuesto', () => {
  assert.throws(() => buildInvoiceXml(basePayload({ lines: [] })), /al menos una linea/)
  assert.throws(() => buildInvoiceXml(basePayload({ groups: [] })), /al menos un totalImpuesto/)
})

test('la nota de credito referencia el comprobante que anula', () => {
  const xml = buildCreditNoteXml({
    ...basePayload(),
    docCode: '07',
    motivo: 'Pedido cancelado por el cliente',
    referenced: { number: '003-001-000000007', reason: 'Pedido cancelado por el cliente' },
  })
  assert.match(xml, /^<\?xml.*\n<notaCredito id="comprobante" version="1\.1\.0">/)
  assert.match(xml, /<codDoc>07<\/codDoc>/)
  assert.match(xml, /<motivo>Pedido cancelado por el cliente<\/motivo>/)
  assert.match(xml, /<refundID>003-001-000000007<\/refundID>/)
  assert.ok(!xml.includes('<pagos>'), 'una nota de credito no lleva pagos')
})

test('el XML generado es parseable y esta bien formado', () => {
  const xml = buildInvoiceXml(
    basePayload({
      lines: [
        { code: 'p1', description: 'Papa & "especial" <grande>', quantity: 0.5, unitPrice: 1.73913, base: 0.87, taxRate: 15, taxValue: 0.13 },
      ],
    }),
  )
  let errores = []
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level !== 'warning') errores.push(msg)
    },
  }).parseFromString(xml, 'text/xml')
  assert.deepEqual(errores, [], 'el XML debe estar bien formado')
  assert.equal(doc.documentElement.nodeName, 'factura')
  const descripcion = doc.getElementsByTagName('descripcion')[0]
  assert.equal(descripcion.textContent, 'Papa & "especial" <grande>')
})

// ---------------------------------------------------------------------------
// El comprobante fiscal habla en cajas.
//
// La cantidad del XML sigue siendo numérica y en la unidad de medida, porque el
// SRI lo exige. La parte humana ("2 cajas") va en la descripción de la línea.
// ---------------------------------------------------------------------------

test('la descripción de la línea dice cuántas cajas se vendieron', () => {
  const { lines } = buildLines(
    pedido([
      {
        productId: 'p1',
        name: 'Champiñones',
        presentation: 'Caja de plástico',
        unit: 'Gramos',
        price: 0.0025,
        listPrice: 0.0025,
        quantity: 800,
        ivaRate: 15,
        unitQuantity: 400,
        saleUnitName: 'caja',
      },
    ]),
    settingsBase,
  )
  assert.match(lines[0].description, /2 cajas de 400 gramos/, lines[0].description)
  // La cantidad del XML no cambia: sigue siendo el peso, que es lo que el SRI
  // y el stock necesitan.
  assert.equal(lines[0].quantity, 800)
  assert.equal(lines[0].venta.principal, '2 cajas')
  assert.equal(lines[0].venta.detalle, '800 gramos')
})

test('una linea sin empaque no menciona cajas', () => {
  const { lines } = buildLines(
    pedido([
      { productId: 'p1', name: 'Papa', unit: 'Kilo', price: 2.5, listPrice: 2.5, quantity: 3, ivaRate: 15 },
    ]),
    settingsBase,
  )
  assert.equal(lines[0].description, 'Papa')
  assert.equal(lines[0].venta.principal, '3 Kilo')
})

test('la descripción con cajas respeta el limite del SRI', () => {
  const { lines } = buildLines(
    pedido([
      {
        productId: 'p1',
        name: 'x'.repeat(300),
        presentation: 'y'.repeat(200),
        unit: 'Gramos',
        price: 0.0025,
        listPrice: 0.0025,
        quantity: 400,
        ivaRate: 15,
        unitQuantity: 400,
        saleUnitName: 'caja',
      },
    ]),
    settingsBase,
  )
  assert.ok(lines[0].description.length <= 300, `longitud=${lines[0].description.length}`)
})

test('la linea de entrega no inventa cajas', () => {
  const { lines } = buildLines(
    pedido([{ productId: 'p1', name: 'Papa', unit: 'Kilo', price: 2.5, listPrice: 2.5, quantity: 1, ivaRate: 15 }], {
      deliveryFee: 2,
    }),
    settingsBase,
  )
  const entrega = lines.find((l) => l.code === 'SERVICIO-ENTREGA')
  assert.ok(entrega, 'debe existir la linea del envio')
  assert.equal(entrega.venta.principal, '1 entrega')
  assert.equal(entrega.venta.detalle, '', 'el envio no lleva gramos ni cajas')
})
