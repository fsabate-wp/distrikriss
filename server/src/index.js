import { config } from './config.js'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'
import { startInvoicingWorker, stopInvoicingWorker, runInvoicingSweep } from './lib/sri/jobs.js'
import { ensureSlotLocks } from './lib/delivery.js'
import { ensureOrderCodeSequence } from './routes/orders.routes.js'
import { canIssueInvoice, invoicingHealthReport } from './lib/sri/index.js'
import { inspectCertificate } from './lib/sri/cert.js'

async function bootstrap() {
  await prisma.$connect()
  console.log('[db] conectado a PostgreSQL')

  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!settings) {
    console.warn('[db] no hay Settings; ejecuta `npm run prisma:seed` para inicializar los datos')
  }

  // El contador de códigos y las filas de bloqueo de horarios se siembran al
  // arrancar. Así, tras restaurar una copia de la base de datos o migrar, no se
  // repite ningún código ya emitido ni se sobrevende el primer horario.
  try {
    await ensureOrderCodeSequence()
    const locks = await ensureSlotLocks()
    if (locks) console.log(`[entrega] ${locks} filas de bloqueo de horarios creadas`)
  } catch (err) {
    console.error('[arranque] no se pudieron sembrar los secuenciales:', err?.message || err)
  }

  const app = createApp()
  const server = app.listen(config.port, () => {
    console.log(`[api] escuchando en http://localhost:${config.port}`)
  })

  if (settings?.sriEnabled) {
    startInvoicingWorker()
    await reportSriHealth(settings)
  }

  const shutdown = (signal) => {
    console.log(`[api] ${signal} recibido, cerrando...`)
    stopInvoicingWorker()
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0))
    })
    // Si alguna conexion se queda colgada, no se bloquea el reinicio.
    setTimeout(() => process.exit(0), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

/**
 * Avisa del estado fiscal al arrancar, sin impedir la operacion.
 *
 * Un negocio que todavia no factura arranca igual: esto solo informa. Si la
 * facturacion esta activa pero incompleta, el aviso va al log para que el
 * operador lo vea al desplegar.
 */
async function reportSriHealth(settings) {
  const certificate = inspectCertificate(settings)
  if (!canIssueInvoice(settings)) {
    console.warn('[sri] facturación activada pero incompleta: no se podrán emitir comprobantes')
    return
  }
  if (!certificate.ok) {
    console.warn(`[sri] certificado no disponible: ${certificate.error}`)
    return
  }
  if (!certificate.rucMatches) {
    console.error(
      `[sri] el RUC del certificado (${certificate.rucInCertificate}) no coincide con el configurado (${settings.ruc})`,
    )
  }
  if (certificate.expiringSoon) {
    console.warn(
      `[sri] el certificado vence en ${certificate.daysLeft} días (${certificate.notAfter.slice(0, 10)}). ` +
        'Renuevalo pronto o la facturación se detendrá.',
    )
  }
  if (Number(settings.sriEnvironment) !== 1) {
    console.log('[sri] ambiente de PRUEBAS: los comprobantes no tienen validez tributaria')
  }

  const report = await invoicingHealthReport()
  const sinResolver = report.stuck.length
  if (sinResolver) {
    console.warn(`[sri] ${sinResolver} comprobante(s) a la espera de autorización`)
    runInvoicingSweep()
  }
}

bootstrap().catch((err) => {
  console.error('[api] error al iniciar:', err)
  process.exit(1)
})
