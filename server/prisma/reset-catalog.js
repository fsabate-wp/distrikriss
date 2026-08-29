import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const slugify = (str) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function parseCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8')
  // Support BOM
  const content = raw.replace(/^\uFEFF/, '')
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  // header: sku,productos,unidad,minimo,prsentacion,precio
  const skuIdx = header.indexOf('sku')
  const prodIdx = header.indexOf('productos')
  const unidadIdx = header.indexOf('unidad')
  const minimoIdx = header.indexOf('minimo')
  const presentIdx = header.findIndex(h => h.includes('prsent') || h.includes('present'))
  const precioIdx = header.indexOf('precio')

  let currentCategory = null
  const items = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Simple CSV split (no quoted commas in this file)
    const cols = line.split(',').map(c => c.trim())
    const skuRaw = cols[skuIdx]?.trim() || ''
    const nameRaw = cols[prodIdx]?.trim() || ''
    const unidadRaw = cols[unidadIdx]?.trim() || ''
    const minimoRaw = cols[minimoIdx]?.trim() || ''
    const presentRaw = cols[presentIdx]?.trim() || ''
    const precioRaw = cols[precioIdx]?.trim() || ''

    // Section headers have empty sku and unidad/minimo empty but name is category like Legumbres, Montes, Granos, Frutas
    if (!skuRaw && !unidadRaw && nameRaw) {
      // category row
      currentCategory = nameRaw
      continue
    }
    if (!nameRaw) continue
    if (!currentCategory) continue // skip until first category

    const sku = skuRaw || null
    const unitRaw = unidadRaw || 'Unidad'
    // normalize unit: "Unida" -> "Unidad"
    let unit = unitRaw
    if (/^unida$/i.test(unitRaw)) unit = 'Unidad'
    // Keep original capitalization but trim: e.g., Kilo, Gramos
    unit = unit.trim()

    let minQuantity = parseFloat(minimoRaw.replace(',', '.'))
    if (!Number.isFinite(minQuantity) || minQuantity <= 0) minQuantity = 1

    let price = parseFloat(precioRaw.replace(',', '.'))
    if (!Number.isFinite(price) || price < 0) price = 1

    const presentation = presentRaw ? presentRaw.trim() : null

    // step logic: Kilo -> 1, Gramos -> minQuantity, else 1
    let stepQuantity = 1
    const unitLower = unit.toLowerCase()
    if (unitLower === 'gramos') stepQuantity = minQuantity
    else if (unitLower === 'kilo') stepQuantity = 1
    else if (unitLower === 'unidad') stepQuantity = 1
    else if (unitLower === 'atado' || unitLower === 'paquete' || unitLower === 'pedazo') stepQuantity = 1
    else stepQuantity = 1

    items.push({
      sku: sku ? String(sku) : null,
      name: nameRaw,
      slug: slugify(nameRaw),
      unit,
      presentation,
      minQuantity,
      stepQuantity,
      price,
      categoryName: currentCategory,
    })
  }
  return items
}

const categoryDefs = [
  { name: 'Legumbres', slug: 'legumbres', sortOrder: 1 },
  { name: 'Montes', slug: 'montes', sortOrder: 2 },
  { name: 'Granos', slug: 'granos', sortOrder: 3 },
  { name: 'Frutas', slug: 'frutas', sortOrder: 4 },
]

function getCategorySlug(name) {
  const lower = name.toLowerCase().trim()
  if (lower.includes('legumbre')) return 'legumbres'
  if (lower.includes('monte')) return 'montes'
  if (lower.includes('grano')) return 'granos'
  if (lower.includes('fruta')) return 'frutas'
  return slugify(name)
}

async function main() {
  const csvPath = path.join(__dirname, 'nuevos-productos.csv')
  if (!fs.existsSync(csvPath)) {
    console.error(`No se encontró ${csvPath}`)
    process.exit(1)
  }
  const parsed = parseCSV(csvPath)
  console.log(`-> parseados ${parsed.length} productos de ${csvPath}`)
  // group by category slug for verification
  const byCat = {}
  for (const p of parsed) {
    const s = getCategorySlug(p.categoryName)
    byCat[s] = (byCat[s] || 0) + 1
  }
  console.log('   por categoría:', byCat)

  console.log('-> reseteando pedidos, facturas, productos y categorías...')
  // order matters due to FK: Invoice, OrderEvent, OrderItem, Order, Product, Category
  await prisma.invoice.deleteMany({})
  await prisma.orderEvent.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
  await prisma.product.deleteMany({})
  await prisma.category.deleteMany({})
  console.log('   tablas limpiadas')

  console.log('-> creando categorías nuevas...')
  const catMap = {}
  for (const def of categoryDefs) {
    const cat = await prisma.category.create({
      data: {
        name: def.name,
        slug: def.slug,
        sortOrder: def.sortOrder,
        active: true,
        imageUrl: null,
      }
    })
    catMap[def.slug] = cat.id
  }
  console.log(`   categorías creadas: ${Object.keys(catMap).join(', ')}`)

  console.log('-> creando productos nuevos...')
  let created = 0
  let skipped = 0
  const slugSeen = new Set()
  for (const p of parsed) {
    let slug = p.slug
    // deduplicate slug if repeated product names (e.g., similar names with spaces)
    let baseSlug = slug
    let idx = 1
    while (slugSeen.has(slug)) {
      slug = `${baseSlug}-${idx++}`
    }
    slugSeen.add(slug)

    const catSlug = getCategorySlug(p.categoryName)
    const categoryId = catMap[catSlug] || null
    if (!categoryId) {
      console.warn(`  ! categoría no encontrada para ${p.name} -> ${p.categoryName}`)
      skipped++
      continue
    }
    try {
      await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          slug,
          price: p.price,
          unit: p.unit,
          presentation: p.presentation,
          minQuantity: p.minQuantity,
          stepQuantity: p.stepQuantity,
          stock: -1,
          active: true,
          featured: false,
          description: p.presentation ? `Presentación: ${p.presentation}` : null,
          categoryId,
        }
      })
      created++
    } catch (err) {
      console.error(`  ! error creando ${p.name}:`, err.message)
      skipped++
    }
  }
  console.log(`   productos creados: ${created} (omitidos: ${skipped})`)

  const counts = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.order.count(),
  ])
  console.log(`-> final: categorías=${counts[0]} productos=${counts[1]} pedidos=${counts[2]}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
