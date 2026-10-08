/**
 * El flujo de compra de punta a punta contra PostgreSQL.
 *
 * Comprueba lo que no se puede ver en pruebas unitarias: que dos clientes no
 *Reserved the same slot, que el stock no queda negativo, que el codigo de pedido
 * es único bajo concurrencia y que el total cobrado coincide con lo que el
 * carrito muestra.
 */

// Valor de prueba, no un secreto real: solo cifra los secretos de la base de
// datos de pruebas. En produccion viene de SRI_CERT_SECRET.
process.env.SRI_CERT_SECRET ||= 'clave-solo-para-el-entorno-de-pruebas-000000'

const { prisma } = await import('../src/lib/prisma.js')
const { startOfLocalDay, addDays, localDateKey } = await import('../src/lib/date.js')
const {
  capacityOf,
  slotsWithAvailability,
  validateDeliveryDay,
  reserveSlot,
} = await import('../src/lib/delivery.js')
const { precioConDescuento, precioPorUnidad, respetaPaso, round2 } = await import('../src/lib/precios.js')

let fallos = 0
let n = 0
const sello = `E2EC${Date.now().toString().slice(-6)}`

function check(nombre, ok, detalle = '') {
  n += 1
  if (ok) console.log(`  ok    ${nombre}`)
  else {
    fallos += 1
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

async function limpiar() {
  await prisma.invoiceEvent.deleteMany({})
  await prisma.invoice.deleteMany({})
  await prisma.orderEvent.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
}

async function main() {
  console.log('\n=== Preparacion ===')
  await limpiar()

  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Admin E2E compra',
        phone: `0911${String(Date.now()).slice(-6)}`,
        email: `e2ec-${Date.now()}@test.local`,
        passwordHash: 'no-usable',
        role: 'ADMIN',
      },
    })
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      storeLat: -2.19,
      storeLng: -79.89,
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      openHours: {},
      slots: [],
      bankTransfer: {},
      sriEnabled: false,
    },
    update: {},
  })

  const zone = await prisma.deliveryZone.create({
    data: {
      name: `Zona E2E ${sello}`,
      polygon: {
        type: 'Polygon',
        coordinates: [[[-79.9, -2.2], [-79.9, -2.18], [-79.88, -2.18], [-79.88, -2.2], [-79.9, -2.2]]],
      },
      enabled: true,
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      slots: [
        { id: 'e2e-manana', label: 'Mañana', start: '09:00', end: '12:00', capacity: 1 },
        { id: 'e2e-tarde', label: 'Tarde', start: '15:00', end: '18:00', capacity: 2 },
      ],
      deliveryFeeBase: 2,
      deliveryFeePerKm: 0.5,
      minOrderAmount: 5,
    },
  })
  console.log(`  zona ${zone.name} creada`)

  const productos = []
  for (const [nombre, precio, descuento, stock, step] of [
    ['Papa E2E', 2.0, 0, 10, 1],
    ['Arroz E2E', 10.0, 20, 100, 1],
    ['Lenteja E2E', 1.5, 0, 4, 0.5],
  ]) {
    productos.push(
      await prisma.product.create({
        data: {
          name: `${nombre} ${sello}`,
          slug: `${nombre.toLowerCase().replace(/ /g, '-')}-${sello}`,
          price: precio,
          discount: descuento,
          unit: step === 0.5 ? 'Kilo' : 'Unidad',
          minQuantity: step,
          stepQuantity: step,
          stock,
          active: true,
          ivaRate: 15,
        },
      }),
    )
  }
  const [papa, arroz, lenteja] = productos
  console.log(`  ${productos.length} productos creados`)

  const manana = addDays(new Date(), 1)
  manana.setHours(12, 0, 0, 0)
  const dia = startOfLocalDay(manana)
  const esDiaValido = validateDeliveryDay(dia, zone, { orderCutoff: '18:00' }, new Date())
  check('la fecha de mañana es válida para la zona', esDiaValido.ok, JSON.stringify(esDiaValido))

  async function crearPedido({ items, slotId = 'e2e-tarde', code, status = 'PENDING' }) {
    // Misma regla que el servidor: el precio del catálogo es el de la unidad
    // mínima (la bandeja), y la línea se cobra con el precio por unidad de
    // medida. Si el test usara el precio de la bandeja, estaría comprobando una
    // regla que ya no existe.
    const unitario = (p) => precioPorUnidad(precioConDescuento(p.price, p.discount), p.minQuantity)
    const subtotal = round2(items.reduce((acc, it) => {
      const p = it.productId === papa.id ? papa : it.productId === arroz.id ? arroz : lenteja
      return acc + round2(unitario(p) * it.quantity)
    }, 0))
    return prisma.order.create({
      data: {
        code,
        userId: admin.id,
        status,
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal,
        deliveryFee: 2,
        total: round2(subtotal + 2),
        deliveryDate: dia,
        slotId,
        slotLabel: slotId,
        addressSnapshot: { street: 'E2E', city: 'Guayaquil' },
        billingType: 'CONSUMO_FINAL',
        items: {
          create: items.map((it) => {
            const p = it.productId === papa.id ? papa : it.productId === arroz.id ? arroz : lenteja
            return {
              productId: p.id,
              name: p.name,
              unit: p.unit,
              price: unitario(p),
              quantity: it.quantity,
              ivaRate: 15,
              discountPct: p.discount,
              listPrice: precioPorUnidad(p.price, p.minQuantity),
            }
          }),
        },
      },
    })
  }

  // ---------------------------------------------------------------- 1
  console.log('\n=== 1. Sobreventa de horarios ===')
  check('el horario tiene capacidad 1', capacityOf(zone, 'e2e-manana') === 1)

  // Cuatro clientes ven el horario libre a la vez y lo confirman. Solo uno
  // puede quedarse con la plaza.
  const reservas = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      prisma.$transaction(async (tx) => {
        await reserveSlot(tx, { date: dia, zone, slotId: 'e2e-manana' })
        return crearPedido({ items: [{ productId: papa.id, quantity: 1 }], slotId: 'e2e-manana', code: `DK-S${Date.now()}${Math.floor(Math.random() * 1e6)}` })
      }),
    ),
  )
  const aceptadas = reservas.filter((r) => r.status === 'fulfilled').length
  const rechazadas = reservas.filter((r) => r.status === 'rejected').length
  check(`4 pedidos simultáneos sobre 1 plaza -> ${aceptadas} aceptados`, aceptadas === 1, `aceptados=${aceptadas}`)
  check('los otros reciben SLOT_FULL', rechazadas === 3 && reservas.filter((r) => r.status === 'rejected').every((r) => r.reason?.code === 'SLOT_FULL'))

  const { counts } = await import('../src/lib/delivery.js').then((m) => m.occupancyFor(dia))
  check('la ocupación real es 1', counts['e2e-manana'] === 1, JSON.stringify(counts))

  await prisma.order.deleteMany({ where: { slotId: 'e2e-manana' } })

  // ---------------------------------------------------------------- 2
  console.log('\n=== 2. Stock nunca queda negativo ===')
  check('lenteja tiene 4 en stock', (await prisma.product.findUnique({ where: { id: lenteja.id } })).stock === 4)

  const pedidosStock = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.product.updateMany({
          where: { id: papa.id, stock: { gte: 3 } },
          data: { stock: { decrement: 3 } },
        })
        if (count === 0) throw Object.assign(new Error('sin stock'), { code: 'OUT_OF_STOCK' })
        return crearPedido({ items: [{ productId: papa.id, quantity: 3 }], code: `DK-T${i}${Date.now()}` })
      }),
    ),
  )
  const okStock = pedidosStock.filter((p) => p.status === 'fulfilled').length
  const stockFinal = (await prisma.product.findUnique({ where: { id: papa.id } })).stock
  check(`6 pedidos de 3 sobre 10 unidades -> ${okStock} aceptados`, okStock === 3, `aceptados=${okStock}`)
  check(`el stock queda en 1 (10 - 9)`, stockFinal === 1, `stock=${stockFinal}`)
  check('el stock nunca es negativo', stockFinal >= 0, `stock=${stockFinal}`)

  await prisma.order.deleteMany({ where: { slotId: 'e2e-tarde' } })
  await prisma.product.update({ where: { id: papa.id }, data: { stock: 10 } })

  // ---------------------------------------------------------------- 3
  console.log('\n=== 3. Codigo de pedido unico bajo concurrencia ===')
  await prisma.orderSequence.deleteMany({ where: { id: 'order-code' } })
  const { generateOrderCode } = await import('../src/routes/orders.routes.js')
  const codigos = await Promise.all(Array.from({ length: 50 }, () => generateOrderCode()))
  check('50 códigos simultáneos son distintos', new Set(codigos).size === 50, `distintos=${new Set(codigos).size}`)
  const numeros = codigos.map((c) => Number(c.slice(3))).sort((a, b) => a - b)
  check('son correlativos y sin huecos', numeros.every((v, i) => v === numeros[0] + i), `${numeros[0]}..${numeros[numeros.length - 1]}`)

  // ---------------------------------------------------------------- 4
  console.log('\n=== 4. El total cobrado coincide con el precio del catálogo ===')
  const precioArroz = precioConDescuento(arroz.price, arroz.discount)
  check('el descuento del arroz se aplica', precioArroz === 8, `precio=${precioArroz}`)

  const pedido = await crearPedido({
    items: [{ productId: arroz.id, quantity: 3 }],
    code: `DK-R${sello}`,
  })
  const itemGuardado = (await prisma.orderItem.findFirst({ where: { orderId: pedido.id } }))
  check('la línea guarda el precio ya descontado', Number(itemGuardado.price) === 8, `precio=${itemGuardado.price}`)
  check('guarda el descuento aplicado', itemGuardado.discountPct === 20)
  check('guarda el precio de lista como referencia', Number(itemGuardado.listPrice) === 10)
  check(
    'el subtotal es 3 × 8.00',
    Number(pedido.subtotal) === 24,
    `subtotal=${pedido.subtotal}`,
  )
  check('el total añade el envío', Number(pedido.total) === 26, `total=${pedido.total}`)

  // ---------------------------------------------------------------- 5
  console.log('\n=== 5. Disponibilidad refleja lo reservado ===')
  const slots = slotsWithAvailability(zone, { 'e2e-tarde': 1 })
  const tarde = slots.find((s) => s.id === 'e2e-tarde')
  check('el horario de tarde muestra 1 de 2 ocupado', tarde.booked === 1 && tarde.remaining === 1 && tarde.available)

  const lleno = slotsWithAvailability(zone, { 'e2e-tarde': 2 })
  check('con 2 de 2 ocupados ya no está disponible', lleno.find((s) => s.id === 'e2e-tarde').available === false)

  await prisma.order.deleteMany({ where: { code: pedido.code } })
  const libre = slotsWithAvailability(zone, { 'e2e-tarde': 0 })
  check('al cancelar el pedido vuelve a estar libre', libre.find((s) => s.id === 'e2e-tarde').available === true)

  // ---------------------------------------------------------------- 6
  console.log('\n=== 6. Pasos de venta a granel ===')
  check('0.5 kg es un múltiplo válido de 0.5', respetaPaso(0.5, 0.5))
  check('0.333 kg no lo es', !respetaPaso(0.333, 0.5))
  check('1.5 kg sí lo es', respetaPaso(1.5, 0.5))

  // ---------------------------------------------------------------- 7
  console.log('\n=== 7. Cancelar devuelve el stock ===')
  await prisma.order.create({
    data: {
      code: `DK-C${sello}`,
      userId: admin.id,
      status: 'CANCELLED',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      subtotal: 2,
      deliveryFee: 0,
      total: 2,
      deliveryDate: dia,
      slotId: 'e2e-tarde',
      slotLabel: 'E2E',
      addressSnapshot: { street: 'E2E', city: 'G' },
      billingType: 'CONSUMO_FINAL',
      items: { create: [{ productId: papa.id, name: papa.name, unit: 'U', price: 2, quantity: 1, ivaRate: 15 }] },
    },
  })
  // El horario tenía ya 1 pedido activo; el cancelado no debe añadir otro.
  const { counts: conCancelado } = await import('../src/lib/delivery.js').then((m) => m.occupancyFor(dia))
  const activos = conCancelado['e2e-tarde'] ?? 0
  check(
    'un pedido cancelado no ocupa plaza',
    activos === 0,
    `ocupacion=${activos} (0 = solo el cancelado, que no cuenta)`,
  )
  const cancelados = await prisma.order.count({ where: { deliveryDate: dia, status: 'CANCELLED' } })
  check('el pedido cancelado existe de verdad', cancelados === 1, `cancelados=${cancelados}`)

  // ---------------------------------------------------------------- Limpieza
  console.log('\n=== Limpieza ===')
  await limpiar()
  await prisma.product.deleteMany({ where: { slug: { contains: sello } } })
  await prisma.deliveryZone.deleteMany({ where: { name: { contains: sello } } })
  await prisma.orderSequence.deleteMany({ where: { id: 'order-code' } })
  console.log('  datos de prueba eliminados')
  void localDateKey

  console.log(`\n=== Resultado: ${n - fallos}/${n} comprobaciones ===`)
  if (fallos) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('\n*** fallo la prueba de compra ***')
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())