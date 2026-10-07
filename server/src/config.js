import 'dotenv/config'
import crypto from 'node:crypto'

const DEFAULTS = {
  port: 4000,
  nodeEnv: 'development',
  jwtSecret: 'dev-secret',
  jwtRefreshSecret: 'dev-refresh-secret',
  accessTtl: '7d',
  refreshTtl: '30d',
  adminPassword: 'distrikriss-admin',
}

export const config = {
  port: Number(process.env.PORT) || DEFAULTS.port,
  nodeEnv: process.env.NODE_ENV || DEFAULTS.nodeEnv,
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET || DEFAULTS.jwtSecret,
    refreshSecret: process.env.JWT_REFRESH_SECRET || DEFAULTS.jwtRefreshSecret,
    accessTtl: process.env.ACCESS_TOKEN_TTL || DEFAULTS.accessTtl,
    refreshTtl: process.env.REFRESH_TOKEN_TTL || DEFAULTS.refreshTtl,
  },
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:4000',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  landingUrl: process.env.LANDING_URL || 'http://localhost:5174',
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL || 'admin@distrikriss.com',
    password: process.env.ADMIN_PASSWORD || DEFAULTS.adminPassword,
    phone: process.env.ADMIN_PHONE || '0959841957',
  },
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    baseUrl: process.env.WHATSAPP_BASE_URL || '',
    apiKey: process.env.WHATSAPP_API_KEY || '',
    sessionId: process.env.WHATSAPP_SESSION_ID || '',
    countryCode: process.env.WHATSAPP_COUNTRY_CODE || '593',
  },
  sri: {
    // Clave con la que se cifra en reposo la contraseña del certificado .p12.
    certSecret: process.env.SRI_CERT_SECRET || '',
    // Milisegundos que se espera entre consulta y reintento al pedir autorizaciones.
    authorizationPollMs: Number(process.env.SRI_AUTH_POLL_MS) || 4000,
    authorizationPollAttempts: Number(process.env.SRI_AUTH_POLL_ATTEMPTS) || 8,
    // Backoff del worker de reintentos.
    retryBaseMs: Number(process.env.SRI_RETRY_BASE_MS) || 60_000,
    retryMaxMs: Number(process.env.SRI_RETRY_MAX_MS) || 6 * 60 * 60 * 1000,
    maxAttempts: Number(process.env.SRI_MAX_ATTEMPTS) || 12,
    jobIntervalMs: Number(process.env.SRI_JOB_INTERVAL_MS) || 30_000,
    soapTimeoutMs: Number(process.env.SRI_SOAP_TIMEOUT_MS) || 20_000,
  },
}

/**
 * Secretos que, en produccion, no pueden seguir con su valor por defecto.
 *
 * Solo se comprueban los que protegen el acceso al sistema. Con JWT_SECRET en
 * 'dev-secret' un atacante podria firmar su propio token de ADMIN y controlar la
 * emision de facturas, asi que eso si es un fallo de arranque.
 *
 * SRI_CERT_SECRET NO se comprueba aqui a proposito: es la clave con la que se
 * cifra la contrasena del certificado .p12, no la credencial del SRI. Un negocio
 * que todavia no factura no la necesita, y bloquearle el arranque por una
 * variable que no usa seria impedirle vender. Se valida en el momento de
 * guardar la contrasa, que es cuando de verdad hace falta.
 */
function assertProductionSecrets() {
  if (!config.isProd) return
  const problems = []
  if (config.jwt.secret === DEFAULTS.jwtSecret) problems.push('JWT_SECRET')
  if (config.jwt.refreshSecret === DEFAULTS.jwtRefreshSecret) problems.push('JWT_REFRESH_SECRET')
  if (config.admin.password === DEFAULTS.adminPassword) problems.push('ADMIN_PASSWORD')
  if (problems.length) {
    throw new Error(
      `Configuracion insegura en produccion. Define o cambia estas variables: ${problems.join(', ')}. ` +
        'Genera secretos con: openssl rand -hex 32',
    )
  }
}

if (process.env.NODE_ENV === 'production') {
  assertProductionSecrets()
}

/** Origenes permitidos, normalizados para comparar contra el header Origin. */
export function allowedOrigins() {
  return [config.appUrl, config.landingUrl]
    .filter(Boolean)
    .map((o) => o.replace(/\/$/, '').toLowerCase())
}

export function isOriginAllowed(origin) {
  if (!origin) return false
  return allowedOrigins().includes(String(origin).replace(/\/$/, '').toLowerCase())
}

/** Origenes de la peticion, para las respuestas y la auditoria. */
export function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || null
}

export { crypto }
