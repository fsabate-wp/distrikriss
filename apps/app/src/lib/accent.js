function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function mix(rgb, target, amount) {
  return {
    r: Math.round(rgb.r + (target.r - rgb.r) * amount),
    g: Math.round(rgb.g + (target.g - rgb.g) * amount),
    b: Math.round(rgb.b + (target.b - rgb.b) * amount),
  }
}

function toHex(rgb) {
  return (
    '#' +
    [rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, '0')).join('')
  )
}

const WHITE = { r: 255, g: 255, b: 255 }
const BLACK = { r: 0, g: 0, b: 0 }

export function accentPalette(hex) {
  const base = hexToRgb(hex || '#1B5E20')
  return {
    dark: toHex(base),
    mid: toHex(mix(base, WHITE, 0.28)),
    light: toHex(mix(base, WHITE, 0.48)),
    accent: toHex(mix(base, WHITE, 0.62)),
    contrast: toHex(mix(base, BLACK, 0.25)),
  }
}

export function applyAccentColor(hex) {
  if (!hex) return
  const palette = accentPalette(hex)
  const root = document.documentElement
  root.style.setProperty('--green-dark', palette.dark)
  root.style.setProperty('--green-mid', palette.mid)
  root.style.setProperty('--green-light', palette.light)
  root.style.setProperty('--green-accent', palette.accent)
}
