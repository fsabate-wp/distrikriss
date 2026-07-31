import { verifyAccessToken } from '../lib/jwt.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : req.cookies?.access_token
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' })
  }
  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role }
    return next()
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'No autorizado' })
  }
  return next()
}
