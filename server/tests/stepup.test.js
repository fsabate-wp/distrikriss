import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * La confirmación reforzada (step-up) se prueba sin base de datos: el ticket que
 * emite /sri/step-up es autocontenido y se valida en el middleware.
 */
process.env.APP_URL = 'http://localhost:4000'
process.env.JWT_SECRET = 'clave-de-prueba-0000000000000000000000000000'
process.env.JWT_REFRESH_SECRET = 'refresh-de-prueba-0000000000000000000000000000'
process.env.SRI_CERT_SECRET = 'clave-de-prueba-000000000000000000000000abcd'

const { signStepUpToken, verifyStepUpToken, signAccessToken, signRefreshToken } = await import(
  '../src/lib/jwt.js'
)
const { stepUpGrant, requireStepUp } = await import('../src/middleware/auth.js')

function reqFalso(headers, user = { id: 'u1' }) {
  return { headers, user, get: (k) => headers[String(k).toLowerCase()] }
}

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
  }
}

function invocar(middleware, req) {
  const res = resFalso()
  let siguiente = false
  middleware(req, res, () => {
    siguiente = true
  })
  return { siguiente, res }
}

test('un ticket de step-up recien emitido vale para su usuario', () => {
  const ticket = signStepUpToken({ id: 'u1' })
  const grant = stepUpGrant(reqFalso({ 'x-sri-step-up': ticket }))
  assert.ok(grant, 'debe devolver el ticket')
  assert.equal(String(grant.sub), 'u1')
  assert.equal(grant.purpose, 'sri-step-up')
})

test('el ticket lleva firma del servidor y caduca solo', () => {
  const ticket = signStepUpToken({ id: 'u1' })
  const payload = verifyStepUpToken(ticket)
  assert.equal(payload.purpose, 'sri-step-up')
  assert.ok(payload.exp > payload.iat, 'debe traer caducidad')
})

test('un nonce inventado ya no sirve para saltarse la confirmacion', () => {
  // El error de C2: el servidor aceptaba la fecha y el nonce que mandara el
  // cliente, asi que con un token robado bastaba enviar un timestamp actual y un
  // nonce cualquiera para cambiar el RUC, el ambiente o el certificado.
  const grant = stepUpGrant(
    reqFalso({ 'x-sri-verified-at': String(Date.now()), 'x-sri-step-up': 'deadbeef' }),
  )
  assert.equal(grant, null)
})

test('sin ticket no hay confirmacion aunque venga la fecha', () => {
  assert.equal(stepUpGrant(reqFalso({ 'x-sri-verified-at': String(Date.now()) })), null)
  assert.equal(stepUpGrant(reqFalso({})), null)
})

test('un ticket emitido para otro usuario no vale', () => {
  const ticket = signStepUpToken({ id: 'u2' })
  assert.equal(stepUpGrant(reqFalso({ 'x-sri-step-up': ticket }, { id: 'u1' })), null)
})

test('un access token o un refresh token no valen como ticket de step-up', () => {
  const access = signAccessToken({ id: 'u1', role: 'ADMIN' })
  const refresh = signRefreshToken({ id: 'u1' })
  assert.equal(stepUpGrant(reqFalso({ 'x-sri-step-up': access })), null)
  assert.equal(stepUpGrant(reqFalso({ 'x-sri-step-up': refresh })), null)
})

test('requireStepUp exige el ticket y deja pasar con uno valido', () => {
  const sinTicket = invocar(requireStepUp, reqFalso({}))
  assert.equal(sinTicket.siguiente, false)
  assert.equal(sinTicket.res.statusCode, 428)
  assert.equal(sinTicket.res.cuerpo.code, 'STEP_UP_REQUIRED')

  const falsificado = invocar(
    requireStepUp,
    reqFalso({ 'x-sri-verified-at': String(Date.now()), 'x-sri-step-up': 'inventado' }),
  )
  assert.equal(falsificado.siguiente, false)
  assert.equal(falsificado.res.statusCode, 428)

  const valido = invocar(requireStepUp, reqFalso({ 'x-sri-step-up': signStepUpToken({ id: 'u1' }) }))
  assert.equal(valido.siguiente, true)
})

test('un ticket caducado se rechaza', (t) => {
  const ticket = signStepUpToken({ id: 'u1' })
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 11 * 60 * 1000 })
  try {
    assert.equal(stepUpGrant(reqFalso({ 'x-sri-step-up': ticket })), null)
  } finally {
    t.mock.timers.reset()
  }
})
