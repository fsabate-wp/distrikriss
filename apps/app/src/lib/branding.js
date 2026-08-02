const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const absolute = (u) => (u ? (u.startsWith('/') ? API_URL + u : u) : null)

function ensureLink(rel, href, attrs = {}) {
  let link = document.querySelector(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v)
    document.head.appendChild(link)
  }
  link.href = href
}

export function applyBranding(settings) {
  if (!settings) return
  const favicon = absolute(settings.faviconUrl)
  const icon = absolute(settings.appIconUrl)
  if (favicon) ensureLink('icon', favicon)
  if (icon) {
    ensureLink('apple-touch-icon', icon, { sizes: '180x180' })
    const manifest = document.querySelector('link[rel="manifest"]')
    const target = `${API_URL}/api/settings/manifest`
    if (manifest) {
      manifest.href = target
    } else {
      ensureLink('manifest', target)
    }
  }
}
