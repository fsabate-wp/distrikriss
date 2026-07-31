import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const addressSchema = z.object({
  label: z.string().min(1, 'Etiqueta requerida').max(80),
  street: z.string().min(2, 'Calle requerida').max(200),
  number: z.string().max(30).optional().or(z.literal('')),
  reference: z.string().max(200).optional().or(z.literal('')),
  city: z.string().min(2, 'Ciudad requerida').max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
})

async function getOwn(req, id) {
  return prisma.address.findFirst({ where: { id, userId: req.user.id } })
}

async function clearDefault(userId, exceptId = null) {
  await prisma.address.updateMany({
    where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  })
}

router.get('/', async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
    res.json({ addresses })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const data = addressSchema.parse(req.body)
    const count = await prisma.address.count({ where: { userId: req.user.id } })
    const isDefault = count === 0 || !!data.isDefault
    if (isDefault) await clearDefault(req.user.id)
    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        label: data.label,
        street: data.street,
        number: data.number || null,
        reference: data.reference || null,
        city: data.city,
        lat: data.lat,
        lng: data.lng,
        isDefault,
      },
    })
    res.status(201).json({ address })
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await getOwn(req, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Dirección no encontrada' })
    const data = addressSchema.partial().parse(req.body)
    if (data.isDefault) await clearDefault(req.user.id, existing.id)
    const address = await prisma.address.update({
      where: { id: existing.id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.street !== undefined && { street: data.street }),
        ...(data.number !== undefined && { number: data.number || null }),
        ...(data.reference !== undefined && { reference: data.reference || null }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.lat !== undefined && { lat: data.lat }),
        ...(data.lng !== undefined && { lng: data.lng }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    })
    res.json({ address })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/default', async (req, res, next) => {
  try {
    const existing = await getOwn(req, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Dirección no encontrada' })
    await clearDefault(req.user.id)
    const address = await prisma.address.update({
      where: { id: existing.id },
      data: { isDefault: true },
    })
    res.json({ address })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await getOwn(req, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Dirección no encontrada' })
    await prisma.address.delete({ where: { id: existing.id } })
    const remaining = await prisma.address.findFirst({ where: { userId: req.user.id } })
    if (existing.isDefault && remaining) {
      await prisma.address.update({ where: { id: remaining.id }, data: { isDefault: true } })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
