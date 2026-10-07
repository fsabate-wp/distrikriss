const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

let isRefreshing = false
let failedQueue = []
let hasRedirected = false

function processQueue(error) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve()
  })
  failedQueue = []
}

function shouldRedirectForPath(path) {
  // No redirigir para chequeos de sesión de invitado ni endpoints de auth
  if (path === '/api/auth/me') return false
  if (path === '/api/auth/refresh') return false
  if (path === '/api/auth/login') return false
  if (path === '/api/auth/register') return false
  return true
}

function handleSessionExpired(failedPath) {
  // La confirmación de contraseña no sobrevive a la sesión.
  clearStepUp()
  if (!shouldRedirectForPath(failedPath)) return
  if (hasRedirected) return
  hasRedirected = true
  try {
    sessionStorage.setItem('sessionExpired', '1')
    sessionStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search)
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: { path: failedPath } }))
  } catch {}
  // Guardar destino; App.vue se encarga del redirect vía router. Fallback con location si no hay listener.
  const currentPath = window.location.pathname + window.location.search
  const isAuthPage = currentPath.startsWith('/login') || currentPath.startsWith('/registro')
  if (isAuthPage) {
    setTimeout(() => { hasRedirected = false }, 2000)
    return
  }
  setTimeout(() => {
    // si después de 500ms seguimos fuera de /login, forzar redirect por location (fallback)
    if (window.location.pathname !== '/login') {
      // Solo forzar si App.vue no redirigió (comprobamos si aún estamos en la misma ruta)
      const stillSame = window.location.pathname + window.location.search === currentPath
      if (stillSame) {
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}&expired=1`
      }
    }
    setTimeout(() => { hasRedirected = false }, 1500)
  }, 600)
}

async function tryRefresh() {
  try {
    const res = await fetch(API_URL + '/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    // consumir body para liberar conexión
    await res.json().catch(() => null)
    return true
  } catch {
    return false
  }
}

/**
 * Confirmación de contraseña para operaciones fiscales sensibles.
 * El servidor exige las cabeceras X-SRI-Verified-At y X-SRI-Step-Up, y solo las
 * acepta durante unos minutos. Se guardan en memoria, no en disco ni en el
 * sessionStorage.
 */
let stepUp = null
const STEP_UP_TTL_MS = 10 * 60 * 1000

export function hasRecentStepUp() {
  return Boolean(stepUp) && Date.now() - stepUp.verifiedAt < STEP_UP_TTL_MS
}

export function clearStepUp() {
  stepUp = null
}

async function confirmStepUp(path) {
  const password = window.prompt(
    'Para continuar con esta operación fiscal, escribe tu contraseña de administrador.\n' +
      'La confirmación vale por 10 minutos.',
  )
  if (password === null) throw new Error('Operación cancelada')
  const res = await fetch(API_URL + '/api/admin/sri/step-up', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    stepUp = null
    throw new Error(data?.error || 'No se pudo confirmar la contraseña')
  }
  stepUp = { verifiedAt: data.verifiedAt || Date.now(), nonce: data.nonce }
  return retryRequest(path)
}

function stepUpHeaders() {
  if (!hasRecentStepUp()) return {}
  return { 'X-SRI-Verified-At': String(stepUp.verifiedAt), 'X-SRI-Step-Up': stepUp.nonce }
}

async function request(path, { method = 'GET', body, params } = {}, _retry = false, _stepUpDone = false) {
  const url = new URL(API_URL + path)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }
  let res
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...stepUpHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor')
  }

  // Si el servidor pide confirmación de contraseña, se pide una vez y se repite.
  if (res.status === 428 && !_stepUpDone) {
    const data = await res.json().catch(() => null)
    if (data?.code === 'STEP_UP_REQUIRED') {
      return confirmStepUp({ path, method, body, params, _retry })
    }
  }

  // Si es 401, intentar refresh automático una vez
  if (res.status === 401 && !_retry && path !== '/api/auth/refresh' && path !== '/api/auth/login' && path !== '/api/auth/register') {
    if (isRefreshing) {
      // Encolar esta petición hasta que termine el refresh
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: async () => {
            try {
              const data = await request(path, { method, body, params }, true)
              resolve(data)
            } catch (e) { reject(e) }
          },
          reject,
        })
      })
    }

    isRefreshing = true
    const refreshed = await tryRefresh()
    isRefreshing = false

    if (refreshed) {
      processQueue(null)
      // Reintentar la petición original con credenciales renovadas
      return request(path, { method, body, params }, true, _stepUpDone)
    } else {
      processQueue(new Error('Sesión expirada'))
      handleSessionExpired(path)
      // leer error del response original para lanzar mensaje útil
      const data = await res.json().catch(() => null)
      const err = new Error(data?.error || 'Sesión expirada, inicia sesión de nuevo')
      err.status = 401
      err.data = data
      throw err
    }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Si es 401 definitivo (ya reintentado o no refrescable), notificar expiración
    if (res.status === 401) {
      handleSessionExpired(path)
    }
    const err = new Error(data?.error || `Error ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

/** Repite una petición tras haber confirmado la contraseña. */
function retryRequest(descriptor) {
  return request(descriptor.path, { method: descriptor.method, body: descriptor.body, params: descriptor.params }, descriptor._retry, true)
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  /**
   * Descarga un archivo (XML, RIDE) respetando la sesión. No puede pasar por
   * `request` porque devuelve texto binario, no JSON.
   */
  download: async (path, filename) => {
    const res = await fetch(API_URL + path, { credentials: 'include', headers: stepUpHeaders() })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      const err = new Error(data?.error || `Error ${res.status}`)
      err.status = res.status
      throw err
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Se libera en el siguiente turno: Safari necesita que el enlace siga vivo.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
