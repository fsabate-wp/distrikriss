import { prisma } from '../prisma.js'
import { config } from '../../config.js'
import { retryPendingInvoices } from './index.js'
import { sendToAdmins } from '../push.js'

/**
 * Worker de facturacion.
 *
 * Antes, una factura que fallaba por un corte de red se quedaba en FAILED para
 * siempre: solo se recuperaba si un humano entraba al panel y pulsaba
 * "Reintentar". Y el bucle de autorizacion vivia dentro del request HTTP,
 * manteniendo la conexion abierta hasta 45 segundos.
 *
 * Aqui la autorizacion se resuelve fuera del request, con reintentos y backoff,
 * y el administrador recibe una notificacion cuando algo queda sin resolver.
 */

let timer = null
let running = false

// Un comprobante que llevo intentos fallidos se avisa una sola vez, para no
// generar una lista de notificaciones identicas.
const notified = new Set()

async function notifyAdminsOnce(key, title, body, url) {
  if (notified.has(key)) return
  notified.add(key)
  try {
    await sendToAdmins({ title, body, url, tag: `sri-${key}` })
  } catch (err) {
    console.error('[sri] no se pudo avisar al administrador:', err?.message || err)
  }
}

export async function runInvoicingSweep() {
  if (running) return { skipped: true }
  running = true
  try {
    const results = await retryPendingInvoices({ limit: 20 })

    const failed = await prisma.invoice.findMany({
      where: { status: { in: ['FAILED', 'REJECTED', 'NOT_AUTHORIZED'] } },
      select: { id: true, number: true, status: true, responseMessage: true, order: { select: { code: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })

    for (const invoice of failed) {
      const detail = (invoice.responseMessage || '').slice(0, 180)
      await notifyAdminsOnce(
        invoice.id,
        `Factura ${invoice.number} sin resolver`,
        `Pedido ${invoice.order?.code || '-'}: ${invoice.status}. ${detail}`,
        `/admin/facturas/${invoice.id}`,
      )
    }

    const stuck = await prisma.invoice.count({
      where: {
        status: { in: ['SIGNED', 'RECEIVED'] },
        nextRetryAt: null,
        updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
    })
    if (stuck > 0) {
      await notifyAdminsOnce(
        'stuck',
        `${stuck} factura(s) sin autorización del SRI`,
        'Hay comprobantes recibidos que el SRI no ha autorizado. Revisa el detalle en el panel.',
        '/admin/facturas',
      )
    }

    return { ...results, pending: failed.length, stuck }
  } catch (err) {
    console.error('[sri] fallo el ciclo del worker:', err?.message || err)
    return { error: String(err?.message || err).slice(0, 300) }
  } finally {
    running = false
  }
}

export function startInvoicingWorker() {
  if (timer) return timer
  const interval = config.sri.jobIntervalMs
  // El primer ciclo espera un poco: si el proceso esta terminando de arrancar,
  // no tiene sentido golpear el SRI de inmediato.
  setTimeout(() => {
    runInvoicingSweep()
  }, Math.min(interval, 10_000)).unref?.()

  timer = setInterval(() => {
    runInvoicingSweep()
  }, interval)
  timer.unref?.()
  console.log(`[sri] worker de facturación activo cada ${Math.round(interval / 1000)}s`)
  return timer
}

export function stopInvoicingWorker() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
