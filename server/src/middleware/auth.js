import { verifyAccessToken } from '../lib/jwt.js'
import { prisma } from '../lib/prisma.js'
import { isOriginAllowed, requestIp } from '../config.js'

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

/**
 * Exige rol de administrador Y que la cuenta siga activa.
 *
 * Antes solo se miraba el rol que viene dentro del JWT, que dura 7 dias. Un
 * administrador desactivado por robo de credenciales conservaba el control
 * total de la emision de facturas durante toda la vida del token.
 */
export async function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'No autorizado' })
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { active: true, role: true },
    })
    if (!user || !user.active || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'La cuenta ya no tiene acceso' })
    }
    return next()
  } catch (err) {
    return next(err)
  }
}

/**
 * Proteccion CSRF por verificacion de Origin.
 *
 * La API autentica con cookies y en produccion usa SameSite=None (la app y la
 * API estan en dominios distintos), asi que SameSite no protege nada: cualquier
 * sitio podria disparar un PUT /admin/settings y cambiar el RUC del negocio.
 *
 * Un header Origin o Referer que no este en la lista blanca se rechaza antes de
 * tocar la base de datos. Los clientes no navegador (Bearer) se saltan esta
 * comprobacion porque no dependen de cookies.
 */
export function requireTrustedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()

  // Solo las peticiones que se autentican con cookie necesitan esta comprobacion.
  // Con un token Bearer el navegador no puede adjuntar el header Authorization
  // sin que CORS se lo autorice, asi que no hay riesgo de cruce de sitio.
  const token = req.headers.authorization
  if (token?.startsWith('Bearer ')) return next()

  const origin = req.headers.origin
  if (origin) {
    if (!isOriginAllowed(origin)) {
      return res.status(403).json({ error: 'Origen no permitido' })
    }
    // El Origin manda y ya es una prueba suficiente: si el navegador lo envía, es
    // porque lo ha puesto el propio navegador y no el atacante. Por eso un
    // Referer de otro sitio (cabecera controlable desde JS en algunos contextos)
    // no debe invalidar un Origin legitimo, o se romperia la app.
    return next()
  }

  // Sin Origin: algunos clientes lo omiten (peticiones directas, apps moviles).
  // Se acepta solo si no hay Referer o si el Referer es de un origen permitido.
  // Un formulario cross-site siempre envia Referer, asi que sigue cubierto.
  const referer = req.headers.referer
  if (!referer) return next()
  try {
    const refererOrigin = new URL(referer).origin
    if (!isOriginAllowed(refererOrigin)) {
      return res.status(403).json({ error: 'Origen no permitido' })
    }
  } catch {
    return res.status(403).json({ error: 'Referer inválido' })
  }
  return next()
}

/**
 * Autenticación reforzada para acciones fiscales sensibles (cambiar RUC,
 * ambiente, certificado, emitir notas de crédito).
 *
 * Exige que el administrador vuelva a escribir su contraseña en los últimos
 * minutos. Sin esto, un token robado basta para redirigir toda la facturación
 * del negocio hacia otro ambiente o RUC.
 */
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000

export function requireStepUp(req, res, next) {
  const verifiedAt = Number(req.get?.('x-sri-verified-at'))
  const nonce = req.get?.('x-sri-step-up')
  if (!verifiedAt || !nonce) {
    return res.status(428).json({
      error: 'Esta operación requiere volver a confirmar tu contraseña',
      code: 'STEP_UP_REQUIRED',
    })
  }
  if (Date.now() - verifiedAt > STEP_UP_WINDOW_MS) {
    return res.status(428).json({
      error: 'La confirmación expiró. Vuelve a confirmar tu contraseña.',
      code: 'STEP_UP_REQUIRED',
    })
  }
  return next()
}

/** Todo lo que el panel de administración no debe cachear ni guardar. */
export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return next()
}

/**
 * Limitador de peticiones en memoria. Suficiente para un despliegue de un solo
 * proceso; con varias instancias habria que moverlo a Redis.
 */
export function rateLimit({ windowMs = 60_000, max = 60, message = 'Demasiadas solicitudes, espera un momento' } = {}) {
  const hits = new Map()

  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key)
    }
  }, windowMs)
  sweep.unref?.()

  const middleware = (req, res, next) => {
    // Detras de un proxy, req.ip ya es la del cliente si hay trust proxy bien
    // configurado; si no, se cae al socket para no agrupar a todos en "::1".
    const key = requestIp(req) || 'desconocido'
    const now = Date.now()
    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(key, entry)
    }
    entry.count += 1
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({ error: message, retryAfter })
    }
    return next()
  }
  middleware.reset = () => hits.clear()
  return middleware
}

/** Límites por endpoint, para que un reintento no agote la cuota del SRI. */
export const limits = {
  login: rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Demasiados intentos de acceso. Espera 15 minutos.' }),
  register: rateLimit({ windowMs: 60 * 60_000, max: 10, message: 'Demasiados registros desde esta conexión.' }),
  sriTest: rateLimit({ windowMs: 60_000, max: 6, message: 'Demasiadas pruebas de conexión con el SRI.' }),
  invoiceRetry: rateLimit({ windowMs: 5 * 60_000, max: 20, message: 'Demasiados reintentos. Espera unos minutos.' }),
  invoiceWrite: rateLimit({ windowMs: 60 * 60_000, max: 60, message: 'Demasiadas operaciones fiscales en poco tiempo.' }),
  certificateUpload: rateLimit({ windowMs: 60 * 60_000, max: 10, message: 'Demasiadas subidas de certificado.' }),
  checkout: rateLimit({ windowMs: 60_000, max: 30, message: 'Demasiados pedidos en poco tiempo.' }),
  stepUp: rateLimit({ windowMs: 10 * 60_000, max: 8, message: 'Demasiadas confirmaciones de contraseña.' }),
}
