import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { precioConDescuento } from '../lib/precios.js'

const router = Router()

async function requireStoreOpen(req, res, next) {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (settings && settings.storeOpen === false) {
      return res.status(400).json({ error: 'La tienda está temporalmente cerrada', code: 'STORE_CLOSED' })
    }
    next()
  } catch (err) {
    next(err)
  }
}

router.use(requireStoreOpen)

const withImageUrl = (item) => {
  const out = { ...item }
  if (out.imageUrl && out.imageUrl.startsWith('/')) {
    out.imageUrl = `${config.publicApiUrl}${out.imageUrl}`
  }
  // normalize decimals for frontend
  if (out.price != null) out.price = Number(out.price)
  if (out.minQuantity != null) out.minQuantity = Number(out.minQuantity)
  if (out.stepQuantity != null) out.stepQuantity = Number(out.stepQuantity)
  // El precio final de venta viaja ya calculado: el cliente no puede equivocarse
  // al aplicar el descuento, y el servidor cobra exactamente este valor.
  if (out.price != null) {
    out.finalPrice = precioConDescuento(out.price, out.discount)
  }
  return out
}

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { active: true } } } } },
    })
    res.json({ categories: categories.map(withImageUrl) })
  } catch (err) {
    next(err)
  }
})

router.get('/products', async (req, res, next) => {
  try {
    const { category, search, sort, limit = 60, featured, all } = req.query
    const where = { active: true }
    if (featured === 'true') where.featured = true
    if (category) {
      const cat = await prisma.category.findUnique({ where: { slug: String(category) } })
      where.categoryId = cat?.id ?? 'none'
    }
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
      ]
    }

    const orderBy =
      sort === 'price_asc'
        ? { price: 'asc' }
        : sort === 'price_desc'
          ? { price: 'desc' }
          : sort === 'name'
            ? { name: 'asc' }
            : { createdAt: 'desc' }

    /**
     * El checkout llama a este endpoint con all=true para reconciliar el carrito
     * con los precios reales. Sin ese parámetro se limita a 60 productos, así que
     * un carrito con artículos que no caen en la primera página se quedaría sin
     * actualizar tras un cambio de precio.
     */
    const toma = all === 'true' ? 500 : Math.min(Number(limit) || 60, 200)
    const products = await prisma.product.findMany({
      where,
      orderBy,
      take: toma,
      include: { category: { select: { id: true, name: true, slug: true } } },
    })
    res.json({ products: products.map(withImageUrl) })
  } catch (err) {
    next(err)
  }
})

router.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, active: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
    })
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json({ product: withImageUrl(product) })
  } catch (err) {
    next(err)
  }
})

export default router
