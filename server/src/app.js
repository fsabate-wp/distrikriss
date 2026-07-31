import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import authRoutes from './routes/auth.routes.js'
import catalogRoutes from './routes/catalog.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import addressesRoutes from './routes/addresses.routes.js'
import deliveryRoutes from './routes/delivery.routes.js'
import ordersRoutes from './routes/orders.routes.js'
import adminRoutes from './routes/admin.routes.js'
import pushRoutes from './routes/push.routes.js'
import { errorHandler, notFound } from './middleware/error.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(
    cors({
      origin: [config.appUrl, config.landingUrl],
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())

  app.use('/uploads', express.static(path.join(__dirname, '../public')))

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'distrikriss-api' }))

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
