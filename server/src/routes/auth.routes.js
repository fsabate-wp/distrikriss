import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshCookieOptions,
} from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  role: user.role,
})

const registerSchema = z.object({
  name: z.string().min(2, 'Nombre muy corto').max(120),
  phone: z.string().min(7, 'Teléfono inválido').max(20),
  email: z.string().email('Email inválido').max(120).optional().or(z.literal('')),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100),
})

const loginSchema = z.object({
  identifier: z.string().min(3).max(120),
  password: z.string().min(1).max(100),
})

function setAuthCookies(res, user) {
  res.cookie('refresh_token', signRefreshToken(user), refreshCookieOptions('/api/auth'))
  res.cookie('access_token', signAccessToken(user), {
    ...refreshCookieOptions('/'),
    maxAge: 15 * 60 * 1000,
  })
}

router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body)
    const phone = data.phone.trim()
    const email = data.email?.trim() || null

    const existing = await prisma.user.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    })
    if (existing) {
      const field = existing.phone === phone ? 'phone' : 'email'
      return res.status(409).json({ error: 'El teléfono o email ya está registrado', field })
    }

    const passwordHash = await bcrypt.hash(data.password, 10)
    const user = await prisma.user.create({
      data: { name: data.name.trim(), phone, email, passwordHash, role: 'CLIENT' },
    })

    setAuthCookies(res, user)
    res.status(201).json({ user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password } = loginSchema.parse(req.body)
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }] },
    })
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }
    setAuthCookies(res, user)
    res.json({ user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token
    if (!token) {
      return res.status(401).json({ error: 'No hay sesión' })
    }
    const payload = verifyRefreshToken(token)
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Sesión inválida' })
    }
    setAuthCookies(res, user)
    res.json({ user: publicUser(user) })
  } catch {
    res.status(401).json({ error: 'Sesión expirada, inicia sesión de nuevo' })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('refresh_token', refreshCookieOptions('/api/auth'))
  res.clearCookie('access_token', refreshCookieOptions('/'))
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { addresses: { orderBy: { createdAt: 'desc' } } },
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({ user: { ...publicUser(user), addresses: user.addresses } })
  } catch (err) {
    next(err)
  }
})

export default router
