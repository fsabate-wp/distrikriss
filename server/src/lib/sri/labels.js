/**
 * Etiquetas legibles de los estados del comprobante.
 *
 * El cliente las recibe en la API en lugar de traducirlas en el navegador: así
 * el mismo estado se llama igual en el panel, en el email y en la web, y no
 * depende de que el cliente importe la tabla desde su propio código.
 */
export const INVOICE_STATUS_LABELS = {
  AUTHORIZED: 'Autorizada por el SRI',
  RECEIVED: 'Recibida, pendiente de autorización',
  SIGNED: 'Firmada, pendiente de envío',
  DRAFT: 'Preparada',
  NO_CERTIFICATE: 'Pendiente de configurar el certificado',
  REJECTED: 'Rechazada por el SRI',
  NOT_AUTHORIZED: 'No autorizada por el SRI',
  FAILED: 'Error al enviar al SRI',
  CREDITED: 'Anulada con nota de crédito',
}

/**
 * Mensaje que el cliente puede entender y que le dice qué hacer, sin jerga
 * fiscal ni detalles del servidor.
 */
export function invoiceMessageFor(invoice) {
  switch (invoice.status) {
    case 'AUTHORIZED':
      return null
    case 'RECEIVED':
    case 'SIGNED':
      return 'Estamos esperando la autorización del SRI. Te avisaremos en cuanto esté lista.'
    case 'DRAFT':
      return 'Tu comprobante se está preparando.'
    case 'NO_CERTIFICATE':
      return 'La tienda está configurando su facturación. Te enviaremos el comprobante en cuanto pueda.'
    case 'REJECTED':
    case 'NOT_AUTHORIZED':
      return 'El SRI no autorizó el comprobante. La tienda ya lo está revisando; tu pedido no se ve afectado.'
    case 'FAILED':
      return 'No pudimos enviar el comprobante al SRI. Lo reintentamos automáticamente.'
    case 'CREDITED':
      return 'Este comprobante fue anulado con una nota de crédito.'
    default:
      return 'Tu comprobante se está procesando.'
  }
}