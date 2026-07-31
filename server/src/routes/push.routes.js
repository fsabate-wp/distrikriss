import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const subscribeSchema = z.object({
  endpoint: z.string().url().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

router.post('/subscribe', async (req, res, next) => {
  try {
    const { endpoint, p256dh, auth } = subscribeSchema.parse(req.body)
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth, userId: req.user.id },
      create: { endpoint, p256dh, auth, userId: req.user.id },
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().min(1) }).parse(req.body)
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
