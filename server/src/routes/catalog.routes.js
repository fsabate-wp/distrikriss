import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { config } from '../config.js'
import { precioConDescuento } from '../lib/precios.js'
import { terminosBusqueda, patronSql, puntuarProducto } from '../lib/search.js'

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

/**
 * Productos alternativos cuando una búsqueda no encuentra nada.
 *
 * Una búsqueda sin resultados es el final del embudo: en lugar de una página
 * muerta, se ofrecen productos reales de la misma categoría, o los más
 * recientes si no se estaba filtrando por categoría.
 */
async function alternativas(where, limite = 6) {
  return prisma.product.findMany({
    where: { active: true, ...(where.categoryId ? { categoryId: where.categoryId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limite,
    include: { category: { select: { id: true, name: true, slug: true } } },
  })
}

/** Comparadores de ordenación del catálogo, para no repetir el switch. */
function ordenarPor(a, b, sort) {
  switch (sort) {
    case 'price_asc':
      return Number(a.price) - Number(b.price) || a.name.localeCompare(b.name, 'es')
    case 'price_desc':
      return Number(b.price) - Number(a.price) || a.name.localeCompare(b.name, 'es')
    case 'name':
      return a.name.localeCompare(b.name, 'es')
    case 'recent':
      return new Date(b.createdAt) - new Date(a.createdAt)
    default:
      return 0
  }
}

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

    /**
     * Búsqueda tolerante: "papa" encuentra "pápá" y "PAPA", y los resultados
     * vienen ordenados por relevancia. Antes filtraba con `contains` insensible,
     * que en Ecuador falla con la mitad de lo que la gente escribe.
     */
    if (search) {
      const terminos = terminosBusqueda(String(search))
      // Sin términos útiles ("a", "de") no se filtra: devolver medio catálogo
      // sería peor que no devolver nada.
      if (terminos.length === 0) {
        return res.json({ products: [], total: 0, suggestions: [] })
      }

      /**
       * Coincidencia tolerante a tildes y mayúsculas.
       *
       * `contains` de Prisma resuelve las mayúsculas pero no las tildes: buscar
       * "papa" no encuentra "Papá", y en Ecuador eso pasa a diario. Aquí se usa
       * SQL con `~*` y un patrón que cubre cada vocal con y sin tilde. Todo va
       * parametrizado por Prisma.sql: el texto del usuario nunca se concatena
       * en la consulta.
       */
      const patrones = terminos.map((t) => patronSql(t))
      const campos = [Prisma.sql`p.active = true`]
      if (where.categoryId) campos.push(Prisma.sql`p."categoryId" = ${where.categoryId}`)
      if (featured === 'true') campos.push(Prisma.sql`p.featured = true`)
      // Cada término debe aparecer en algún campo, y todos los términos a la vez.
      for (const pat of patrones) {
        campos.push(Prisma.sql`(COALESCE(p.name,'') ~* ${pat} OR COALESCE(p.description,'') ~* ${pat} OR COALESCE(p.presentation,'') ~* ${pat} OR COALESCE(p.sku,'') ~* ${pat})`)
      }
      const condicion = Prisma.join(campos, ' AND ')

      const filas = await prisma.$queryRaw`
        SELECT p.id FROM "Product" p WHERE ${condicion} LIMIT 2000
      `

      const ids = filas.map((f) => f.id)
      if (ids.length === 0) {
        const sugerencias = await alternativas(where)
        return res.json({ products: [], total: 0, suggestions: sugerencias.map(withImageUrl) })
      }
      // El catálogo se reconstruye desde los ids: el filtrado por tildes no se
      // puede expresar con el ORM, pero la carga de datos sí.
      const encontrados = await prisma.product.findMany({
        where: { id: { in: ids } },
        include: { category: { select: { id: true, name: true, slug: true } } },
      })

      const limiteFinal = all === 'true' ? 500 : Math.min(Number(limit) || 60, 200)

      // Por relevancia, la puntuación la calcula la aplicación porque requiere
      // normalizar los textos. Con un orden explícito, se respeta el pedido.
      const porRelevancia = !sort || sort === 'relevancia'
      let ordenados = encontrados
      if (porRelevancia) {
        ordenados = encontrados
          .map((p) => ({ p, score: puntuarProducto(p, terminos) }))
          .filter((x) => x.score >= 0)
          .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'es'))
          .slice(0, limiteFinal)
          .map((x) => x.p)
      } else {
        ordenados = [...encontrados]
          .sort((a, b) => ordenarPor(a, b, sort))
          .slice(0, limiteFinal)
      }

      if (ordenados.length === 0) {
        const sugerencias = await alternativas(where)
        return res.json({ products: [], total: 0, suggestions: sugerencias.map(withImageUrl) })
      }
      return res.json({ products: ordenados.map(withImageUrl), total: ordenados.length, suggestions: [] })
    }

    /**
     * El checkout llama a este endpoint con all=true para reconciliar el carrito
     * con los precios reales. Sin ese parámetro se limita a 60 productos, así que
     * un carrito con artículos que no caen en la primera página se quedaría sin
     * actualizar tras un cambio de precio.
     */
    const toma = all === 'true' ? 500 : Math.min(Number(limit) || 60, 200)

    const products = await prisma.product.findMany({
      where,
      orderBy:
        sort === 'price_asc'
          ? { price: 'asc' }
          : sort === 'price_desc'
            ? { price: 'desc' }
            : sort === 'name'
              ? { name: 'asc' }
              : { createdAt: 'desc' },
      take: toma,
      include: { category: { select: { id: true, name: true, slug: true } } },
    })

    // Sin resultados de una búsqueda, se ofrecen alternativas en lugar de dejar
    // al cliente en una página muerta.
    let sugerencias = []
    if (search && products.length === 0) {
      sugerencias = await alternativas(where)
    }

    res.json({
      products: products.map(withImageUrl),
      total: products.length,
      suggestions: sugerencias.map(withImageUrl),
    })
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
