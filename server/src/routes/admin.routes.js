import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin, requireTrustedOrigin, requireStepUp, noStore, limits } from '../middleware/auth.js'
import { sendToUser, sendToAdmins } from '../lib/push.js'
import { sendWhatsApp } from '../lib/whatsapp.js'
import { uploadImage, uploadBrand, uploadCertificate } from '../middleware/upload.js'
import multer from 'multer'
import { config, requestIp } from '../config.js'
import { startOfLocalDay } from '../lib/date.js'
import {
  issueInvoice,
  issueCreditNote,
  submitInvoice,
  canIssueInvoice,
  invoicingHealthReport,
} from '../lib/sri/index.js'
import { inspectCertificate, clearCertificateCache, CERT_FILENAME_RE } from '../lib/sri/cert.js'
import { sriEndpoints } from '../lib/sri/client.js'
import { isValidIvaRate, IVA_CODES } from '../lib/sri/xml.js'
import { renderRide } from '../lib/sri/ride.js'
import { buildLines, buildTaxGroups, computeTotals } from '../lib/sri/totals.js'
import { encryptSecret, decryptSecret, fingerprint, encryptionAvailable } from '../lib/crypto.js'
import { recordAudit, redactSettings } from '../lib/audit.js'
import { booleanIntersects, feature } from '@turf/turf'
import { closeRing } from '../lib/geo.js'

const router = Router()
// Todo el panel administrativo: origen confiable, sin caché y administrador vivo.
router.use(requireAuth, requireAdmin, requireTrustedOrigin, noStore)

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
  invoice: true,
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
    // El tamaño de la caja viaja como numero para que el panel lo pueda formatear
    // junto al resto, sin recalcularlo desde el catálogo actual.
    items: order.items?.map((i) => ({
      ...i,
      price: toNumber(i.price),
      quantity: toNumber(i.quantity),
      unitQuantity: i.unitQuantity != null ? toNumber(i.unitQuantity) : null,
    })),
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
      include: { items: true, invoice: true },
    })
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (['DELIVERED', 'CANCELLED'].includes(order.status) && order.status !== status) {
      return res.status(400).json({ error: 'Un pedido finalizado no puede cambiar de estado' })
    }

    // Un comprobante ya autorizado no puede deshacerse: la única vía legal es
    // una nota de crédito, que requiere una decisión explícita del administrador.
    if (status === 'CANCELLED' && order.invoice?.status === 'AUTHORIZED') {
      return res.status(400).json({
        error:
          `El pedido tiene la factura ${order.invoice.number} ya autorizada por el SRI. ` +
          'Anula el comprobante con una nota de crédito antes de cancelar el pedido.',
        code: 'INVOICE_AUTHORIZED',
        invoiceId: order.invoice.id,
      })
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

    // La factura se emite cuando la operación se vuelve exigible: al confirmar
    // el pago por transferencia, o al entregar el pedido contra reembolso.
    // Antes se emitía al crear el pedido, documentando una venta todavía no cobrada.
    const pagoConfirmado =
      (paymentStatus === 'PAID') || (status === 'DELIVERED' && order.paymentMethod === 'COD')
    if (pagoConfirmado && updated.billingType === 'FACTURA' && !updated.invoice) {
      try {
        await issueInvoice(updated.id, { actor: req.user })
      } catch (err) {
        // El pedido ya está confirmado: la facturación no debe tumbar la operación.
        console.error(`[sri] no se pudo emitir la factura de ${updated.code}:`, err?.message || err)
        await sendToAdmins({
          title: `Factura pendiente ${updated.code}`,
          body: String(err?.message || err).slice(0, 200),
          url: `/admin/pedidos/${updated.id}`,
          tag: `sri-pending-${updated.id}`,
        })
      }
    }

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
        minQuantity: p.minQuantity != null ? toNumber(p.minQuantity) : 1,
        stepQuantity: p.stepQuantity != null ? toNumber(p.stepQuantity) : 1,
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
  presentation: z.string().max(120).optional().or(z.literal('')).nullable(),
  sku: z.string().max(40).optional().or(z.literal('')).nullable(),
  minQuantity: z.number().min(0.01).max(10000).optional(),
  stepQuantity: z.number().min(0.01).max(10000).optional(),
  stock: z.number().int().min(-1).optional(),
  imageUrl: z.string().max(500).optional().or(z.literal('')),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  discount: z.number().int().min(0).max(100).optional(),
  // Antes aceptaba cualquier entero de 0 a 100 y el XML caía en silencio a 15%
  // con un <tarifa> que el SRI rechazaba. Ahora solo se admiten las tarifas
  // que existen en el catálogo del SRI.
  ivaRate: z.number().int().refine(isValidIvaRate, {
    message: `IVA no válido. Usa una de: ${Object.keys(IVA_CODES).join(', ')}.`,
  }).nullable().optional(),
  sriCode: z.string().max(25).optional().or(z.literal('')).nullable(),
  categoryId: z.string().optional().nullable(),
})

/**
 * Paso de venta por defecto.
 *
 * En productos a granel el paso es la bandeja: se vende 1, 2 o 3 bandejas y
 * nunca media bandeja, así que el paso coincide con el mínimo. En el resto de
 * unidades es 1: una unidad, un atado, una cabeza.
 */
function pasoPorDefecto(unit, minQuantity) {
  const u = String(unit || '').toLowerCase()
  const esPeso = ['gramos', 'g', 'gramo', 'kilo', 'kg', 'kilogramo', 'libra', 'lb'].includes(u)
  return esPeso ? minQuantity : 1
}

router.post('/products', async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body)
    const slug = data.slug || slugify(data.name)
    const existing = await prisma.product.findUnique({ where: { slug } })
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre' })
    }
    if (data.sku) {
      const skuExists = await prisma.product.findUnique({ where: { sku: data.sku } })
      if (skuExists) return res.status(409).json({ error: `Ya existe un producto con SKU ${data.sku}` })
    }
    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description || null,
        price: data.price,
        unit: data.unit,
        presentation: data.presentation || null,
        sku: data.sku || null,
        minQuantity: data.minQuantity ?? 1,
        stepQuantity: data.stepQuantity ?? pasoPorDefecto(data.unit, data.minQuantity ?? 1),
        stock: data.stock ?? -1,
        imageUrl: data.imageUrl || null,
        active: data.active ?? true,
        featured: data.featured ?? false,
        discount: data.discount ?? 0,
        ivaRate: data.ivaRate ?? null,
        sriCode: data.sriCode || null,
        categoryId: data.categoryId || null,
      },
      include: { category: { select: { id: true, name: true } } },
    })
    res.status(201).json({ product: { ...product, price: toNumber(product.price), minQuantity: toNumber(product.minQuantity), stepQuantity: toNumber(product.stepQuantity) } })
  } catch (err) {
    next(err)
  }
})

router.put('/products/:id', async (req, res, next) => {
  try {
    const data = productSchema.partial().parse(req.body)
    const product = await prisma.product.findUnique({ where: { id: req.params.id } })
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
    if (data.sku !== undefined && data.sku) {
      const skuOwner = await prisma.product.findUnique({ where: { sku: data.sku } })
      if (skuOwner && skuOwner.id !== product.id) return res.status(409).json({ error: `SKU ${data.sku} ya está en uso` })
    }
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.presentation !== undefined && { presentation: data.presentation || null }),
        ...(data.sku !== undefined && { sku: data.sku || null }),
        ...(data.minQuantity !== undefined && { minQuantity: data.minQuantity }),
        ...(data.stepQuantity !== undefined && { stepQuantity: data.stepQuantity }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.featured !== undefined && { featured: data.featured }),
        ...(data.discount !== undefined && { discount: data.discount }),
        ...(data.ivaRate !== undefined && { ivaRate: data.ivaRate }),
        ...(data.sriCode !== undefined && { sriCode: data.sriCode || null }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
      },
      include: { category: { select: { id: true, name: true } } },
    })
    res.json({ product: { ...updated, price: toNumber(updated.price), minQuantity: toNumber(updated.minQuantity), stepQuantity: toNumber(updated.stepQuantity) } })
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

/* ---------------- Importación CSV ---------------- */

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|txt)$/i.test(file.originalname) || /text\/csv|text\/plain|application\/vnd.ms-excel/.test(file.mimetype)
    if (ok) return cb(null, true)
    cb(Object.assign(new Error('Solo se permiten archivos CSV'), { status: 400 }))
  },
})

function parseCSVBuffer(buffer) {
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/)
  if (lines.length < 1) return { header: [], rows: [] }
  // Find first non-empty line as header
  let headerIdx = 0
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx++
  if (headerIdx >= lines.length) return { header: [], rows: [] }
  const headerLine = lines[headerIdx]
  const header = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const rows = []
  let currentCategory = null
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    // naive split preserving quoted? simple split
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const skuIdx = header.indexOf('sku')
    const prodIdx = header.findIndex(h => h === 'productos' || h === 'producto' || h === 'name' || h === 'nombre')
    const nameIdx = prodIdx >= 0 ? prodIdx : 1
    const unidadIdx = header.findIndex(h => h === 'unidad' || h === 'unit' || h === 'unidadmedida')
    const minimoIdx = header.findIndex(h => h === 'minimo' || h === 'minimo ' || h === 'mínimo' || h === 'minquantity' || h === 'min' )
    const presentIdx = header.findIndex(h => h.includes('prsent') || h.includes('present') || h === 'presentacion' || h === 'presentación')
    const precioIdx = header.findIndex(h => h === 'precio' || h === 'price')
    const categoriaIdx = header.findIndex(h => h === 'categoria' || h === 'categoría' || h === 'category')

    const skuRaw = skuIdx >= 0 ? (cols[skuIdx] || '').trim() : ''
    const nameRaw = (cols[nameIdx] || '').trim()
    const unidadRaw = unidadIdx >= 0 ? (cols[unidadIdx] || '').trim() : ''
    const minimoRaw = minimoIdx >= 0 ? (cols[minimoIdx] || '').trim() : ''
    const presentRaw = presentIdx >= 0 ? (cols[presentIdx] || '').trim() : ''
    const precioRaw = precioIdx >= 0 ? (cols[precioIdx] || '').trim() : ''
    const categoriaRaw = categoriaIdx >= 0 ? (cols[categoriaIdx] || '').trim() : ''

    // Detect category header row: sku empty & unidad empty & name matches known categories or present empty
    const isCategoryRow = !skuRaw && !unidadRaw && nameRaw && (['legumbres','montes','granos','frutas'].includes(nameRaw.toLowerCase()) || (categoriaRaw && !nameRaw))
    if (isCategoryRow) {
      currentCategory = nameRaw || categoriaRaw
      continue
    }
    if (categoriaRaw) currentCategory = categoriaRaw
    if (!nameRaw) continue

    // If current category still null and name looks like category header
    if (!unidadRaw && !minimoRaw && !precioRaw && nameRaw && !skuRaw) {
      currentCategory = nameRaw
      continue
    }
    if (!currentCategory) currentCategory = categoriaRaw || 'General'

    let unit = unidadRaw || 'Unidad'
    if (/^unida$/i.test(unit)) unit = 'Unidad'
    let minQuantity = parseFloat((minimoRaw || '1').replace(',', '.'))
    if (!Number.isFinite(minQuantity) || minQuantity <=0) minQuantity = 1
    let price = parseFloat((precioRaw || '0').replace(',', '.'))
    if (!Number.isFinite(price)) price = 0
    const presentation = presentRaw || null
    const sku = skuRaw || null
    const catName = categoriaRaw || currentCategory || 'General'
    rows.push({ sku, name: nameRaw, unit, minQuantity, stepQuantity: pasoPorDefecto(unit, minQuantity), presentation, price, categoryName: catName })
  }
  return { header, rows }
}

router.post('/products/import', csvUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envía un archivo CSV con campo "file"' })
    const mode = req.query.mode === 'replace' ? 'replace' : 'upsert'
    const { rows } = parseCSVBuffer(req.file.buffer)
    if (!rows.length) return res.status(400).json({ error: 'CSV vacío o formato no reconocido' })

    if (mode === 'replace') {
      // Borrar pedidos antes de borrar productos por FK
      await prisma.invoice.deleteMany({})
      await prisma.orderEvent.deleteMany({})
      await prisma.orderItem.deleteMany({})
      await prisma.order.deleteMany({})
      await prisma.product.deleteMany({})
      // No borramos categorías si vamos a reusar, pero limpiamos si el CSV trae categorías específicas
      // Mantenemos categorías para re-crear
    }

    // Ensure categories exist
    const catNames = [...new Set(rows.map(r => r.categoryName).filter(Boolean))]
    const catMap = {}
    for (const catName of catNames) {
      const slug = slugify(catName)
      let cat = await prisma.category.findUnique({ where: { slug } })
      if (!cat) {
        cat = await prisma.category.create({ data: { name: catName, slug, sortOrder: 0 } })
      }
      catMap[catName] = cat.id
      // also map slug variant
      catMap[slug] = cat.id
    }

    let created = 0, updated = 0, skipped = 0
    const errors = []
    for (const r of rows) {
      try {
        const slug = slugify(r.name)

        const data = {
          name: r.name,
          slug,
          unit: r.unit,
          presentation: r.presentation,
          minQuantity: r.minQuantity,
          stepQuantity: pasoPorDefecto(r.unit, r.minQuantity),
          price: r.price,
          categoryId: catMap[r.categoryName] || null,
          stock: -1,
          active: true,
        }

        if (r.sku) {
          const existingBySku = await prisma.product.findUnique({ where: { sku: r.sku } })
          if (existingBySku) {
            await prisma.product.update({ where: { id: existingBySku.id }, data })
            updated++
            continue
          }
        }
        const existingBySlug = await prisma.product.findUnique({ where: { slug } })
        if (existingBySlug) {
          await prisma.product.update({ where: { id: existingBySlug.id }, data: { ...data, sku: r.sku || existingBySlug.sku } })
          updated++
        } else {
          await prisma.product.create({ data: { ...data, sku: r.sku } })
          created++
        }
      } catch (e) {
        skipped++
        errors.push(`${r.name}: ${e.message}`.slice(0,120))
      }
    }

    res.json({ ok: true, mode, total: rows.length, created, updated, skipped, errors: errors.slice(0,10), categories: catNames })
  } catch (err) {
    next(err)
  }
})

router.get('/products/import/template', async (req, res) => {
  const csv = 'sku,PRODUCTOS,Unidad,Minimo,PRSENTACION,Precio\n1,Ejemplo Ají,Gramos,50,Caja de plastico,1.50\n2,Ejemplo Papa,Kilo,1,Malla,2.00\n'
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.csv"')
  res.send(csv)
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

/**
 * Vista pública de la configuración para el panel.
 *
 * La contraseña del certificado NUNCA se devuelve: antes viajaba en claro en
 * cada GET /settings y quedaba en el historial del navegador, en la consola y en
 * cualquier captura. Aquí solo se informa si hay una configurada.
 */
function toAdminSettings(settings) {
  if (!settings) return null
  const {
    sriCertificatePasswordEnc,
    sriCertificatePasswordFor,
    bankTransferEnc,
    ...rest
  } = settings
  // Los datos bancarios vuelven descifrados para que el panel pueda editarlos.
  let bankTransfer = settings.bankTransfer
  if (bankTransferEnc) {
    try {
      bankTransfer = JSON.parse(decryptSecret(bankTransferEnc))
    } catch {
      bankTransfer = null
    }
  }
  return {
    ...rest,
    sriCertificatePasswordEnc: undefined,
    sriCertificatePasswordFor: undefined,
    bankTransferEnc: undefined,
    sriCertificatePassword: undefined,
    sriCertificatePasswordSet: Boolean(sriCertificatePasswordEnc),
    bankTransfer: bankTransfer || {},
    sriCertificatePasswordFor: sriCertificatePasswordFor || '',
    deliveryFeeBase: toNumber(settings.deliveryFeeBase),
    deliveryFeePerKm: toNumber(settings.deliveryFeePerKm),
    minOrderAmount: toNumber(settings.minOrderAmount),
    sriIvaRate: toNumber(settings.sriIvaRate),
  }
}

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    res.json({ settings: toAdminSettings(settings) })
  } catch (err) {
    next(err)
  }
})

const settingsSchema = z.object({
  storeName: z.string().min(1).max(80),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
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
  ruc: z.string().regex(/^\d{13}$/).or(z.literal('')),
  businessName: z.string().max(160),
  tradeName: z.string().max(160),
  sriEnabled: z.boolean(),
  sriEnvironment: z.union([z.literal(1), z.literal(2)]),
  sriEstablishment: z.string().regex(/^\d{3}$/),
  sriEmissionPoint: z.string().regex(/^\d{3}$/),
  // Antes era texto libre y terminaba en path.join(CERT_DIR, valor), lo que
  // permitía leer cualquier archivo del servidor. Solo se acepta el nombre que
  // genera la subida del certificado.
  sriCertificateFile: z
    .string()
    .max(200)
    .refine((v) => v === '' || CERT_FILENAME_RE.test(v), {
      message: 'Nombre de certificado inválido. Vuelve a subir el archivo .p12.',
    }),
  // Solo se acepta para escribir; el valor se cifra antes de tocar la base.
  sriCertificatePassword: z.string().max(200).optional(),
  sriObligadoContabilidad: z.boolean(),
  sriSpecialContributor: z.string().max(40),
  sriAddress: z.string().max(200),
  sriAccountingResolution: z.string().max(40),
  sriIvaRate: z.number().refine(isValidIvaRate, {
    message: `IVA no válido. Usa una de: ${Object.keys(IVA_CODES).join(', ')}.`,
  }),
  sriDeliveryTaxable: z.boolean(),
})

/** Campos cuya modificación exige volver a confirmar la contraseña. */
const SENSITIVE_SETTINGS = new Set([
  'ruc',
  'sriEnvironment',
  'sriEstablishment',
  'sriEmissionPoint',
  'sriCertificateFile',
  'sriCertificatePassword',
  'businessName',
  'sriEnabled',
])

router.put('/settings', async (req, res, next) => {
  try {
    const data = settingsSchema.partial().parse(req.body)
    const current = await prisma.settings.findUnique({ where: { id: 1 } })

    const tocados = Object.keys(data).filter((k) => SENSITIVE_SETTINGS.has(k) && data[k] !== undefined)
    if (tocados.length) {
      // Cambiar el RUC, el ambiente o el certificado exige confirmación reciente
      // de contraseña: con un token robado basta para desviar toda la
      // facturación del negocio.
      const verifiedAt = Number(req.get('x-sri-verified-at'))
      const nonce = req.get('x-sri-step-up')
      const ventanaMs = 10 * 60 * 1000
      if (!nonce || !verifiedAt || Date.now() - verifiedAt > ventanaMs) {
        return res.status(428).json({
          error: 'Para cambiar los datos fiscales debes volver a confirmar tu contraseña.',
          code: 'STEP_UP_REQUIRED',
          fields: tocados,
        })
      }
      const fallo = validateSensitiveChange(current, data, tocados)
      if (fallo) return res.status(400).json(fallo)
    }

    const payload = { ...data }
    const plainPassword = payload.sriCertificatePassword
    delete payload.sriCertificatePassword

    // Los datos bancarios se cifran igual que la contraseña del certificado: en
    // claro, cualquiera que abriera el sitio veía la cuenta en la que se iba a
    // transferir dinero.
    if (payload.bankTransfer !== undefined) {
      const banco = payload.bankTransfer
      const vacio = !banco || Object.values(banco).every((v) => !String(v ?? '').trim())
      // bankTransferEnc es la nueva fuente de verdad. La columna en claro se deja
      // vacía para que no quede una copia legible en la base.
      payload.bankTransferEnc = vacio ? '' : encryptSecret(JSON.stringify(banco))
      payload.bankTransfer = {}
    }

    if (plainPassword !== undefined) {
      if (plainPassword === '') {
        // Vaciar significa borrar la contraseña configurada.
        payload.sriCertificatePasswordEnc = ''
        payload.sriCertificatePasswordFor = ''
      } else {
        // Se cifra en el servidor con SRI_CERT_SECRET. El texto plano nunca se
        // guarda ni se devuelve.
        payload.sriCertificatePasswordEnc = encryptSecret(plainPassword)
        payload.sriCertificatePasswordFor = current?.sriCertificateFile || ''
      }
    }

    let settings
    if (current) {
      if (payload.sriCertificateFile && payload.sriCertificateFile !== current.sriCertificateFile) {
        // Si se cambia el archivo y no se envía una contraseña nueva, la que había
        // cifrada dejaría de corresponder: se descarta para que se vuelva a pedir.
        const seEnvioPassword = plainPassword !== undefined && plainPassword !== ''
        if (!seEnvioPassword) {
          payload.sriCertificatePasswordEnc = ''
          payload.sriCertificatePasswordFor = ''
        } else {
          payload.sriCertificatePasswordFor = payload.sriCertificateFile
        }
        clearCertificateCache()
      }
      // bankTransfer ya no viaja en claro: viaja en bankTransferEnc, que Prisma
      // acepta directamente porque es una columna normal.
      settings = await prisma.settings.update({ where: { id: 1 }, data: payload })
    } else {
      settings = await prisma.settings.create({ data: { id: 1, storeLat: 0, storeLng: 0, ...payload } })
    }

    if (tocados.length) {
      await recordAudit({
        req,
        action: 'SRI_SETTINGS_CHANGED',
        target: tocados.join(','),
        before: redactSettings(pick(current, tocados)),
        after: redactSettings(pick(data, tocados)),
      })
      // Los cambios fiscales pueden dejar comprobantes a medias por un ambiente
      // distinto: se avisa para que se reintenten a mano si hace falta.
      await sendToAdmins({
        title: 'Configuración fiscal modificada',
        body: `Se cambió: ${tocados.join(', ')}. Revisa las facturas sin resolver.`,
        url: '/admin/facturas',
        tag: 'sri-settings',
      })
    }

    res.json({ settings: toAdminSettings(settings) })
  } catch (err) {
    next(err)
  }
})

/** Reglas de coherencia fiscal que se comprueban antes de guardar. */
function validateSensitiveChange(current, data, tocados) {
  const merged = { ...current, ...data }
  if (merged.sriEnabled) {
    if (!merged.ruc) return { error: 'Configura el RUC antes de activar la facturación electrónica' }
    if (!merged.businessName?.trim()) return { error: 'Configura la razón social antes de activar la facturación' }
    if (!merged.sriCertificateFile) return { error: 'Sube el certificado .p12 antes de activar la facturación' }
    const habiaPassword = data.sriCertificatePassword
      ? data.sriCertificatePassword !== ''
      : Boolean(current?.sriCertificatePasswordEnc)
    if (!habiaPassword) return { error: 'Configura la contraseña del certificado antes de activar la facturación' }
  }
  if (tocados.includes('sriEnvironment') && data.sriEnvironment === 1 && !merged.sriCertificateFile) {
    return { error: 'No se puede pasar a producción sin un certificado configurado' }
  }
  return null
}

function pick(object, keys) {
  if (!object) return null
  return Object.fromEntries(keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]]))
}


/* ---------------- Zonas de entrega ---------------- */

const zoneSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  polygon: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
  enabled: z.boolean().optional(),
  deliveryDays: z.array(z.number().int().min(0).max(6)),
  slots: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      start: z.string(),
      end: z.string(),
      capacity: z.number().int().min(0),
    }),
  ),
  deliveryFeeBase: z.number().min(0),
  deliveryFeePerKm: z.number().min(0),
  minOrderAmount: z.number().min(0),
  sortOrder: z.number().int().min(0).optional(),
})

function toZoneResponse(z) {
  return {
    id: z.id,
    name: z.name,
    color: z.color,
    polygon: z.polygon,
    enabled: z.enabled,
    deliveryDays: z.deliveryDays,
    slots: z.slots,
    deliveryFeeBase: toNumber(z.deliveryFeeBase),
    deliveryFeePerKm: toNumber(z.deliveryFeePerKm),
    minOrderAmount: toNumber(z.minOrderAmount),
    sortOrder: z.sortOrder,
    createdAt: z.createdAt,
    updatedAt: z.updatedAt,
  }
}

async function assertNoOverlap(polygon, excludeId) {
  const existing = await prisma.deliveryZone.findMany({ select: { id: true, polygon: true, name: true } })
  const incoming = feature(closeRing(polygon))
  for (const z of existing) {
    if (excludeId && z.id === excludeId) continue
    if (booleanIntersects(incoming, feature(closeRing(z.polygon)))) {
      throw Object.assign(new Error(`La zona se superpone con "${z.name}"`), { status: 400 })
    }
  }
}

router.get('/zones', async (req, res, next) => {
  try {
    const zones = await prisma.deliveryZone.findMany({ orderBy: { sortOrder: 'asc' } })
    res.json({ zones: zones.map(toZoneResponse) })
  } catch (err) {
    next(err)
  }
})

router.post('/zones', async (req, res, next) => {
  try {
    const data = zoneSchema.parse(req.body)
    await assertNoOverlap(data.polygon)
    const zone = await prisma.deliveryZone.create({
      data: {
        name: data.name,
        color: data.color || '#4CAF50',
        polygon: closeRing(data.polygon),
        enabled: data.enabled ?? true,
        deliveryDays: data.deliveryDays,
        slots: data.slots,
        deliveryFeeBase: data.deliveryFeeBase,
        deliveryFeePerKm: data.deliveryFeePerKm,
        minOrderAmount: data.minOrderAmount,
        sortOrder: data.sortOrder ?? 0,
      },
    })
    res.json({ zone: toZoneResponse(zone) })
  } catch (err) {
    next(err)
  }
})

router.put('/zones/:id', async (req, res, next) => {
  try {
    const data = zoneSchema.partial().parse(req.body)
    if (data.polygon) {
      data.polygon = closeRing(data.polygon)
      await assertNoOverlap(data.polygon, req.params.id)
    }
    const zone = await prisma.deliveryZone.update({ where: { id: req.params.id }, data })
    res.json({ zone: toZoneResponse(zone) })
  } catch (err) {
    next(err)
  }
})

router.delete('/zones/:id', async (req, res, next) => {
  try {
    await prisma.deliveryZone.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ---------------- Facturación electrónica (SRI) ---------------- */

const toNumberOrNull = (v) => (v === null || v === undefined ? null : Number(v))

/** Confirma la contraseña del administrador y abre una ventana para actuar. */
router.post('/sri/step-up', limits.stepUp, async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' })
    await recordAudit({ req, action: 'SRI_STEP_UP', target: req.user.id })
    // El nonce liga la confirmación a esta sesión de forma opaca para el cliente.
    const nonce = crypto.randomBytes(16).toString('hex')
    res.setHeader('X-SRI-Verified-At', String(Date.now()))
    res.setHeader('X-SRI-Step-Up', nonce)
    res.json({ ok: true, verifiedAt: Date.now(), nonce })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/uploads/certificate',
  limits.certificateUpload,
  uploadCertificate.single('certificate'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No se recibió ningún certificado' })
      const bytes = req.file.buffer || (await import('node:fs')).readFileSync(req.file.path)
      // Firma PKCS#12: 0x30 0x82. El filtro por extension solo no basta.
      if (bytes[0] !== 0x30 || bytes[1] !== 0x82) {
        return res.status(400).json({ error: 'El archivo no es un certificado .p12 válido' })
      }
      await recordAudit({
        req,
        action: 'SRI_CERTIFICATE_UPLOADED',
        target: req.file.filename,
        after: { fingerprint: fingerprint(bytes), bytes: bytes.length },
      })
      res.json({ filename: req.file.filename, fingerprint: fingerprint(bytes) })
    } catch (err) {
      next(err)
    }
  },
)

router.get('/invoices', async (req, res, next) => {
  try {
    const { status, take = 100, offset = 0 } = req.query
    const where = {}
    if (status) where.status = status
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(take) || 100, 200),
        skip: Number(offset) || 0,
        include: {
          order: { select: { code: true, total: true, status: true, createdAt: true, billingType: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ])
    res.json({
      invoices: invoices.map((i) => ({
        ...i,
        // El XML firmado no viaja en el listado: pesa y contiene datos del
        // cliente. Se descarga aparte, y el panel ya tiene su propio endpoint.
        xml: undefined,
        receptionResponse: undefined,
        authorizationXml: undefined,
        totalFiscal: toNumberOrNull(i.totalFiscal),
        order: i.order ? { ...i.order, total: toNumberOrNull(i.order.total) } : null,
      })),
      total,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/invoices/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        events: { orderBy: { createdAt: 'desc' } },
        credits: { select: { id: true, number: true, accessKey: true, status: true } },
        order: { include: { items: true, user: { select: { name: true, phone: true, email: true } } } },
      },
    })
    if (!invoice) return res.status(404).json({ error: 'Comprobante no encontrado' })
    res.json({
      invoice: {
        ...invoice,
        xml: undefined,
        receptionResponse: undefined,
        authorizationXml: undefined,
        totalFiscal: toNumberOrNull(invoice.totalFiscal),
        order: invoice.order ? withTotals(invoice.order) : null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** XML firmado del comprobante, para el expediente fiscal. */
router.get('/invoices/:id/xml', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } })
    if (!invoice) return res.status(404).json({ error: 'Comprobante no encontrado' })
    if (!invoice.xml) return res.status(404).json({ error: 'El comprobante todavía no tiene XML' })
    await recordAudit({ req, action: 'SRI_XML_DOWNLOADED', target: invoice.id })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.xml"`)
    res.send(invoice.xml)
  } catch (err) {
    next(err)
  }
})

/** RIDE en PDF: la representación que el cliente necesita para deducir. */
router.get('/invoices/:id/ride', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { items: true } } },
    })
    if (!invoice) return res.status(404).json({ error: 'Comprobante no encontrado' })
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!settings) return res.status(500).json({ error: 'Configuración no encontrada' })

    const { lines, totalDiscount } = buildLines(invoice.order, settings)
    const groups = buildTaxGroups(lines)
    const totals = computeTotals(lines, totalDiscount)
    const pdf = await renderRide({ invoice, order: invoice.order, settings, lines, groups, totals })
    await recordAudit({ req, action: 'SRI_RIDE_DOWNLOADED', target: invoice.id })

    const etiqueta = invoice.docType === 'NOTA_CREDITO' ? 'nota-credito' : 'factura'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${etiqueta}-${invoice.number}.pdf"`)
    res.send(pdf)
  } catch (err) {
    next(err)
  }
})

/**
 * Reintenta el envío de un comprobante.
 *
 * No emite nada nuevo: firma lo que ya existe y consulta primero al SRI. Un
 * reintento sobre un comprobante ya autorizado no hacía nada útil y podía
 * dejar dos documentos con la misma clave.
 */
router.post('/invoices/:id/retry', limits.invoiceRetry, async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } })
    if (!invoice) return res.status(404).json({ error: 'Comprobante no encontrado' })
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!canIssueInvoice(settings)) {
      return res.status(400).json({ error: 'La facturación SRI no está configurada (actívala y sube el certificado)' })
    }
    if (invoice.status === 'AUTHORIZED') {
      return res.status(400).json({ error: 'Este comprobante ya fue autorizado por el SRI' })
    }
    if (invoice.status === 'CREDITED') {
      return res.status(400).json({ error: 'Este comprobante fue anulado por una nota de crédito' })
    }
    if (invoice.status === 'NOT_AUTHORIZED') {
      return res.status(400).json({
        error:
          'El SRI rechazó este comprobante y tiene registrado su clave. Corrije la causa y emite uno nuevo: ' +
          'no se puede reenviar la misma clave de acceso.',
        code: invoice.responseCode || undefined,
      })
    }

    await recordAudit({ req, action: 'SRI_INVOICE_RETRY', target: invoice.number, after: { status: invoice.status } })
    await submitInvoice(invoice.id, { actor: req.user, force: true })
    const updated = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: {
        id: true, number: true, accessKey: true, status: true, responseCode: true, responseMessage: true,
        authorizationNumber: true, authorizationDate: true, retryCount: true, nextRetryAt: true,
      },
    })
    res.json({ invoice: updated })
  } catch (err) {
    next(err)
  }
})

/** Emite la factura de un pedido cuyo pago acaba de confirmarse. */
router.post('/orders/:id/invoice', limits.invoiceWrite, async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, invoice: true },
    })
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (order.billingType !== 'FACTURA') {
      return res.status(400).json({ error: 'Este pedido se creó como consumo final' })
    }
    if (order.invoice) {
      return res.json({ invoice: { id: order.invoice.id, status: order.invoice.status, number: order.invoice.number } })
    }
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!canIssueInvoice(settings)) {
      return res.status(400).json({ error: 'La facturación SRI no está configurada' })
    }
    await recordAudit({ req, action: 'SRI_INVOICE_MANUAL', target: order.code })
    const invoice = await issueInvoice(order.id, { actor: req.user })
    res.json({
      invoice: invoice && {
        id: invoice.id, number: invoice.number, status: invoice.status,
        accessKey: invoice.accessKey, responseMessage: invoice.responseMessage,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * Anula un comprobante autorizado con una nota de crédito.
 * Exige confirmación de contraseña: es la operación más delicada del panel.
 */
router.post('/invoices/:id/credit-note', limits.invoiceWrite, requireStepUp, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(5).max(300) }).parse(req.body)
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } })
    if (!invoice) return res.status(404).json({ error: 'Comprobante no encontrado' })
    await recordAudit({
      req,
      action: 'SRI_CREDIT_NOTE',
      target: invoice.number,
      before: { status: invoice.status, total: toNumberOrNull(invoice.totalFiscal) },
      after: { reason },
    })
    const note = await issueCreditNote(invoice.id, { reason, actor: req.user })
    res.json({
      invoice: note && {
        id: note.id, number: note.number, status: note.status,
        accessKey: note.accessKey, responseMessage: note.responseMessage,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** Panorama de salud fiscal del negocio. */
router.get('/sri/health', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    const report = await invoicingHealthReport()
    const certificate = settings ? inspectCertificate(settings) : { ok: false, error: 'Sin configuración' }

    // El certificado se revisa aunque falte la clave de cifrado: así el panel
    // dice "define SRI_CERT_SECRET" en vez de un error genérico.
    const cifradoDisponible = encryptionAvailable()
    const advertencias = []
    if (settings?.sriEnabled && !cifradoDisponible) {
      advertencias.push(
        'Falta SRI_CERT_SECRET en el servidor. Sin ella no se puede cifrar la contraseña del certificado. ' +
          'Genera una con "openssl rand -hex 32" y reinicia la API. El resto de la tienda funciona con normalidad.',
      )
    }
    if (settings?.sriEnabled && !settings.sriCertificateFile) {
      advertencias.push('No has subido el certificado .p12: las facturas no se pueden firmar.')
    }
    if (certificate.ok && !certificate.rucMatches) {
      advertencias.push(
        `El RUC del certificado (${certificate.rucInCertificate}) no coincide con el configurado (${settings.ruc}).`,
      )
    }
    if (certificate.ok && certificate.expiringSoon) {
      advertencias.push(`El certificado vence en ${certificate.daysLeft} días.`)
    }

    res.json({
      ...report,
      certificate,
      configured: canIssueInvoice(settings),
      encryptionAvailable: cifradoDisponible,
      advertencias,
      environment: Number(settings?.sriEnvironment) === 1 ? 'PRODUCCION' : 'PRUEBAS',
      series: await prisma.documentSeries.findMany({ orderBy: { docType: 'asc' } }),
    })
  } catch (err) {
    next(err)
  }
})

/** Bitácora de acciones sensibles sobre la configuración fiscal. */
router.get('/sri/audit', async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.take) || 50, 200)
    const [logs, events] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take }),
      prisma.invoiceEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        include: { invoice: { select: { number: true, status: true } } },
      }),
    ])
    res.json({ logs, events })
  } catch (err) {
    next(err)
  }
})

/** Diagnóstico del certificado y de la conectividad con el SRI. */
router.post('/sri/test', limits.sriTest, async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!settings || !settings.sriEnabled) {
      return res.status(400).json({ error: 'Activa la facturación electrónica antes de probar la conexión con el SRI' })
    }

    const missing = []
    if (!settings.ruc) missing.push('RUC')
    if (!/^\d{13}$/.test(settings.ruc || '')) missing.push('RUC válido (13 dígitos)')
    if (!settings.businessName) missing.push('razón social')
    if (!settings.sriAddress && !settings.storeAddress) missing.push('dirección del establecimiento')
    if (!settings.sriCertificateFile) missing.push('certificado .p12')
    if (!settings.sriCertificatePasswordEnc) missing.push('contraseña del certificado')
    if (!isValidIvaRate(Number(settings.sriIvaRate))) {
      missing.push(`IVA ${settings.sriIvaRate}% (válidos: ${Object.keys(IVA_CODES).join(', ')})`)
    }
    if (missing.length) {
      return res.status(400).json({ error: `Falta configurar: ${missing.join(', ')}` })
    }

    // El certificado se inspecciona con la contraseña cifrada: el panel nunca ve
    // el texto plano y el chequeo real (vigencia y RUC) ocurre igual.
    clearCertificateCache()
    const certificate = inspectCertificate(settings)

    const environment = Number(settings.sriEnvironment)
    const target = sriEndpoints(environment)
    const checks = []
    for (const item of [
      { name: 'Recepción', url: target.reception },
      { name: 'Autorización', url: target.authorization },
    ]) {
      const start = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch(item.url, { method: 'GET', signal: controller.signal })
        checks.push({
          name: item.name,
          url: item.url,
          reachable: true,
          httpStatus: response.status,
          ms: Date.now() - start,
        })
      } catch (err) {
        checks.push({
          name: item.name,
          url: item.url,
          reachable: false,
          httpStatus: null,
          ms: Date.now() - start,
          error:
            err?.name === 'AbortError'
              ? 'timeout de 10s'
              : String(err?.cause?.code || err?.message || err).slice(0, 200),
        })
      } finally {
        clearTimeout(timer)
      }
    }

    res.json({
      environment,
      environmentLabel: environment === 1 ? 'Producción' : 'Pruebas',
      certificate,
      checks,
      ok: certificate.ok && certificate.rucMatches && checks.every((c) => c.reachable && c.httpStatus === 200),
    })
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
