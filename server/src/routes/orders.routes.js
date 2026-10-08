import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import {
  getSettings,
  getZoneById,
  deliveryCheck,
  validateDeliveryDay,
  slotAvailabilityFor,
  parseLocalDate,
  reserveSlot,
} from '../lib/delivery.js'
import { sendToAdmins, sendToUser } from '../lib/push.js'
import { sendWhatsApp, getStorePhone } from '../lib/whatsapp.js'
import { validateIdentifier } from '../lib/sri/ruc.js'
import { isValidIvaRate } from '../lib/sri/xml.js'
import { renderRide } from '../lib/sri/ride.js'
import { buildLines, buildTaxGroups, computeTotals } from '../lib/sri/totals.js'
import { INVOICE_STATUS_LABELS, invoiceMessageFor } from '../lib/sri/labels.js'
import { limits } from '../middleware/auth.js'

import * as precios from '../lib/precios.js'

const router = Router()
router.use(requireAuth)

// La regla de precio vive en lib/precios.js y está replicada en
// apps/app/src/utils/format.js. tests/precios.test.js comprueba que ambas den
// el mismo resultado: si divergen, el carrito muestra una cifra y el pedido cobra
// otra.
const {
  round2,
  precioConDescuento,
  precioPorUnidad,
  nombreUnidadVenta,
  descuentoValido,
  respetaPaso,
  MAX_CANTIDAD_LINEA,
  MAX_LINEAS_PEDIDO,
} = precios

const inlineAddressSchema = z.object({
  label: z.string().max(80).optional().or(z.literal('')),
  street: z.string().min(1).max(200),
  number: z.string().max(30).optional().or(z.literal('')),
  reference: z.string().max(200).optional().or(z.literal('')),
  city: z.string().min(2).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

const billingSchema = z
  .object({
    type: z.enum(['CONSUMO_FINAL', 'FACTURA']).optional().default('CONSUMO_FINAL'),
    idType: z.enum(['RUC', 'CEDULA']).optional().default('RUC'),
    id: z.string().max(13).optional().or(z.literal('')),
    name: z.string().max(160).optional().or(z.literal('')),
    address: z.string().max(200).optional().or(z.literal('')),
    email: z.string().max(120).optional().or(z.literal('')),
  })
  .refine(
    (b) =>
      b.type !== 'FACTURA' ||
      (b.id && validateIdentifier(b.id, b.idType || 'RUC')),
    { message: 'El RUC o cédula ingresado no es válido', path: ['id'] },
  )
  .refine((b) => b.type !== 'FACTURA' || (b.name && b.name.trim().length >= 2), {
    message: 'Ingresa la razón social o nombre del comprador',
    path: ['name'],
  })

const orderSchema = z
  .object({
    addressId: z.string().optional().nullable(),
    address: inlineAddressSchema.optional(),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    slotId: z.string().min(1),
    paymentMethod: z.enum(['TRANSFER', 'COD']),
    items: z
      .array(
        z.object({
          productId: z.string(),
          // La cantidad es un número: un cliente puede mandar "2; DROP TABLE".
          quantity: z.coerce
            .number()
            .finite('Cantidad inválida')
            .positive('La cantidad debe ser mayor que cero')
            .max(MAX_CANTIDAD_LINEA, `Máximo ${MAX_CANTIDAD_LINEA} por línea`),
        }),
      )
      .min(1, 'El pedido no puede estar vacío')
      .max(MAX_LINEAS_PEDIDO, `Máximo ${MAX_LINEAS_PEDIDO} productos por pedido`),
    notes: z.string().max(500).optional().or(z.literal('')),
    billing: billingSchema.optional(),
  })
  .refine((d) => d.addressId || d.address, { message: 'Se requiere una dirección' })

const statusNotes = {
  PENDING: 'Pedido recibido',
  CONFIRMED: 'Pedido confirmado',
  PREPARING: 'En preparación',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Pedido cancelado',
}

/**
 * Correlativo de pedido.
 *
 * Antes se usaba count() + 1, que es un read-modify-write: dos pedidos
 * simultáneos obtenían el mismo código y, como `code` es UNIQUE, el segundo
 * moría con un error 500. Además el número se reutilizaba tras cancelar un
 * pedido, lo que rompe cualquier referencia externa a "DK-0042".
 *
 * Se mantiene un contador en una tabla aparte, incrementado de forma atómica.
 * Los huecos son aceptables e inevitables si una transacción se revierte: es
 * preferible un número perdido a un código duplicado.
 */
const ORDER_CODE_SEQ = 'order-code'

export async function generateOrderCode() {
  const rows = await prisma.$queryRaw`
    INSERT INTO "OrderSequence" ("id", "value", "updatedAt")
    VALUES (${ORDER_CODE_SEQ}, 1, NOW())
    ON CONFLICT ("id")
    DO UPDATE SET "value" = "OrderSequence"."value" + 1, "updatedAt" = NOW()
    RETURNING "value"
  `
  const n = Number(rows[0].value)
  // padStart(4) se queda corto a partir de 10000 pedidos; el número crece sin
  // truncar y el código sigue siendo único.
  return `DK-${String(n).padStart(4, '0')}`
}

/**
 * Siembra el contador por encima del código más alto ya emitido.
 *
 * La migración ya lo hace, pero si alguien restaura una copia de la base de
 * datos o inserta pedidos a mano, esto evita que el siguiente código repita uno
 * existente. Solo sube el contador: nunca lo baja.
 */
export async function ensureOrderCodeSequence() {
  const ultimo = await prisma.order.findFirst({
    where: { code: { startsWith: 'DK-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  })
  const max = ultimo ? Number(String(ultimo.code).slice(3)) || 0 : 0
  await prisma.$executeRaw`
    INSERT INTO "OrderSequence" ("id", "value", "updatedAt")
    VALUES (${ORDER_CODE_SEQ}, ${max}, NOW())
    ON CONFLICT ("id")
    DO UPDATE SET "value" = GREATEST("OrderSequence"."value", EXCLUDED."value"), "updatedAt" = NOW()
  `
}

function withTotals(order) {
  const toNumber = (v) => Number(v)
  return {
    ...order,
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.deliveryFee),
    total: toNumber(order.total),
    // unitQuantity y saleUnitName llegan tal cual: el cliente los usa para leer
    // "2 cajas" sin volver a consultar el catálogo, que ya pudo haber cambiado.
    items: order.items?.map((i) => ({
      ...i,
      price: toNumber(i.price),
      quantity: toNumber(i.quantity),
      ivaRate: i.ivaRate != null ? toNumber(i.ivaRate) : null,
      unitQuantity: i.unitQuantity != null ? toNumber(i.unitQuantity) : null,
    })),
  }
}

const orderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'desc' } },
  address: true,
  invoice: true,
}

router.post('/', limits.checkout, async (req, res, next) => {
  try {
    const data = orderSchema.parse(req.body)
    const settings = await getSettings()
    if (settings.storeOpen === false) {
      return res.status(400).json({ error: 'La tienda está temporalmente cerrada', code: 'STORE_CLOSED' })
    }

    let address
    if (data.addressId) {
      address = await prisma.address.findFirst({
        where: { id: data.addressId, userId: req.user.id },
      })
      if (!address) return res.status(404).json({ error: 'Dirección no encontrada' })
    } else {
      address = {
        ...data.address,
        label: data.address.label || data.address.street || 'Dirección',
        street: data.address.street || 'Dirección',
      }
    }

    const check = await deliveryCheck(address.lat, address.lng)
    if (!check.withinZone) {
      return res.status(400).json({
        error: 'La dirección está fuera de la zona de entrega',
        code: 'OUT_OF_ZONE',
      })
    }
    const zone = await getZoneById(check.zoneId)
    if (!zone) {
      return res.status(400).json({ error: 'Zona de entrega no disponible', code: 'NO_ZONE' })
    }

    const deliveryDate = parseLocalDate(data.deliveryDate)
    const dayCheck = validateDeliveryDay(deliveryDate, zone, settings)
    if (!dayCheck.ok) {
      return res.status(400).json({ error: dayCheck.message, code: dayCheck.code })
    }

    // Comprobación informativa: el horario tiene que existir y tener hueco ahora.
    // La reserva que decide es la que hace reserveSlot dentro de la transaccion,
    // porque entre este punto y el guardado puede entrar otro pedido.
    const slots = await slotAvailabilityFor(deliveryDate, zone)
    const slot = slots.find((s) => s.id === data.slotId)
    if (!slot) {
      return res.status(400).json({
        error: 'Ese horario no existe en tu zona de entrega',
        code: 'INVALID_SLOT',
      })
    }
    if (!slot.available) {
      return res.status(409).json({
        error: 'Ese horario está lleno. Elige otro.',
        code: 'SLOT_FULL',
      })
    }

    const productIds = [...new Set(data.items.map((i) => i.productId))]
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    /**
     * Un mismo producto puede venir en varias lineas. Se suman antes de validar
     * stock y cantidad: si no, el cliente podria pedir 3 + 3 kg de un producto con
     * 5 en stock, pasar la comprobacion linea por linea (3 <= 5) y llevarselos.
     */
    const cantidadPorProducto = new Map()
    for (const item of data.items) {
      cantidadPorProducto.set(item.productId, (cantidadPorProducto.get(item.productId) || 0) + item.quantity)
    }

    const globalIva = Number(settings.sriIvaRate) || 15
    if (!isValidIvaRate(globalIva)) {
      // Si la tarifa global no existe en el catálogo del SRI, cualquier factura
      // saldría con un <tarifa> que el SRI rechaza. Mejor bloquear el pedido.
      throw Object.assign(
        new Error(
          `La configuración del IVA (${globalIva}%) no es válida. Corrígela en el panel: ` +
            'sin eso no se pueden emitir facturas.',
        ),
        { status: 500 },
      )
    }

    // El stock se valida una vez por producto, con la cantidad total.
    for (const [productId, cantidad] of cantidadPorProducto) {
      const product = productMap.get(productId)
      if (!product) throw Object.assign(new Error('Producto no disponible'), { status: 400 })
      if (product.stock >= 0 && product.stock < cantidad) {
        throw Object.assign(
          new Error(
            cantidadPorProducto.size > 1
              ? `Stock insuficiente para "${product.name}": quedan ${product.stock} ${product.unit}`
              : `Stock insuficiente para "${product.name}"`,
          ),
          { status: 400, code: 'OUT_OF_STOCK' },
        )
      }
    }

    let subtotal = 0
    const items = []
    for (const item of data.items) {
      const product = productMap.get(item.productId)
      if (!product) throw Object.assign(new Error('Producto no disponible'), { status: 400 })

      const minQ = product.minQuantity != null ? Number(product.minQuantity) : 1
      if (item.quantity < minQ - 1e-9) {
        throw Object.assign(
          new Error(`La cantidad mínima para "${product.name}" es ${minQ} ${product.unit}`),
          { status: 400, code: 'BELOW_MINIMUM' },
        )
      }

      // stepQuantity nunca se validaba en el servidor: el cliente sugiere el paso
      // con sus botones, pero una peticion propia podia pedir 0.333 kg cuando el
      // paso es de 0.5 kg, con precio fraccionado.
      const step = product.stepQuantity != null ? Number(product.stepQuantity) : 1
      if (step > 0 && !respetaPaso(item.quantity, step)) {
        const pasos = Math.max(1, Math.round(item.quantity / step))
        throw Object.assign(
          new Error(
            `"${product.name}" se vende en pasos de ${step} ${product.unit}. ` +
              `Usa un múltiplo (por ejemplo ${pasos} × ${step}).`,
          ),
          { status: 400, code: 'INVALID_STEP' },
        )
      }

      // El precio del catálogo es IVA incluido y es el de la unidad mínima (la
      // bandeja). El descuento se aplica aquí, en el servidor: antes el carrito
      // mostraba el precio descontado y el pedido cobraba el precio de lista, y
      // la factura declaraba descuento cero.
      const pct = descuentoValido(product.discount)
      const precioVenta = precioConDescuento(product.price, pct)
      // Y se convierte a precio por unidad de medida, que es lo que se cobra al
      // multiplicar por la cantidad en gramos. Sin esta división, una bandeja de
      // 400 g a $1 salía a $400.
      const unitPrice = precioPorUnidad(precioVenta, product.minQuantity)
      const listUnit = precioPorUnidad(product.price, product.minQuantity)
      subtotal = round2(subtotal + round2(unitPrice * item.quantity))

      const ivaRate = product.ivaRate ?? globalIva
      items.push({
        productId: product.id,
        name: product.name,
        sku: product.sku || null,
        unit: product.unit,
        presentation: product.presentation || null,
        // price guarda el precio por unidad ya descontado: es lo que se cobró.
        price: unitPrice,
        quantity: item.quantity,
        ivaRate,
        // Y el descuento, para que la factura pueda emitir <descuento>.
        discountPct: pct,
        listPrice: listUnit,
        sriCode: product.sriCode || null,
        // Tamaño del empaque y cómo lo llama el tendero. Se congelan aquí: el
        // comprobante tiene que decir "caja de 400 g" aunque después el tendero
        // agrande la caja a 500 g.
        unitQuantity: minQ > 1 ? minQ : null,
        saleUnitName: minQ > 1 ? nombreUnidadVenta(product.presentation, product.unit) : null,
      })
    }

    // El pedido mínimo se mide sobre el subtotal de productos: el envío es un
    // coste del pedido, no merchandise. El cliente lo ve anunciado así en el
    // panel de zonas, y aquí el mensaje lo aclara para evitar sorpresas.
    const minOrder = Number(check.minOrderAmount)
    if (minOrder > 0 && subtotal < minOrder) {
      const falta = round2(minOrder - subtotal)
      return res.status(400).json({
        error:
          `El pedido mínimo para tu zona es $${minOrder.toFixed(2)} en productos. ` +
          `Te faltan $${falta.toFixed(2)}. El envío no cuenta para el mínimo.`,
        code: 'MIN_ORDER',
        minOrderAmount: round2(minOrder),
        subtotal,
        missing: falta,
      })
    }

const deliveryFee = round2(check.deliveryFee)
    const total = round2(subtotal + deliveryFee)
    const code = await generateOrderCode()

    const billing = data.billing || {}
    const billingType = billing.type === 'FACTURA' ? 'FACTURA' : 'CONSUMO_FINAL'
    const billingData =
      billingType === 'FACTURA'
        ? {
            idType: billing.idType || 'RUC',
            id: billing.id,
            name: billing.name,
            address: billing.address || '',
            email: billing.email || '',
          }
        : null

    const addressSnapshot = {
      label: address.label,
      street: address.street,
      number: address.number,
      reference: address.reference,
      city: address.city,
      lat: address.lat,
      lng: address.lng,
    }

    const order = await prisma.$transaction(async (tx) => {
      // La disponibilidad que se comprobó antes es solo informativa: entre la
      // petición del cliente y este guardado puede entrar otro pedido. Aquí se
      // bloquean las filas y se vuelve a contar, y solo uno gana el horario.
      await reserveSlot(tx, { date: deliveryDate, zone, slotId: slot.id })

      const created = await tx.order.create({
        data: {
          code,
          userId: req.user.id,
          status: 'PENDING',
          paymentMethod: data.paymentMethod,
          // Contra reembolso se cobra al entregar; por transferencia, al confirmar.
          paymentStatus: 'PENDING',
          subtotal,
          deliveryFee,
          total,
          deliveryDate,
          slotId: slot.id,
          slotLabel: slot.label,
          addressId: data.addressId || null,
          addressSnapshot,
          notes: data.notes || null,
          billingType,
          billingData,
          items: { create: items },
          events: { create: { status: 'PENDING', note: statusNotes.PENDING } },
        },
        include: orderInclude,
      })

      /**
       * Stock con decremento condicional. La comprobacion previa es
       * informativa; aquí el `stock >= cantidad` en el propio UPDATE es lo que
       * evita el stock negativo si dos pedidos compiten por las últimas unidades.
       */
      for (const [productId, cantidad] of cantidadPorProducto) {
        const product = productMap.get(productId)
        if (product.stock >= 0) {
          const { count } = await tx.product.updateMany({
            where: { id: productId, stock: { gte: cantidad } },
            data: { stock: { decrement: cantidad } },
          })
          if (count === 0) {
            throw Object.assign(
              new Error(`Se agotó el stock de "${product.name}" mientras confirmabas el pedido`),
              { status: 409, code: 'OUT_OF_STOCK' },
            )
          }
        }
      }
      return created
    })

    res.status(201).json({ order: withTotals(order) })

    // La factura NO se emite aquí. Antes se generaba en el momento de crear el
    // pedido, documentando una operación que aún no se había cobrado ni
    // entregado. Ahora se emite cuando el pago se confirma (transferencia) o
    // cuando el pedido se entrega (contra reembolso).
    // Si el negocio factura por adelantado, avisar al admin en cuanto se confirme
    // el pago desde el panel: /admin/pedidos/{id}.

    await sendToAdmins({
      title: 'Nuevo pedido',
      body: `${order.code} · $${order.total.toFixed(2)} · ${order.slotLabel}`,
      url: `/admin/pedidos/${order.id}`,
      tag: 'new-order',
    })

    const storePhone = await getStorePhone()
    if (storePhone) {
      await sendWhatsApp({
        to: storePhone,
        text: `Nuevo pedido ${order.code}\nTotal: $${order.total.toFixed(2)}\nEntrega: ${order.slotLabel}\nCliente: ${req.user?.name || ''} · ${req.user?.phone || ''}`,
      })
    }
  } catch (err) {
    next(err)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: orderInclude,
    })
    res.json({ orders: orders.map(withTotals) })
  } catch (err) {
    next(err)
  }
})

/**
 * RIDE del comprobante del cliente.
 *
 * En Ecuador la RIDE es lo que permite deducir IVA: sin ella, una factura
 * autorizada no sirve para nada al comprador. El cliente no tenía forma de
 * obtenerla, solo el administrador.
 *
 * El acceso se filtra por `userId`: cada quien descarga la suya.
 */
router.get('/:id/ride', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { orderId: req.params.id },
      include: { order: { include: { items: true } } },
    })
    if (!invoice || invoice.order.userId !== req.user.id) {
      return res.status(404).json({ error: 'Comprobante no encontrado' })
    }
    if (invoice.status !== 'AUTHORIZED') {
      return res.status(409).json({
        error: 'Tu comprobante todavía no ha sido autorizado por el SRI',
        status: invoice.status,
      })
    }

    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!settings) return res.status(500).json({ error: 'Configuración no encontrada' })

    const { lines, totalDiscount } = buildLines(invoice.order, settings)
    const groups = buildTaxGroups(lines)
    const totals = computeTotals(lines, totalDiscount)
    const pdf = await renderRide({ invoice, order: invoice.order, settings, lines, groups, totals })

    const etiqueta = invoice.docType === 'NOTA_CREDITO' ? 'nota-credito' : 'factura'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${etiqueta}-${invoice.number}.pdf"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(pdf)
  } catch (err) {
    next(err)
  }
})

/**
 * Datos del comprobante para mostrarlo en la web sin descargarlo.
 * No incluye el XML: el cliente ve su número, su clave y su estado.
 */
router.get('/:id/invoice', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { orderId: req.params.id },
    })
    if (!invoice || invoice.orderId !== req.params.id) {
      return res.status(404).json({ error: 'Comprobante no encontrado' })
    }
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!order) return res.status(404).json({ error: 'Comprobante no encontrado' })

    res.json({
      invoice: {
        number: invoice.number,
        accessKey: invoice.accessKey,
        status: invoice.status,
        statusLabel: INVOICE_STATUS_LABELS[invoice.status] || invoice.status,
        docType: invoice.docType,
        authorized: invoice.status === 'AUTHORIZED',
        authorizationNumber: invoice.authorizationNumber,
        authorizationDate: invoice.authorizationDate,
        total: Number(invoice.totalFiscal),
        environment: invoice.environment,
        message: invoiceMessageFor(invoice),
        // El detalle técnico solo se devuelve al depurar; el cliente recibe el
        // mensaje en lenguaje llano de arriba.
        responseMessage: null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * "Pedir lo de siempre".
 *
 * Devuelve los productos del último pedido entregado o confirmado, con la
 * cantidad pedida. El cliente que compra cada semana no debería tener que
 * reconstruir su pedido a mano cada vez: es el camino más corto a repetir
 * compra, y repetir compra es lo que sostiene un negocio de alimentación.
 *
 * Se omiten los productos que ya no existen o están inactivos, para que el
 * cliente no vea algo que no puede añadir.
 */
router.get('/repeat/last', async (req, res, next) => {
  try {
    const ultimo = await prisma.order.findFirst({
      where: {
        userId: req.user.id,
        status: { in: ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })
    if (!ultimo) return res.json({ available: false })

    const ids = [...new Set(ultimo.items.map((i) => i.productId).filter(Boolean))]
    const productos = ids.length
      ? await prisma.product.findMany({ where: { id: { in: ids }, active: true } })
      : []
    const porId = new Map(productos.map((p) => [p.id, p]))

    const disponibles = []
    const caidos = []
    for (const item of ultimo.items) {
      const p = item.productId ? porId.get(item.productId) : null
      if (!p) {
        caidos.push({ name: item.name })
        continue
      }
      const stock = Number(p.stock)
      const agotado = stock >= 0 && stock <= 0
      disponibles.push({
        productId: p.id,
        name: p.name,
        slug: p.slug,
        unit: p.unit,
        minQuantity: Number(p.minQuantity) || 1,
        stepQuantity: Number(p.stepQuantity) || 1,
        // Se repite lo que pidió, no el precio que tenía: el precio vigente
        // siempre lo pone el servidor, pero aquí conviene avisar si cambió.
        lastPrice: Number(item.price),
        currentPrice: Number(p.price),
        discount: Number(p.discount) || 0,
        // Los Decimales de Prisma viajan como cadena por JSON. El cliente los
        // usa para sumar cantidades, así que se normalizan a número aquí.
        quantity: Number(item.quantity),
        available: !agotado,
        stock: stock,
        stockLimit: stock >= 0 ? Math.max(0, stock) : null,
      })
    }

    res.json({
      available: disponibles.length > 0,
      orderCode: ultimo.code,
      orderDate: ultimo.createdAt,
      items: disponibles,
      missing: caidos,
      // Si algún precio cambió desde el pedido anterior, se avisa en lugar de
      // cobrar de más o de menos sin que nadie lo note.
      priceChanged: disponibles.some((i) => i.lastPrice !== i.currentPrice),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: orderInclude,
    })
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json({ order: withTotals(order) })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: true, invoice: true },
    })
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      return res.status(400).json({ error: 'El pedido ya no puede cancelarse' })
    }
    // Si el SRI ya autorizó la factura, el cliente no puede deshacerla: hace
    // falta una nota de crédito, y eso es una decisión del negocio, no del cliente.
    if (order.invoice && ['AUTHORIZED', 'CREDITED'].includes(order.invoice.status)) {
      return res.status(400).json({
        error:
          'Este pedido ya tiene una factura autorizada por el SRI. ' +
          'Contacta al negocio para que emita la nota de crédito correspondiente.',
        code: 'INVOICE_AUTHORIZED',
      })
    }
    const updated = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: orderInclude,
      })
      await tx.orderEvent.create({
        data: { orderId: order.id, status: 'CANCELLED', note: statusNotes.CANCELLED },
      })
      for (const item of order.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } })
        if (product && product.stock >= 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          })
        }
      }
      return cancelled
    })
    res.json({ order: withTotals(updated) })

    await sendToUser(order.userId, {
      title: `Pedido ${order.code}`,
      body: 'Tu pedido fue cancelado',
      url: `/pedidos/${order.id}`,
      tag: `order-${order.id}`,
    })
    await sendToAdmins({
      title: 'Pedido cancelado',
      body: `${order.code} fue cancelado por el cliente`,
      url: `/admin/pedidos/${order.id}`,
      tag: `order-${order.id}`,
    })

    const storePhone = await getStorePhone()
    if (storePhone) {
      await sendWhatsApp({
        to: storePhone,
        text: `Pedido ${order.code} fue cancelado por el cliente (${req.user?.name || ''})`,
      })
    }
    if (req.user?.phone) {
      await sendWhatsApp({
        to: req.user.phone,
        text: `Hola ${req.user.name || ''}, tu pedido ${order.code} fue cancelado. Si necesitas ayuda, escríbenos por este chat.`,
      })
    }
  } catch (err) {
    next(err)
  }
})

export default router
