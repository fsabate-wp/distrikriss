const CHECK_WEIGHTS = [2, 3, 4, 5, 6, 7]

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

export function randomCode8() {
  let code = ''
  for (let i = 0; i < 8; i += 1) code += Math.floor(Math.random() * 10)
  return code
}

export function buildAccessKey({ date, ruc, docCode, environment, establishment, emissionPoint, sequential }) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aaaa = String(d.getFullYear())
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
