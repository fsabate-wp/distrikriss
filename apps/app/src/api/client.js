const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function request(path, { method = 'GET', body, params } = {}) {
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
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
}
