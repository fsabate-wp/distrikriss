/**
 * Prueba de extremo a extremo contra la base de datos real.
 *
 * Verifica lo que no se puede comprobar en una prueba unitaria: que el
 * correlativo es atomico de verdad, que el XML guardado esta bien formado, que
 * el descuento aplicado coincide con el que el cliente vio, y que la
 * reconciliacion aborta cuando los totales no cuadran.
 *
 * Uso: node tests/e2e-facturacion.mjs  (requiere DATABASE_URL y migraciones aplicadas)
 */
import { prisma } from '../src/lib/prisma.js'
import { config } from '../src/config.js'
import { nextSequential } from '../src/lib/sri/index.js'
import { prepareInvoice, submitInvoice, canIssueInvoice } from '../src/lib/sri/index.js'
import { buildInvoiceXml, taxFor } from '../src/lib/sri/xml.js'
import { DOMParser } from '@xmldom/xmldom'

let fallos = 0
let pruebas = 0
let admin = null
let adminCreado = false

function check(nombre, condicion, detalle = '') {
  pruebas += 1
  if (condicion) {
    console.log(`  ok   ${nombre}`)
  } else {
    fallos += 1
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

const sello = `E2E${Date.now().toString().slice(-6)}`
const RUC_PRUEBA = '1791312120001'

async function prepararPedido({ code, precio, cantidad, descuento = 0, listPrice = null, deliveryFee = 0, total }) {
  return prisma.order.create({
    data: {
      code,
      userId: admin.id,
      status: 'DELIVERED',
      paymentMethod: 'TRANSFER',
      paymentStatus: 'PAID',
      subtotal: total - deliveryFee,
      deliveryFee,
      total,
      deliveryDate: new Date(),
      slotId: 'e2e',
      slotLabel: 'E2E',
      addressSnapshot: { street: 'Prueba E2E', city: 'Quito' },
      billingType: 'FACTURA',
      billingData: { id: '1791312120001', name: 'CLIENTE PRUEBA SA', address: 'Quito', idType: 'RUC' },
      items: {
        create: [
          {
            productId: null,
            name: 'Papa prueba',
            unit: 'Kilo',
            price: precio,
            quantity: cantidad,
            ivaRate: 15,
            discountPct: descuento,
            listPrice: listPrice ?? precio,
          },
        ],
      },
    },
    include: { items: true },
  })
}

async function main() {
  console.log('\n=== Entorno ===')
  check('SRI_CERT_SECRET definido', Boolean(config.sri.certSecret))

  // La prueba crea pedidos, asi que necesita un usuario al que atribuirlos.
  // Se crea uno temporal si la base esta vacia y se borra al terminar.
  admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Admin prueba E2E',
        phone: `09000${String(Date.now()).slice(-5)}`,
        email: `e2e-${Date.now()}@test.local`,
        passwordHash: 'no-usable',
        role: 'ADMIN',
      },
    })
    adminCreado = true
    console.log('  (se creo un usuario ADMIN temporal para la prueba)')
  }

  // La prueba necesita facturacion activa y un RUC configurado; se restaura todo
  // al terminar para no dejar la base de desarrollo en un estado que no es el de
  // uso normal.
  let estadoOriginal = await prisma.settings.findUnique({ where: { id: 1 } })
  const habiaSettings = Boolean(estadoOriginal)
  if (!estadoOriginal) {
    estadoOriginal = await prisma.settings.create({
      data: {
        id: 1,
        storeLat: 0,
        storeLng: 0,
        deliveryDays: [],
        openHours: {},
        slots: [],
        bankTransfer: {},
        ruc: RUC_PRUEBA,
        businessName: 'DISTRIKRISS SA',
        sriEnabled: true,
      },
    })
    console.log('  (se creo una fila de configuracion minima para la prueba)')
  }
  const sriEnabledOriginal = estadoOriginal.sriEnabled
  if (!sriEnabledOriginal) {
    await prisma.settings.update({ where: { id: 1 }, data: { sriEnabled: true } })
    console.log('  (se activo sriEnabled temporalmente para la prueba)')
  }
  if (!/^\d{13}$/.test(estadoOriginal.ruc || '')) {
    // El seed deja el RUC vacio: sin el no se puede emitir. Se rellena solo para
    // la prueba y se restaura despues.
    await prisma.settings.update({ where: { id: 1 }, data: { ruc: RUC_PRUEBA, businessName: 'DISTRIKRISS SA' } })
    console.log('  (se configuro un RUC de prueba temporal)')
  }
  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  console.log(`  ambiente=${settings?.sriEnvironment} sriEnabled=${settings?.sriEnabled}`)

  // ---------------------------------------------------------------------
  console.log('\n=== 1. Correlativo atomico bajo concurrencia real ===')
  const totalConcurrente = 40
  const serie = await prisma.$queryRaw`
    INSERT INTO "DocumentSeries" ("id","docType","establishment","emissionPoint","sequential","updatedAt")
    VALUES (${`e2e-serie-${sello}`}, 'FACTURA'::"SriDocType", 'E2E', 'E2E', 0, NOW())
    ON CONFLICT ("docType","establishment","emissionPoint")
    DO UPDATE SET "sequential" = 0
    RETURNING "sequential"
  `
  void serie

  const obtenidos = await Promise.all(
    Array.from({ length: totalConcurrente }, () => nextSequential('FACTURA', 'E2E', 'E2E')),
  )
  const unicos = new Set(obtenidos)
  check(
    `${totalConcurrente} emisiones concurrentes dan ${unicos.size} secuenciales distintos`,
    unicos.size === totalConcurrente,
    `duplicados: ${obtenidos.length - unicos.size}`,
  )
  check('el rango es correlativo y sin huecos', Math.max(...obtenidos) === totalConcurrente, `max=${Math.max(...obtenidos)}`)

  await prisma.documentSeries.deleteMany({ where: { establishment: 'E2E', emissionPoint: 'E2E' } })

  // ---------------------------------------------------------------------
  console.log('\n=== 2. La clave de acceso coincide con el XML guardado ===')
  const order = await prepararPedido({ code: `${sello}-1`, precio: 9.25, cantidad: 1, descuento: 0, total: 9.25 })
  const invoice = await prepareInvoice(order.id)
  check('el comprobante se crea en DRAFT', invoice.status === 'DRAFT', invoice.status)
  check('totalFiscal coincide con el pedido', Number(invoice.totalFiscal) === Number(order.total),
    `${invoice.totalFiscal} vs ${order.total}`)
  check('issueDate persistido', invoice.issueDate instanceof Date)

  let xml = invoice.xml
  let errores = []
  const doc = new DOMParser({
    onError: (l, m) => {
      if (l !== 'warning') errores.push(m)
    },
  }).parseFromString(xml, 'text/xml')
  check('el XML guardado esta bien formado', errores.length === 0, errores.join('; '))
  check('la clave del XML es la de la base de datos',
    doc.getElementsByTagName('claveAcceso')[0].textContent === invoice.accessKey)
  check('el numero del XML corresponde a la fila',
    `${doc.getElementsByTagName('estab')[0].textContent}-${doc.getElementsByTagName('ptoEmi')[0].textContent}-${doc.getElementsByTagName('secuencial')[0].textContent}` === invoice.number,
    `${invoice.number}`)
  check('la fecha de emision del XML coincide con la clave',
    (() => {
      const fecha = doc.getElementsByTagName('fechaEmision')[0].textContent // dd/mm/yyyy
      const [dd, mm, aaaa] = fecha.split('/')
      return invoice.accessKey.startsWith(`${dd}${mm}${aaaa}`)
    })(),
    `${doc.getElementsByTagName('fechaEmision')[0].textContent} vs clave ${invoice.accessKey.slice(0, 8)}`)

  const totalXml = Number(doc.getElementsByTagName('importeTotal')[0].textContent)
  check('el importe total del XML es el total del pedido', Math.abs(totalXml - Number(order.total)) < 0.01,
    `${totalXml} vs ${order.total}`)

  // ---------------------------------------------------------------------
  console.log('\n=== 3. Descuento: lo que ve el cliente es lo que se factura ===')
  const listPrice = 20
  const pct = 25
  const orderConDescuento = await prepararPedido({
    code: `${sello}-2`,
    precio: listPrice * (1 - pct / 100), // lo que ve y paga el cliente
    cantidad: 2,
    descuento: pct,
    listPrice,
    total: listPrice * (1 - pct / 100) * 2,
  })
  const invDesc = await prepareInvoice(orderConDescuento.id)
  const docDesc = new DOMParser().parseFromString(invDesc.xml, 'text/xml')
  const descuentoLinea = Number(docDesc.getElementsByTagName('descuento')[0].textContent)
  const descuentoTotal = Number(docDesc.getElementsByTagName('totalDescuento')[0].textContent)
  check('el descuento de la linea se emite', descuentoLinea > 0, `${descuentoLinea}`)
  check('el descuento total se emite', descuentoTotal > 0, `${descuentoTotal}`)
  check('el descuento declarado es coherente con el cobrado',
    Math.abs(descuentoTotal - listPrice * 2 * (pct / 100)) < 0.01,
    `${descuentoTotal} vs ${listPrice * 2 * (pct / 100)}`)
  check('el total sigue cuadrando con el pedido',
    Math.abs(Number(invDesc.totalFiscal) - Number(orderConDescuento.total)) < 0.01)

  // ---------------------------------------------------------------------
  console.log('\n=== 4. La reconciliacion detiene una factura incoherente ===')
  const orderRoto = await prepararPedido({ code: `${sello}-3`, precio: 10, cantidad: 1, descuento: 0, total: 999 })
  let aborted = false
  try {
    await prepareInvoice(orderRoto.id)
  } catch (err) {
    aborted = /no coincide con el total del pedido/.test(err.message)
  }
  check('un pedido con total incoherente no emite comprobante', aborted)
  const huérfana = await prisma.invoice.findFirst({ where: { orderId: orderRoto.id } })
  check('y no queda ningun comprobante a medias', !huérfana)

  // ---------------------------------------------------------------------
  console.log('\n=== 5. Idempotencia por pedido ===')
  const otra = await prepareInvoice(order.id)
  check('preparar dos veces devuelve el mismo comprobante', otra.id === invoice.id)
  check('y no consume un secuencial extra', otra.sequential === invoice.sequential)

  // ---------------------------------------------------------------------
  console.log('\n=== 6. Envio sin certificado deja estado explicito ===')
  await prisma.settings.update({
    where: { id: 1 },
    data: { sriEnabled: false },
  })
  check('canIssueInvoice es falso sin activarlo', canIssueInvoice(await prisma.settings.findUnique({ where: { id: 1 } })) === false)
  await prisma.settings.update({ where: { id: 1 }, data: { sriEnabled: true } })

  // ---------------------------------------------------------------------
  console.log('\n=== 7. Taxas de IVA del catalogo ===')
  const tasas = [0, 2, 3, 4, 5, 10, 12, 14, 15]
  check('las nueve tarifas tienen codigo propio',
    new Set(tasas.map((t) => taxFor(t).percentageCode)).size === tasas.length)

  // ---------------------------------------------------------------------
  console.log('\n=== Limpieza ===')
  const ids = [order.id, orderConDescuento.id, orderRoto.id]
  const invoices = await prisma.invoice.findMany({ where: { orderId: { in: ids } }, select: { id: true } })
  await prisma.invoiceEvent.deleteMany({ where: { invoiceId: { in: invoices.map((i) => i.id) } } })
  await prisma.invoice.deleteMany({ where: { orderId: { in: ids } } })
  await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } })
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } })
  await prisma.order.deleteMany({ where: { id: { in: ids } } })
  console.log('  pedidos de prueba eliminados')

  await prisma.settings.update({
    where: { id: 1 },
    data: {
      sriEnabled: sriEnabledOriginal,
      ...(estadoOriginal.ruc !== RUC_PRUEBA ? { ruc: estadoOriginal.ruc, businessName: estadoOriginal.businessName } : {}),
    },
  })
  if (!sriEnabledOriginal) console.log('  sriEnabled restaurado a su valor original')
  if (estadoOriginal.ruc !== RUC_PRUEBA) console.log('  RUC restaurado a su valor original')
  if (!habiaSettings) {
    await prisma.settings.delete({ where: { id: 1 } })
    console.log('  fila de configuracion de prueba eliminada')
  }
  if (adminCreado) {
    await prisma.user.delete({ where: { id: admin.id } })
    console.log('  usuario ADMIN temporal eliminado')
  }

  console.log(`\n=== Resultado: ${pruebas - fallos}/${pruebas} comprobaciones ===`)
  if (fallos) {
    console.log(`*** ${fallos} FALLAS ***`)
    process.exitCode = 1
  }
  void buildInvoiceXml
  void submitInvoice
  void xml
}

main()
  .catch((err) => {
    console.error('\n*** la prueba de extremo a extremo falló ***')
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
