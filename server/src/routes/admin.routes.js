import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { sendToUser } from '../lib/push.js'
import { sendWhatsApp } from '../lib/whatsapp.js'
import { uploadImage, uploadBrand } from '../middleware/upload.js'
import { config } from '../config.js'
import { startOfLocalDay } from '../lib/date.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const slugify = (str) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const orderInclude = {
  user: { select: { id: true, name: true, phone: true, email: true } },
  items: true,
  events: { orderBy: { createdAt: 'asc' } },
}

const toNumber = (v) => Number(v)

/* ---------------- Dashboard ---------------- */

router.get('/stats', async (req, res, next) => {
  try {
    const today = startOfLocalDay(new Date())
    const [todayOrders, pendingOrders, todayRevenue, totalRevenue, clients, products, byStatus] =
      await Promise.all([
        prisma.order.count({ where: { createdAt: { gte: today } } }),
        prisma.order.count({
          where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY'] } },
        }),
        prisma.order.aggregate({
          where: { createdAt: { gte: today }, status: { notIn: ['CANCELLED'] } },
          _sum: { total: true },
        }),
        prisma.order.aggregate({
          where: { status: { notIn: ['CANCELLED'] } },
          _sum: { total: true },
        }),
        prisma.user.count({ where: { role: 'CLIENT' } }),
        prisma.product.count(),
        prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      ])

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const recent = await prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { notIn: ['CANCELLED'] } },
      select: { createdAt: true, total: true },
    })
    const salesByDay = []
    const counts = {}
    for (const o of recent) {
      const key = o.createdAt.toISOString().slice(0, 10)
      counts[key] = (counts[key] || 0) + toNumber(o.total)
    }
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      salesByDay.push({ date: key, total: Math.round((counts[key] || 0) * 100) / 100 })
    }

    const topRaw = await prisma.orderItem.groupBy({
      by: ['productId', 'name'],
      where: { order: { status: { notIn: ['CANCELLED'] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    })

    res.json({
      stats: {
        todayOrders,
        pendingOrders,
        todayRevenue: Math.round((todayRevenue._sum.total || 0) * 100) / 100,
        totalRevenue: Math.round((totalRevenue._sum.total || 0) * 100) / 100,
        clients,
        products,
        ordersByStatus: byStatus,
        salesByDay,
        topProducts: topRaw.map((t) => ({
          name: t.name,
          quantity: t._sum.quantity || 0,
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})

/* ---------------- Pedidos ---------------- */

router.get('/orders', async (req, res, next) => {
  try {
    const { status, search, take = 50, offset = 0 } = req.query
    const where = {}
    if (status) where.status = status
    if (search) {
      const term = String(search)
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { phone: { contains: term } } },
      ]
    }
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(take) || 50, 200),
        skip: Number(offset) || 0,
      }),
      prisma.order.count({ where }),
    ])
    res.json({ orders: orders.map(withTotals), total })
  } catch (err) {
    next(err)
  }
})

function withTotals(order) {
  return {
    ...order,
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.deliveryFee),
    total: toNumber(order.total),
    items: order.items?.map((i) => ({ ...i, price: toNumber(i.price) })),
  }
}

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    })
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json({ order: withTotals(order) })
  } catch (err) {
    next(err)
  }
})

const statusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  note: z.string().max(300).optional().or(z.literal('')),
  paymentStatus: z.enum(['PENDING', 'PAID']).optional(),
})

const statusNotes = {
  CONFIRMED: 'Pedido confirmado',
  PREPARING: 'En preparación',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Pedido cancelado',
  PENDING: 'Pedido recibido',
}

router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const { status, note, paymentStatus } = statusSchema.parse(req.body)
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    })
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (['DELIVERED', 'CANCELLED'].includes(order.status) && order.status !== status) {
      return res.status(400).json({ error: 'Un pedido finalizado no puede cambiar de estado' })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: { status, ...(paymentStatus ? { paymentStatus } : {}) },
        include: orderInclude,
      })
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          status,
          note: note || statusNotes[status] || null,
        },
      })
      if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
        for (const item of order.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } })
          if (product && product.stock >= 0) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            })
          }
        }
      }
      return next
    })
    res.json({ order: withTotals(updated) })

    const statusMessages = {
      CONFIRMED: 'Tu pedido fue confirmado',
      PREPARING: 'Tu pedido está en preparación',
      OUT_FOR_DELIVERY: 'Tu pedido está en camino',
      DELIVERED: 'Tu pedido fue entregado',
      CANCELLED: 'Tu pedido fue cancelado',
    }
    const message = statusMessages[status]
    if (message) {
      await sendToUser(order.userId, {
        title: `Pedido ${order.code}`,
        body: message,
        url: `/pedidos/${order.id}`,
        tag: `order-${order.id}`,
      })
      if (updated.user?.phone) {
        await sendWhatsApp({
          to: updated.user.phone,
          text: `Hola ${updated.user.name || ''}, ${message.toLowerCase()} (${updated.code}). Si tienes dudas, responde este mensaje.`,
        })
      }
    }
  } catch (err) {
    next(err)
  }
})

/* ---------------- Clientes ---------------- */

router.get('/clients', async (req, res, next) => {
  try {
    const { search, take = 50, offset = 0 } = req.query
    const where = { role: 'CLIENT' }
    if (search) {
      const term = String(search)
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { email: { contains: term, mode: 'insensitive' } },
      ]
    }
    const [clients, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          _count: { select: { orders: true, addresses: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(take) || 50, 200),
        skip: Number(offset) || 0,
      }),
      prisma.user.count({ where }),
    ])
    const cleaned = clients.map((c) => {
      const { passwordHash, ...rest } = c
      return rest
    })
    res.json({ clients: cleaned, total })
  } catch (err) {
    next(err)
  }
})

router.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        addresses: { orderBy: { createdAt: 'desc' } },
        orders: { orderBy: { createdAt: 'desc' }, take: 50, include: { items: true } },
      },
    })
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
    const { passwordHash, ...rest } = client
    res.json({
      client: {
        ...rest,
        orders: rest.orders.map(withTotals),
      },
    })
  } catch (err) {
    next(err)
  }
})

/* ---------------- Productos ---------------- */

router.get('/products', async (req, res, next) => {
  try {
    const { search, includeInactive = 'true' } = req.query
    const where = includeInactive === 'true' ? {} : { active: true }
    if (search) {
      where.OR = [{ name: { contains: String(search), mode: 'insensitive' } }]
    }
    const products = await prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({
      products: products.map((p) => ({
        ...p,
        price: toNumber(p.price),
        imageUrl: p.imageUrl?.startsWith('/') ? `${config.publicApiUrl}${p.imageUrl}` : p.imageUrl,
      })),
    })
  } catch (err) {
    next(err)
  }
})

const productSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(160).optional(),
  description: z.string().max(1000).optional().or(z.literal('')),
  price: z.number().min(0),
  unit: z.string().min(1).max(60),
  stock: z.number().int().min(-1).optional(),
  imageUrl: z.string().max(500).optional().or(z.literal('')),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  categoryId: z.string().optional().nullable(),
})

router.post('/products', async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body)
    const slug = data.slug || slugify(data.name)
    const existing = await prisma.product.findUnique({ where: { slug } })
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre' })
    }
    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description || null,
        price: data.price,
        unit: data.unit,
        stock: data.stock ?? -1,
        imageUrl: data.imageUrl || null,
        active: data.active ?? true,
        featured: data.featured ?? false,
        categoryId: data.categoryId || null,
      },
      include: { category: { select: { id: true, name: true } } },
    })
    res.status(201).json({ product: { ...product, price: toNumber(product.price) } })
  } catch (err) {
    next(err)
  }
})

router.put('/products/:id', async (req, res, next) => {
  try {
    const data = productSchema.partial().parse(req.body)
    const product = await prisma.product.findUnique({ where: { id: req.params.id } })
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.featured !== undefined && { featured: data.featured }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
      },
      include: { category: { select: { id: true, name: true } } },
    })
    res.json({ product: { ...updated, price: toNumber(updated.price) } })
  } catch (err) {
    next(err)
  }
})

router.delete('/products/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } })
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
    await prisma.product.delete({ where: { id: product.id } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ---------------- Categorías ---------------- */

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    res.json({
      categories: categories.map((c) => ({
        ...c,
        imageUrl: c.imageUrl?.startsWith('/') ? `${config.publicApiUrl}${c.imageUrl}` : c.imageUrl,
      })),
    })
  } catch (err) {
    next(err)
  }
})

const categorySchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(120).optional(),
  imageUrl: z.string().max(500).optional().or(z.literal('')),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
})

router.post('/categories', async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body)
    const slug = data.slug || slugify(data.name)
    const cat = await prisma.category.create({
      data: {
        name: data.name,
        slug,
        imageUrl: data.imageUrl || null,
        sortOrder: data.sortOrder ?? 0,
        active: data.active ?? true,
      },
    })
    res.status(201).json({ category: cat })
  } catch (err) {
    next(err)
  }
})

router.put('/categories/:id', async (req, res, next) => {
  try {
    const data = categorySchema.partial().parse(req.body)
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } })
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' })
    const updated = await prisma.category.update({
      where: { id: cat.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.active !== undefined && { active: data.active }),
      },
    })
    res.json({ category: updated })
  } catch (err) {
    next(err)
  }
})

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } })
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' })
    const count = await prisma.product.count({ where: { categoryId: cat.id } })
    if (count > 0) {
      return res.status(400).json({
        error: `La categoría tiene ${count} producto(s). Mueve o elimina los productos primero.`,
      })
    }
    await prisma.category.delete({ where: { id: cat.id } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ---------------- Settings ---------------- */

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (settings) {
      settings.deliveryFeeBase = toNumber(settings.deliveryFeeBase)
      settings.deliveryFeePerKm = toNumber(settings.deliveryFeePerKm)
      settings.minOrderAmount = toNumber(settings.minOrderAmount)
    }
    res.json({ settings })
  } catch (err) {
    next(err)
  }
})

const settingsSchema = z.object({
  storeName: z.string().min(1).max(80),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  storeOpen: z.boolean(),
  faviconUrl: z.string().max(500).optional().or(z.literal('')),
  appIconUrl: z.string().max(500).optional().or(z.literal('')),
  currency: z.string().min(1).max(10),
  phone: z.string().max(40),
  whatsapp: z.string().max(40),
  email: z.string().max(120),
  storeAddress: z.string().max(200),
  storeLat: z.number().min(-90).max(90),
  storeLng: z.number().min(-180).max(180),
  deliveryRadiusKm: z.number().min(0),
  deliveryFeeBase: z.number().min(0),
  deliveryFeePerKm: z.number().min(0),
  minOrderAmount: z.number().min(0),
  orderCutoff: z.string().regex(/^\d{2}:\d{2}$/),
  deliveryDays: z.array(z.number().int().min(0).max(6)),
  openHours: z.record(z.object({ open: z.string(), close: z.string(), closed: z.boolean() })),
  slots: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      start: z.string(),
      end: z.string(),
      capacity: z.number().int().min(0),
    }),
  ),
  bankTransfer: z.record(z.any()),
})

router.put('/settings', async (req, res, next) => {
  try {
    const data = settingsSchema.parse(req.body)
    const settings = await prisma.settings.upsert({
      where: { id: 1 },
      update: { id: 1, ...data },
      create: { id: 1, ...data },
    })
    res.json({ settings })
  } catch (err) {
    next(err)
  }
})

/* ---------------- Uploads ---------------- */

router.post('/uploads', uploadImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  res.json({
    url: `${config.publicApiUrl}/uploads/imgs/${req.file.filename}`,
    relative: `/uploads/imgs/${req.file.filename}`,
  })
})

router.post('/uploads/brand', uploadBrand.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  res.json({
    url: `${config.publicApiUrl}/uploads/imgs/${req.file.filename}`,
    relative: `/uploads/imgs/${req.file.filename}`,
  })
})

export default router
