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
} from '../lib/delivery.js'
import { sendToAdmins, sendToUser } from '../lib/push.js'
import { sendWhatsApp, getStorePhone } from '../lib/whatsapp.js'
import { validateIdentifier } from '../lib/sri/ruc.js'
import { issueInvoice } from '../lib/sri/index.js'

const router = Router()
router.use(requireAuth)

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
          quantity: z.number().int().min(1).max(500),
        }),
      )
      .min(1),
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

async function generateOrderCode() {
  const count = await prisma.order.count()
  return `DK-${String(count + 1).padStart(4, '0')}`
}

function withTotals(order) {
  const toNumber = (v) => Number(v)
  return {
    ...order,
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.deliveryFee),
    total: toNumber(order.total),
    items: order.items?.map((i) => ({ ...i, price: toNumber(i.price) })),
  }
}

const orderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'desc' } },
  address: true,
  invoice: true,
}

router.post('/', async (req, res, next) => {
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

    const slots = await slotAvailabilityFor(deliveryDate, zone, settings)
    const slot = slots.find((s) => s.id === data.slotId)
    if (!slot) {
      return res.status(400).json({ error: 'Horario de entrega no válido', code: 'INVALID_SLOT' })
    }
    if (!slot.available) {
      return res.status(400).json({ error: 'Ese horario ya está lleno', code: 'SLOT_FULL' })
    }

    const products = await prisma.product.findMany({
      where: { id: { in: data.items.map((i) => i.productId) }, active: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))
    let subtotal = 0
    const items = data.items.map((item) => {
      const product = productMap.get(item.productId)
      if (!product) throw Object.assign(new Error('Producto no disponible'), { status: 400 })
      if (product.stock >= 0 && product.stock < item.quantity) {
        throw Object.assign(new Error(`Stock insuficiente para "${product.name}"`), { status: 400 })
      }
      subtotal += Number(product.price) * item.quantity
      const globalIva = Number(settings.sriIvaRate) || 15
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        price: product.price,
        quantity: item.quantity,
        ivaRate: product.ivaRate ?? globalIva,
      }
    })

    subtotal = Math.round(subtotal * 100) / 100
    const minOrder = Number(check.minOrderAmount)
    if (subtotal < minOrder) {
      return res.status(400).json({
        error: `El pedido mínimo para tu zona es $${minOrder.toFixed(2)}`,
        code: 'MIN_ORDER',
      })
    }

    const deliveryFee = check.deliveryFee
    const total = Math.round((subtotal + deliveryFee) * 100) / 100
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
      const created = await tx.order.create({
        data: {
          code,
          userId: req.user.id,
          status: 'PENDING',
          paymentMethod: data.paymentMethod,
          paymentStatus: data.paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
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
      for (const item of items) {
        if (productMap.get(item.productId).stock >= 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          })
        }
      }
      return created
    })

    res.status(201).json({ order: withTotals(order) })

    if (billingType === 'FACTURA') {
      setImmediate(() => {
        issueInvoice(order.id).catch(() => {})
      })
    }

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
      include: { items: true },
    })
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      return res.status(400).json({ error: 'El pedido ya no puede cancelarse' })
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
