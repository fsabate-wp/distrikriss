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
  AUTHORIZED: 'Autorizada',
  SIGNED: 'Firmada / enviando',
  PENDING: 'Pendiente',
  NO_CERTIFICATE: 'Sin certificado',
  REJECTED: 'Rechazada por el SRI',
  NOT_AUTHORIZED: 'No autorizada',
  FAILED: 'Error de envío',
}

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
