export function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function endOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes()
}
