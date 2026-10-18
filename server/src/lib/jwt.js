import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl },
  )
}

export function signRefreshToken(user) {
  return jwt.sign(
    // `ver` es la versión de sesión del usuario. Si al verificar no coincide con
    // la de la base, el token fue revocado (cierre de sesión) y ya no vale.
    { sub: user.id, ver: user.tokenVersion ?? 0 },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl },
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret)
}

/**
 * Ticket de confirmación reforzada (step-up).
 *
 * El error original era guardar el nonce solo en el cliente: el servidor aceptaba
 * las cabeceras X-SRI-Verified-At y X-SRI-Step-Up tal cual, asi que con un token
 * robado bastaba enviar un timestamp actual y un nonce inventado para cambiar el
 * RUC, el ambiente o el certificado sin saber la contrasena. Aqui el ticket lo
 * firma el servidor, de modo que no se puede fabricar ni reutilizar para otro
 * usuario, y caduca solo.
 *
 * La clave se deriva de la de refresh para no anadir otra variable obligatoria y
 * para que un ticket de step-up no valga como access ni como refresh token (y al
 * reves): son claves distintas.
 */
const stepUpSecret = crypto.createHmac('sha256', config.jwt.refreshSecret).update('sri-step-up').digest('hex')

export const STEP_UP_TTL = '10m'
const STEP_UP_PURPOSE = 'sri-step-up'

export function signStepUpToken(user) {
  return jwt.sign({ sub: user.id, purpose: STEP_UP_PURPOSE }, stepUpSecret, { expiresIn: STEP_UP_TTL })
}

export function verifyStepUpToken(token) {
  const payload = jwt.verify(token, stepUpSecret)
  if (payload.purpose !== STEP_UP_PURPOSE) throw new Error('Ticket de confirmación inválido')
  return payload
}

function ttlToMs(ttl) {
  if (typeof ttl === 'number') return ttl
  const str = String(ttl).trim()
  const num = Number.parseInt(str.slice(0, -1), 10)
  const unit = str.slice(-1)
  if (Number.isNaN(num)) return 7 * 24 * 60 * 60 * 1000
  if (unit === 'd') return num * 24 * 60 * 60 * 1000
  if (unit === 'h') return num * 60 * 60 * 1000
  if (unit === 'm') return num * 60 * 1000
  if (unit === 's') return num * 1000
  const asNum = Number(str)
  if (!Number.isNaN(asNum)) return asNum
  return 7 * 24 * 60 * 60 * 1000
}

export function accessCookieOptions(path = '/') {
  return {
    httpOnly: true,
    // En producción la cookie va SIEMPRE Secure: con SameSite=None el navegador
    // la exige, y si faltaba COOKIE_SECURE la sesión no funcionaba en silencio.
    secure: config.isProd || config.cookieSecure,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: ttlToMs(config.jwt.accessTtl),
    path,
  }
}

export function refreshCookieOptions(path = '/') {
  return {
    httpOnly: true,
    secure: config.isProd || config.cookieSecure,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: ttlToMs(config.jwt.refreshTtl),
    path,
  }
}
