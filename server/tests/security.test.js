import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Las protecciones HTTP se prueban de forma aislada, sin levantar el servidor.
 * Lo que no se puede simular aquí (base de datos, cookies reales) se cubre en
 * tests/http.test.js.
 */
const BASE_URL = 'http://localhost:4000'
process.env.APP_URL = BASE_URL
process.env.LANDING_URL = 'http://localhost:5174'
process.env.JWT_SECRET = 'clave-de-prueba-0000000000000000000000000000'
process.env.SRI_CERT_SECRET = 'clave-de-prueba-000000000000000000000000abcd'

const { isOriginAllowed } = await import('../src/config.js')
const { requireTrustedOrigin, rateLimit, limits } = await import('../src/middleware/auth.js')

function resFalso() {
  return {
    statusCode: 200,
    cuerpo: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.cuerpo = payload
      return this
    },
    setHeader() {},
    get() {
      return undefined
    },
  }
}

function invocar(middleware, { method = 'POST', headers = {}, cookies = {}, ip = '1.2.3.4' } = {}) {
  const req = { method, headers, cookies, ip, get: (k) => headers[k.toLowerCase()] }
  const res = resFalso()
  let siguiente = false
  middleware(req, res, () => {
    siguiente = true
  })
  return { siguiente, res }
}

test('los origenes configurados se aceptan', () => {
  assert.equal(isOriginAllowed(BASE_URL), true)
  assert.equal(isOriginAllowed('http://localhost:5174'), true)
  assert.equal(isOriginAllowed(BASE_URL + '/'), true, 'la barra final no debe importar')
  assert.equal(isOriginAllowed(BASE_URL.toUpperCase()), true, 'la comparacion no distingue mayusculas')
})

test('un origen ajeno se rechaza', () => {
  for (const origen of [
    'https://sitio-malicioso.example',
    'http://localhost:4001', // puerto distinto
    'http://evil.localhost:5173',
    'http://localhost:5173.evil.example',
    'https://localhost:5173',
    '',
    null,
    'no-es-una-url',
  ]) {
    assert.equal(isOriginAllowed(origen), false, `deberia rechazar: ${origen}`)
  }
})

test('la comprobacion de origen no bloquea las lecturas', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const r = invocar(requireTrustedOrigin, { method })
    assert.equal(r.siguiente, true, `${method} debe pasar`)
  }
})

test('una peticion con Origin permitido pasa', () => {
  const r = invocar(requireTrustedOrigin, { headers: { origin: BASE_URL } })
  assert.equal(r.siguiente, true)
})

test('una peticion POST con Origin ajeno se bloquea con 403', () => {
  const r = invocar(requireTrustedOrigin, { headers: { origin: 'https://sitio-malicioso.example' } })
  assert.equal(r.siguiente, false)
  assert.equal(r.res.statusCode, 403)
  assert.match(r.res.cuerpo.error, /Origen no permitido/)
})

test('sin Origin, un Referer ajeno se bloquea', () => {
  const r = invocar(requireTrustedOrigin, { headers: { referer: 'https://sitio-malicioso.example/form' } })
  assert.equal(r.siguiente, false)
  assert.equal(r.res.statusCode, 403)
})

test('sin Origin, un Referer permitido pasa', () => {
  const r = invocar(requireTrustedOrigin, { headers: { referer: `${BASE_URL}/admin/facturas` } })
  assert.equal(r.siguiente, true)
})

test('sin Origin ni Referer pasa: es una peticion directa', () => {
  const r = invocar(requireTrustedOrigin, { headers: {} })
  assert.equal(r.siguiente, true)
})

test('un Referer mal formado se bloquea', () => {
  const r = invocar(requireTrustedOrigin, { headers: { referer: 'no-es-una-url' } })
  assert.equal(r.siguiente, false)
  assert.equal(r.res.statusCode, 403)
})

test('con token Bearer no se exige comprobar el origen', () => {
  // El navegador no puede adjuntar Authorization sin pasar por CORS, asi que
  // un cliente no navegador (scripts, apps moviles) no queda bloqueado.
  const r = invocar(requireTrustedOrigin, { headers: { authorization: 'Bearer abc.def.ghi', origin: 'https://otro.example' } })
  assert.equal(r.siguiente, true)
})

test('con cookie si se exige comprobar el origen aunque haya Authorization invalido', () => {
  const r = invocar(requireTrustedOrigin, {
    headers: { authorization: 'Basico abc', origin: 'https://sitio-malicioso.example' },
    cookies: { access_token: 'x' },
  })
  assert.equal(r.siguiente, false)
})

test('el limitador corta al superar el maximo de peticiones', () => {
  const limit = rateLimit({ windowMs: 60_000, max: 3, message: 'demasiado' })
  for (let i = 0; i < 3; i += 1) {
    const r = invocar(limit, { ip: '9.9.9.9' })
    assert.equal(r.siguiente, true, `peticion ${i + 1} debe pasar`)
  }
  const bloqueada = invocar(limit, { ip: '9.9.9.9' })
  assert.equal(bloqueada.siguiente, false, 'la cuarta debe bloquearse')
  assert.equal(bloqueada.res.statusCode, 429)
  assert.equal(bloqueada.res.cuerpo.error, 'demasiado')
  assert.ok(bloqueada.res.cuerpo.retryAfter > 0, 'debe indicar cuanto esperar')
})

test('el limitador cuenta por cliente, no de forma global', () => {
  const limit = rateLimit({ windowMs: 60_000, max: 2 })
  for (let i = 0; i < 5; i += 1) invocar(limit, { ip: '1.1.1.1' })
  // Un cliente distinto no debe verse afectado por lo que hizo otro.
  const otro = invocar(limit, { ip: '2.2.2.2' })
  assert.equal(otro.siguiente, true)
})

test('el limitador se reinicia al expirar la ventana', async () => {
  const limit = rateLimit({ windowMs: 60, max: 1 })
  const primera = invocar(limit, { ip: '3.3.3.3' })
  assert.equal(primera.siguiente, true)
  assert.equal(invocar(limit, { ip: '3.3.3.3' }).siguiente, false)
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(invocar(limit, { ip: '3.3.3.3' }).siguiente, true, 'tras la ventana debe volver a pasar')
  limit.reset()
})

test('los limites declarados son utilizables', () => {
  for (const [nombre, limitador] of Object.entries(limits)) {
    assert.equal(typeof limitador, 'function', `${nombre} debe ser un middleware`)
    const r = invocar(limitador, { ip: '8.8.8.8' })
    assert.equal(r.siguiente, true, `${nombre} debe permitir la primera peticion`)
  }
})

test('el limitador de login es mas estricto que el de lectura', () => {
  // Un login permite mucho menos que una consulta normal: es la puerta de entrada.
  assert.ok(limits.login, 'debe existir el limite de login')
  assert.ok(limits.sriTest, 'debe existir el limite de prueba SRI')
  assert.ok(limits.invoiceRetry, 'debe existir el limite de reintento de facturas')
  assert.ok(limits.checkout, 'debe existir el limite de pedidos')
})
