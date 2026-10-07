export function money(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

export function discountedPrice(price, discount) {
  const d = Number(discount) || 0
  if (d >= 100) return 0
  if (d <= 0) return Number(price || 0)
  return Math.round(Number(price || 0) * (1 - d / 100) * 100) / 100
}

export function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-EC', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatDateLong(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-EC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleString('es-EC', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const STATUS_LABELS = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'En preparación',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

export const PAYMENT_LABELS = {
  TRANSFER: 'Transferencia',
  COD: 'Contra reembolso',
}

export const INVOICE_STATUS_LABELS = {
  AUTHORIZED: 'Autorizada por el SRI',
  RECEIVED: 'Recibida, esperando autorización',
  SIGNED: 'Firmada, enviando',
  DRAFT: 'Preparada',
  NO_CERTIFICATE: 'Error del certificado',
  REJECTED: 'Rechazada por el SRI',
  NOT_AUTHORIZED: 'No autorizada',
  FAILED: 'Error de envío',
  CREDITED: 'Anulada con nota de crédito',
}

/** Estados en los que no tiene sentido reintentar: el SRI ya dio su respuesta. */
export const INVOICE_TERMINAL_STATUSES = ['AUTHORIZED', 'NOT_AUTHORIZED', 'REJECTED', 'CREDITED']

/** Estados que requieren la atención del administrador. */
export const INVOICE_PROBLEM_STATUSES = ['NO_CERTIFICATE', 'REJECTED', 'NOT_AUTHORIZED', 'FAILED']

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
