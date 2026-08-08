const DIGITS_ONLY = /^\d+$/

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function validateRuc(ruc) {
  const r = onlyDigits(ruc)
  if (!DIGITS_ONLY.test(r) || r.length !== 13) return false
  const third = Number(r[2])

  if (third === 9) {
    const weights = [4, 3, 2, 7, 6, 5, 4, 3, 2]
    const sum = r.slice(0, 9).split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0)
    const check = 11 - (sum % 11)
    const dv = check === 11 ? 0 : check === 10 ? 1 : check
    return dv === Number(r[9]) && Number(r.slice(10)) >= 1
  }

  if (third === 6) {
    const weights = [3, 2, 7, 6, 5, 4, 3, 2]
    const sum = r.slice(0, 8).split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0)
    const check = 11 - (sum % 11)
    const dv = check === 11 ? 0 : check === 10 ? 1 : check
    return dv === Number(r[8])
  }

  if (third >= 0 && third <= 5) {
    const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    let sum = 0
    for (let i = 0; i < 9; i += 1) {
      const prod = Number(r[i]) * weights[i]
      sum += prod >= 10 ? prod - 9 : prod
    }
    const mod = sum % 10
    const dv = mod === 0 ? 0 : 10 - mod
    return dv === Number(r[9])
  }

  return false
}

export function validateCedula(cedula) {
  const c = onlyDigits(cedula)
  if (!DIGITS_ONLY.test(c) || c.length !== 10) return false
  const province = Number(c.slice(0, 2))
  if (province < 1 || province > 24) return false
  const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 9; i += 1) {
    const prod = Number(c[i]) * weights[i]
    sum += prod >= 10 ? prod - 9 : prod
  }
  const mod = sum % 10
  const dv = mod === 0 ? 0 : 10 - mod
  return dv === Number(c[9])
}

export function identificationTypeFor(identifier) {
  const value = onlyDigits(identifier)
  if (value.length === 13) return '04'
  if (value.length === 10) return '05'
  return '07'
}

export function validateIdentifier(identifier, type) {
  if (type === 'RUC') return validateRuc(identifier)
  if (type === 'CEDULA') return validateCedula(identifier)
  return false
}
