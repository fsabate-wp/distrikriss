import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config, allowedOrigins, isOriginAllowed } from './config.js'
import authRoutes from './routes/auth.routes.js'
import catalogRoutes from './routes/catalog.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import addressesRoutes from './routes/addresses.routes.js'
import deliveryRoutes from './routes/delivery.routes.js'
import ordersRoutes from './routes/orders.routes.js'
import adminRoutes from './routes/admin.routes.js'
import pushRoutes from './routes/push.routes.js'
import { errorHandler, notFound } from './middleware/error.js'
import { requireTrustedOrigin } from './middleware/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  // Detras de un proxy inverso, req.ip debe ser la del cliente real: de lo
  // contrario los limitadores de peticiones agruparian a todos los usuarios en
  // una sola direccion y bloquearian el servicio entero.
  app.set('trust proxy', config.isProd ? 1 : false)
  app.disable('x-powered-by')

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", ...allowedOrigins()],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  )

  app.use(
    cors({
      // Un origen desconocido se rechaza con 403 en vez de lanzar un error: el
      // error de CORS se convertia en un 500 que no explica nada al cliente.
      // Además, no se reflecteja el origen conocido: se compara con la lista.
      origin(origin, callback) {
        if (!origin || isOriginAllowed(origin)) return callback(null, true)
        return callback(null, false)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-SRI-Verified-At', 'X-SRI-Step-Up'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())

  app.use('/uploads', express.static(path.join(__dirname, '../public'), { index: false, dotfiles: 'deny' }))

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'distrikriss-api' }))

  // Origen confiable para todo lo que modifica estado y usa cookies.
  // Va DESPUÉS de CORS: si no, cors.shortcuitea y devuelve 500 antes de que esta
  // comprobación pueda responder con un 403 claro.
  app.use(requireTrustedOrigin)

  app.use('/api/auth', authRoutes)
  app.use('/api/catalog', catalogRoutes)
  app.use('/api/settings', settingsRoutes)
  app.use('/api/addresses', addressesRoutes)
  app.use('/api/delivery', deliveryRoutes)
  app.use('/api/orders', ordersRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/push', pushRoutes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
