import { config } from '../../config.js'

/**
 * Margen antes de que el worker tome un comprobante con `nextRetryAt` en null.
 *
 * Un envio en curso deja el comprobante en SIGNED/RECEIVED con `nextRetryAt` en
 * null durante unos segundos (envio + sondeo de autorizacion). Sin margen, el
 * worker podria pisar ese envio; pasado el margen, si sigue en null es que el
 * proceso murio (un despliegue a mitad de envio) y nadie lo va a empujar.
 */
export const STUCK_GRACE_MS = 5 * 60 * 1000

// Estados reanudables: recibido sin resolver, firmado sin enviar, o fallo de red.
const RETRYABLE_STATUSES = ['SIGNED', 'RECEIVED', 'FAILED']

/**
 * Filtro de los comprobantes que el worker de facturacion debe reanudar.
 *
 * `nextRetryAt <= ahora` NO incluye NULL (en SQL, `NULL <= now()` es NULL). Un
 * comprobante que quedo SIGNED o RECEIVED porque el proceso murio entre marcar el
 * estado y fijar el proximo reintento nunca se recuperaba: se quedaba huerfano
 * para siempre aunque el panel lo listara como "sin autorizacion". Aqui si se
 * incluye el caso NULL, con el margen de STUCK_GRACE_MS.
 */
export function pendingRetryWhere(now = new Date()) {
  return {
    status: { in: RETRYABLE_STATUSES },
    retryCount: { lt: config.sri.maxAttempts },
    OR: [
      { nextRetryAt: { lte: now } },
      { nextRetryAt: null, updatedAt: { lt: new Date(now.getTime() - STUCK_GRACE_MS) } },
    ],
  }
}
