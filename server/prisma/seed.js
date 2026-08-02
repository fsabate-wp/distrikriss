import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

const STORE = {
  name: process.env.ADMIN_NAME || 'Administrador',
  email: process.env.ADMIN_EMAIL || 'admin@distrikriss.com',
  password: process.env.ADMIN_PASSWORD || 'distrikriss-admin',
  phone: process.env.ADMIN_PHONE || '0959841957',
}

const categories = [
  { name: 'Frutas', slug: 'frutas', imageUrl: '/uploads/imgs/frutas.webp', sortOrder: 1 },
  { name: 'Legumbres', slug: 'legumbres', imageUrl: '/uploads/imgs/legumbres.webp', sortOrder: 2 },
  { name: 'Lácteos', slug: 'lacteos', imageUrl: '/uploads/imgs/lacteo.webp', sortOrder: 3 },
  { name: 'Pollos', slug: 'pollos', imageUrl: '/uploads/imgs/polllo.webp', sortOrder: 4 },
  { name: 'Carnes', slug: 'carnes', imageUrl: '/uploads/imgs/carnes.webp', sortOrder: 5 },
  { name: 'Embutidos', slug: 'embutidos', imageUrl: '/uploads/imgs/embutidis.webp', sortOrder: 6 },
  { name: 'Abastos', slug: 'abastos', imageUrl: '/uploads/imgs/abasto.webp', sortOrder: 7 },
  { name: 'Plásticos', slug: 'plasticos', imageUrl: '/uploads/imgs/plasticos.webp', sortOrder: 8 },
]

const products = [
  { name: 'Banano (cabeza)', slug: 'banano-cabeza', unit: 'cabeza', price: 2.5, category: 'frutas', description: 'Cabeza de banano ecuatoriano seleccionado.' },
  { name: 'Manzana Roja', slug: 'manzana-roja', unit: 'lb', price: 1.6, category: 'frutas', description: 'Manzana roja fresca importada.' },
  { name: 'Naranja', slug: 'naranja', unit: 'lb', price: 0.9, category: 'frutas', description: 'Naranja jugosa nacional.' },
  { name: 'Papaya', slug: 'papaya', unit: 'unidad', price: 2.0, category: 'frutas', description: 'Papaya madura lista para servir.' },
  { name: 'Arroz', slug: 'arroz', unit: '5 lb', price: 5.75, category: 'legumbres', description: 'Arroz nacional granillo (fundita 5 lb).' },
  { name: 'Fréjol Canario', slug: 'frejol-canario', unit: 'lb', price: 2.2, category: 'legumbres', description: 'Fréjol canario nacional.' },
  { name: 'Lenteja', slug: 'lenteja', unit: 'lb', price: 1.4, category: 'legumbres', description: 'Lenteja roja de primera.' },
  { name: 'Maíz suave', slug: 'maiz-suave', unit: 'lb', price: 1.1, category: 'legumbres', description: 'Maíz suave tierno.' },
  { name: 'Leche entera', slug: 'leche-entera', unit: 'litro', price: 1.15, category: 'lacteos', description: 'Leche entera pasteurizada.' },
  { name: 'Queso fresco', slug: 'queso-fresco', unit: 'lb', price: 3.5, category: 'lacteos', description: 'Queso fresco artesanal.' },
  { name: 'Yogurt natural', slug: 'yogurt-natural', unit: '1 L', price: 2.8, category: 'lacteos', description: 'Yogurt natural sin azúcar.' },
  { name: 'Pollo entero', slug: 'pollo-entero', unit: 'lb', price: 2.4, category: 'pollos', description: 'Pollo entero eviscerado de granja.' },
  { name: 'Pechuga de pollo', slug: 'pechuga-pollo', unit: 'lb', price: 3.0, category: 'pollos', description: 'Pechuga de pollo sin hueso.' },
  { name: 'Pollo trozado', slug: 'pollo-trozado', unit: 'lb', price: 2.5, category: 'pollos', description: 'Pollo trozado en presas.' },
  { name: 'Carne de res molida', slug: 'carne-res-molida', unit: 'lb', price: 3.8, category: 'carnes', description: 'Carne de res molida de primera.' },
  { name: 'Carne de cerdo', slug: 'carne-cerdo', unit: 'lb', price: 3.2, category: 'carnes', description: 'Carne de cerdo para menestra.' },
  { name: 'Costilla de res', slug: 'costilla-res', unit: 'lb', price: 3.5, category: 'carnes', description: 'Costilla de res nacional.' },
  { name: 'Salchicha', slug: 'salchicha', unit: 'lb', price: 2.1, category: 'embutidos', description: 'Salchicha de primera.' },
  { name: 'Mortadela', slug: 'mortadela', unit: 'lb', price: 2.3, category: 'embutidos', description: 'Mortadela ahumada.' },
  { name: 'Jamón', slug: 'jamon', unit: 'lb', price: 3.4, category: 'embutidos', description: 'Jamón de cerdo.' },
  { name: 'Aceite vegetal', slug: 'aceite-vegetal', unit: '1 L', price: 3.1, category: 'abastos', description: 'Aceite vegetal comestible.' },
  { name: 'Azúcar', slug: 'azucar', unit: '5 lb', price: 4.1, category: 'abastos', description: 'Azúcar blanca granulada.' },
  { name: 'Sal', slug: 'sal', unit: '1 lb', price: 0.4, category: 'abastos', description: 'Sal refinada.' },
  { name: 'Fundas plásticas', slug: 'fundas-plasticas', unit: 'paquete', price: 1.8, category: 'plasticos', description: 'Paquete de fundas de mercado.' },
  { name: 'Vasos desechables', slug: 'vasos-desechables', unit: 'paquete', price: 2.5, category: 'plasticos', description: 'Vasos desechables de 7 oz (50 und).' },
]

const settings = {
  storeName: 'DistriKriss',
  accentColor: '#1B5E20',
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

async function main() {
  console.log('-> seed: admin')
  const passwordHash = await bcrypt.hash(STORE.password, 10)
  const admin = await prisma.user.upsert({
    where: { phone: STORE.phone },
    update: {},
    create: {
      name: STORE.name,
      phone: STORE.phone,
      email: STORE.email,
      passwordHash,
      role: 'ADMIN',
    },
  })
  console.log(`   admin listo (${admin.phone})`)

  console.log('-> seed: settings')
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...settings },
  })
  console.log('   settings listos')

  console.log('-> seed: categorías')
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { imageUrl: cat.imageUrl },
      create: cat,
    })
  }
  const cats = await prisma.category.findMany()

  console.log('-> seed: productos')
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]))
  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        unit: p.unit,
        price: p.price,
        description: p.description,
        categoryId: catBySlug[p.category],
        imageUrl: null,
      },
    })
  }

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.product.count(),
  ])
  console.log(`-> seed completo: users=${counts[0]} categorías=${counts[1]} productos=${counts[2]}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
