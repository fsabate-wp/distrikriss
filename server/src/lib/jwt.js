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

export function refreshCookieOptions(path = '/') {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path,
  }
}
