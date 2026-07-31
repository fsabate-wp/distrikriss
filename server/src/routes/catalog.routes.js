import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'

const router = Router()

const withImageUrl = (item) => {
  const out = { ...item }
  if (out.imageUrl && out.imageUrl.startsWith('/')) {
    out.imageUrl = `${config.publicApiUrl}${out.imageUrl}`
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
    const { category, search, sort, limit = 60 } = req.query
    const where = { active: true }
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

    const products = await prisma.product.findMany({
      where,
      orderBy,
      take: Math.min(Number(limit) || 60, 200),
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
