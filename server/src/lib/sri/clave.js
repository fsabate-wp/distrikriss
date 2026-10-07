import crypto from 'node:crypto'

const CHECK_WEIGHTS = [2, 3, 4, 5, 6, 7]

/**
 * Digito verificador modulo 11 de la clave de acceso.
 */
export function mod11CheckDigit(numberStr) {
  let sum = 0
  const digits = String(numberStr).split('').reverse()
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]) * CHECK_WEIGHTS[i % CHECK_WEIGHTS.length]
  }
  const mod = sum % 11
  const check = 11 - mod
  return check === 11 ? 0 : check === 10 ? 1 : check
}

export function pad9(n) {
  return String(n).padStart(9, '0')
}

/**
 * Codigo numerico de 8 digitos de la clave de acceso.
 * Usa crypto.randomInt y no Math.random: Math.random no es criptografico y
 * repite secuencias, lo que facilitate colisiones de claves de acceso.
 */
export function randomCode8() {
  let code = ''
  for (let i = 0; i < 8; i += 1) {
    code += crypto.randomInt(0, 10)
  }
  return code
}

export function buildAccessKey({ date, ruc, docCode, environment, establishment, emissionPoint, sequential }) {
  const d = date instanceof Date ? date : new Date(date)
  // La fecha de la clave DEBE ser la misma que <fechaEmision>. Si se calculan
  // por separado, un proceso que cruza medianoche genera un comprobante que el
  // SRI rechaza. Se toma una unica fecha ya convertida a Guayaquil.
  const { dd, mm, aaaa } = guayaquilParts(d)
  const base =
    dd +
    mm +
    aaaa +
    String(docCode).padStart(2, '0') +
    String(ruc).padStart(13, '0') +
    String(Number(environment) === 1 ? 1 : 2) +
    String(establishment).padStart(3, '0') +
    String(emissionPoint).padStart(3, '0') +
    pad9(sequential) +
    randomCode8() +
    '1'
  return base + mod11CheckDigit(base)
}

/**
 * Partes de fecha en America/Guayaquil (UTC-5, sin horario de verano).
 *
 * Importante: el servidor puede correr en UTC o en cualquier otra zona. Tomar
 * la fecha local del servidor desalinea la clave y la fecha de emisión en las
 * horas cercanas a medianoche, que es exactamente cuando se acumulan los
 * pedidos del día siguiente.
 */
export function guayaquilParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const gmt5 = new Date(d.getTime() - 5 * 60 * 60 * 1000)
  return {
    dd: String(gmt5.getUTCDate()).padStart(2, '0'),
    mm: String(gmt5.getUTCMonth() + 1).padStart(2, '0'),
    aaaa: String(gmt5.getUTCFullYear()),
    formatted: `${String(gmt5.getUTCDate()).padStart(2, '0')}/${String(gmt5.getUTCMonth() + 1).padStart(2, '0')}/${gmt5.getUTCFullYear()}`,
  }
}

/** Ultimo instante del dia en Guayaquil, para validar que el SRI no la rechace. */
export function guayaquilDayEnd(date = new Date()) {
  const { aaaa, mm, dd } = guayaquilParts(date)
  return new Date(`${aaaa}-${mm}-${dd}T23:59:59-05:00`)
}

/**
 * Instante a persistir. Se guarda el momento real de emision; lo que va al XML
 * como fecha es guayaquilParts(). Se normaliza a un Date copia para no mutar
 * el argumento.
 */
export function guayaquilInstant(date = new Date()) {
  return date instanceof Date ? new Date(date.getTime()) : new Date(date)
}
