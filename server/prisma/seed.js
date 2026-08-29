import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const STORE = {
  name: process.env.ADMIN_NAME || 'Administrador',
  email: process.env.ADMIN_EMAIL || 'admin@distrikriss.com',
  password: process.env.ADMIN_PASSWORD || 'distrikriss-admin',
  phone: process.env.ADMIN_PHONE || '0959841957',
}

const settings = {
  storeName: 'DistriKriss',
  accentColor: '#1B5E20',
  storeOpen: true,
  faviconUrl: '',
  appIconUrl: '',
  currency: 'USD',
  phone: '095 984 1957',
  whatsapp: '593959841957',
  email: 'distrikriss@example.com',
  storeAddress: 'Cdla. Guangala villa 24 Mz. E7, Guayaquil',
  storeLat: -2.228329,
  storeLng: -79.900772,
  deliveryRadiusKm: 8,
  deliveryFeeBase: 1.5,
  deliveryFeePerKm: 0.25,
  minOrderAmount: 5,
  orderCutoff: '18:00',
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  openHours: {
    0: { open: '07:00', close: '18:00', closed: false },
    1: { open: '07:00', close: '18:00', closed: false },
    2: { open: '07:00', close: '18:00', closed: false },
    3: { open: '07:00', close: '18:00', closed: false },
    4: { open: '07:00', close: '18:00', closed: false },
    5: { open: '07:00', close: '18:00', closed: false },
    6: { open: '07:00', close: '18:00', closed: false },
  },
  slots: [
    { id: 'morning', label: 'Mañana (08:00 - 12:00)', start: '08:00', end: '12:00', capacity: 20 },
    { id: 'afternoon', label: 'Tarde (13:00 - 18:00)', start: '13:00', end: '18:00', capacity: 20 },
  ],
  bankTransfer: {
    bank: 'Banco Pichincha',
    accountName: 'DistriKriss',
    accountNumber: '2200000000',
    accountType: 'Ahorros',
    note: 'Envía el comprobante por WhatsApp para confirmar tu pedido.',
  },
}

// New catalog from CSV if exists
const slugify = (str) =>
  str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function parseCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '')
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const skuIdx = header.indexOf('sku')
  const prodIdx = header.indexOf('productos')
  const unidadIdx = header.indexOf('unidad')
  const minimoIdx = header.indexOf('minimo')
  const presentIdx = header.findIndex(h => h.includes('prsent') || h.includes('present'))
  const precioIdx = header.indexOf('precio')
  let currentCategory = null
  const items = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    const skuRaw = cols[skuIdx]?.trim() || ''
    const nameRaw = cols[prodIdx]?.trim() || ''
    const unidadRaw = cols[unidadIdx]?.trim() || ''
    const minimoRaw = cols[minimoIdx]?.trim() || ''
    const presentRaw = cols[presentIdx]?.trim() || ''
    const precioRaw = cols[precioIdx]?.trim() || ''
    if (!skuRaw && !unidadRaw && nameRaw) { currentCategory = nameRaw; continue }
    if (!nameRaw || !currentCategory) continue
    let unit = unidadRaw || 'Unidad'
    if (/^unida$/i.test(unitRaw)) unit = 'Unidad'
    unit = unit.trim()
    let minQuantity = parseFloat(minimoRaw.replace(',', '.'))
    if (!Number.isFinite(minQuantity) || minQuantity <= 0) minQuantity = 1
    let price = parseFloat(precioRaw.replace(',', '.'))
    if (!Number.isFinite(price) || price < 0) price = 1
    const presentation = presentRaw ? presentRaw.trim() : null
    let stepQuantity = 1
    const unitLower = unit.toLowerCase()
    if (unitLower === 'gramos') stepQuantity = minQuantity
    else if (unitLower === 'kilo') stepQuantity = 1
    else stepQuantity = 1
    items.push({ sku: skuRaw || null, name: nameRaw, slug: slugify(nameRaw), unit, presentation, minQuantity, stepQuantity, price, categoryName: currentCategory })
  }
  return items
}

function getCategorySlug(name) {
  const lower = name.toLowerCase().trim()
  if (lower.includes('legumbre')) return 'legumbres'
  if (lower.includes('monte')) return 'montes'
  if (lower.includes('grano')) return 'granos'
  if (lower.includes('fruta')) return 'frutas'
  return slugify(name)
}

const legacyCategories = [
  { name: 'Frutas', slug: 'frutas', imageUrl: '/uploads/imgs/frutas.webp', sortOrder: 1 },
  { name: 'Legumbres', slug: 'legumbres', imageUrl: '/uploads/imgs/legumbres.webp', sortOrder: 2 },
  { name: 'Lácteos', slug: 'lacteos', imageUrl: '/uploads/imgs/lacteo.webp', sortOrder: 3 },
  { name: 'Pollos', slug: 'pollos', imageUrl: '/uploads/imgs/polllo.webp', sortOrder: 4 },
  { name: 'Carnes', slug: 'carnes', imageUrl: '/uploads/imgs/carnes.webp', sortOrder: 5 },
  { name: 'Embutidos', slug: 'embutidos', imageUrl: '/uploads/imgs/embutidis.webp', sortOrder: 6 },
  { name: 'Abastos', slug: 'abastos', imageUrl: '/uploads/imgs/abasto.webp', sortOrder: 7 },
  { name: 'Plásticos', slug: 'plasticos', imageUrl: '/uploads/imgs/plasticos.webp', sortOrder: 8 },
]

const legacyProducts = [
  { name: 'Banano (cabeza)', slug: 'banano-cabeza', unit: 'cabeza', price: 2.5, category: 'frutas', description: 'Cabeza de banano ecuatoriano seleccionado.', featured: true },
  { name: 'Manzana Roja', slug: 'manzana-roja', unit: 'lb', price: 1.6, category: 'frutas', description: 'Manzana roja fresca importada.' },
]

async function main() {
  console.log('-> seed: admin')
  const passwordHash = await bcrypt.hash(STORE.password, 10)
  const admin = await prisma.user.upsert({
    where: { phone: STORE.phone },
    update: {},
    create: { name: STORE.name, phone: STORE.phone, email: STORE.email, passwordHash, role: 'ADMIN' },
  })
  console.log(`   admin listo (${admin.phone})`)

  console.log('-> seed: settings')
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...settings } })
  console.log('   settings listos')

  const csvPath = path.join(__dirname, 'nuevos-productos.csv')
  let categories = []
  let products = []
  let useCSV = fs.existsSync(csvPath)

  if (useCSV) {
    const parsed = parseCSV(csvPath)
    console.log(`-> usando CSV: ${parsed.length} productos`)
    const catDefs = [
      { name: 'Legumbres', slug: 'legumbres', sortOrder: 1 },
      { name: 'Montes', slug: 'montes', sortOrder: 2 },
      { name: 'Granos', slug: 'granos', sortOrder: 3 },
      { name: 'Frutas', slug: 'frutas', sortOrder: 4 },
    ]
    categories = catDefs
    // map to product create data later
    products = parsed
  } else {
    categories = legacyCategories
    products = legacyProducts
  }

  console.log('-> seed: categorías')
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: { name: cat.name }, create: cat })
  }
  const cats = await prisma.category.findMany()
  const catBySlug = Object.fromEntries(cats.map(c => [c.slug, c.id]))

  console.log('-> seed: productos')
  if (useCSV) {
    const slugSeen = new Set()
    for (const p of products) {
      let slug = p.slug
      let base = slug; let i = 1
      while (slugSeen.has(slug)) slug = `${base}-${i++}`
      slugSeen.add(slug)
      const catSlug = getCategorySlug(p.categoryName)
      await prisma.product.upsert({
        where: { slug },
        update: {},
        create: {
          sku: p.sku,
          name: p.name,
          slug,
          unit: p.unit,
          presentation: p.presentation,
          minQuantity: p.minQuantity,
          stepQuantity: p.stepQuantity,
          price: p.price,
          description: p.presentation ? `Presentación: ${p.presentation}` : null,
          categoryId: catBySlug[catSlug],
          featured: false,
          stock: -1,
          imageUrl: null,
        }
      })
    }
  } else {
    for (const p of products) {
      await prisma.product.upsert({
        where: { slug: p.slug },
        update: {},
        create: {
          name: p.name, slug: p.slug, unit: p.unit, price: p.price,
          description: p.description, categoryId: catBySlug[p.category],
          featured: p.featured || false, imageUrl: null,
          minQuantity: 1, stepQuantity: 1, presentation: null, stock: -1
        }
      })
    }
  }

  const counts = await Promise.all([prisma.user.count(), prisma.category.count(), prisma.product.count()])
  console.log(`-> seed completo: users=${counts[0]} categorías=${counts[1]} productos=${counts[2]}`)
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>{await prisma.$disconnect()})
