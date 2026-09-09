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
    { sub: user.id },
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
    secure: config.cookieSecure,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: ttlToMs(config.jwt.accessTtl),
    path,
  }
}

export function refreshCookieOptions(path = '/') {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: ttlToMs(config.jwt.refreshTtl),
    path,
  }
}
