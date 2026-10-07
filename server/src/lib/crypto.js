import crypto from 'node:crypto'
import { config } from '../config.js'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
// v1:base64(iv).base64(tag).base64(ct) -> permite rotar el formato en el futuro.
const PREFIX = 'v1'

let cachedKey = null

/**
 * Clave con la que se cifra la contraseña del certificado .p12.
 *
 * En desarrollo, si no está definida, se deriva una clave fija a partir del
 * secreto de JWT: el certificado es de pruebas y no hay nada real que proteger,
 * así que el sistema funciona sin configuración extra. En producción NO se hace
 * esto: si un despliegue guardara una contraseña con la clave derivada y luego
 * cambiara SRI_CERT_SECRET, el valor quedaría ilegible. Por eso en producción
 * `assertProductionSecrets` garantiza que la variable exista cuando se usa.
 */
function masterKey() {
  if (cachedKey) return cachedKey
  const secret = config.sri.certSecret
  if (!secret) {
    if (config.isProd) {
      throw new Error(
        'Falta SRI_CERT_SECRET, que es necesaria para cifrar la contraseña del certificado de firma. ' +
          'Genera una con: openssl rand -hex 32',
      )
    }
    cachedKey = crypto.scryptSync(config.jwt.secret, 'distrikriss-sri-cert-dev', 32)
    return cachedKey
  }
  // Acepta hex de 32 bytes o cualquier cadena: se deriva con scrypt y una sal fija
  // para no perder el cifrado si alguien pega la clave con espacios.
  const isHex = /^[0-9a-fA-F]{64}$/.test(secret)
  cachedKey = isHex
    ? Buffer.from(secret, 'hex')
    : crypto.scryptSync(secret.trim(), 'distrikriss-sri-cert-v1', 32)
  return cachedKey
}

/** Indica si se puede cifrar sin intervencion manual del operador. */
export function encryptionAvailable() {
  return Boolean(config.sri.certSecret) || !config.isProd
}

/**
 * Cifra un secreto para guardarlo en la base de datos.
 * El resultado es autocontenido: lleva su propio IV y su tag de autenticacion.
 */
export function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return ''
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

/**
 * Descifra un secreto. Lanza si el ciphertext fue alterado (GCM lo detecta), lo
 * que hace que una manipulacion de la base de datos no pase inadvertida.
 */
export function decryptSecret(payload) {
  if (!payload) return ''
  const parts = String(payload).split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('El secreto cifrado tiene un formato desconocido')
  }
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

export function isEncrypted(payload) {
  return typeof payload === 'string' && payload.startsWith(`${PREFIX}.`) && payload.split('.').length === 4
}

/** Compara sin filtrar informacion por tiempo. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8')
  const bufB = Buffer.from(String(b ?? ''), 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/** Huella de un buffer, para vincular una contraseña cifrada a un archivo concreto. */
export function fingerprint(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32)
}
