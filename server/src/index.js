import { config } from './config.js'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'

async function bootstrap() {
  await prisma.$connect()
  console.log('[db] conectado a PostgreSQL')

  const hasSettings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!hasSettings) {
    console.warn('[db] no hay Settings; ejecuta `npm run prisma:seed` para inicializar los datos')
  }

  const app = createApp()
  app.listen(config.port, () => {
    console.log(`[api] escuchando en http://localhost:${config.port}`)
  })
}

bootstrap().catch((err) => {
  console.error('[api] error al iniciar:', err)
  process.exit(1)
})
