import { DOMParser } from '@xmldom/xmldom'
import { config } from '../../config.js'

const PROD = 'https://cel.sri.gob.ec/comprobantes-electronicos-ws'
const TEST = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws'

// Tope defensivo: una respuesta del SRI es de pocos KB. Sin este limite, un
// proxy comprometido o una respuesta enorme agotaria la memoria del proceso.
const MAX_RESPONSE_BYTES = 1024 * 1024

export function sriEndpoints(environment) {
  const base = Number(environment) === 1 ? PROD : TEST
  return {
    environment: Number(environment) === 1 ? 1 : 2,
    reception: `${base}/RecepcionComprobantesOffline?wsdl`,
    authorization: `${base}/AutorizacionComprobantesOffline?wsdl`,
  }
}

/** Escapa el contenido de un elemento XML. */
function xmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function soapEnvelopeReception(xmlB64) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <ec:xml>${xmlText(xmlB64)}</ec:xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`
}

function soapEnvelopeAuthorization(accessKey) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <ec:claveAccesoConsultada>${xmlText(accessKey)}</ec:claveAccesoConsultada>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`
}

async function postSoap(url, envelope, timeoutMs = config.sri.soapTimeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
        'User-Agent': 'distrikriss-sri/1.0',
      },
      body: envelope,
      signal: controller.signal,
      redirect: 'error',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw Object.assign(new Error(`El SRI respondió con estado ${res.status}`), {
        status: res.status,
        response: text.slice(0, 2000),
      })
    }
    const text = await res.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error('La respuesta del SRI excede el tamaño esperado')
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

function textOf(node, tag) {
  const el = node?.getElementsByTagNameNS?.('*', tag)?.[0] || node?.getElementsByTagName?.(tag)?.[0]
  return el?.textContent?.trim?.() ?? ''
}

/**
 * Parser con la recuperacion ante contenido invalido desactivada: si el SRI
 * devolviera algo mal formado, queremos un error explicito y no un arbol
 * silenciosamente distinto al que se leyo.
 */
function parseXml(xml) {
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level === 'error' || level === 'fatalError') {
        throw new Error(`Respuesta XML invalida del SRI: ${String(message).slice(0, 200)}`)
      }
    },
  }).parseFromString(xml, 'text/xml')
  if (!doc || !doc.documentElement) throw new Error('Respuesta vacia del SRI')
  return doc
}

function collectMessages(scope) {
  const mensajes = []
  const nodes = scope.getElementsByTagNameNS?.('*', 'mensaje') || []
  for (let i = 0; i < nodes.length; i += 1) {
    const m = nodes[i]
    mensajes.push({
      identificador: textOf(m, 'identificador'),
      tipo: textOf(m, 'tipo'),
      mensaje: textOf(m, 'mensaje'),
      informacionAdicional: textOf(m, 'informacionAdicional'),
    })
  }
  return mensajes
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function isRetryable(err) {
  // Un rechazo del SRI por el contenido del comprobante no se arregla
  // reintentando; un corte de red o un 5xx, si.
  if (err?.status >= 500) return true
  const code = err?.cause?.code || err?.code || ''
  if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true
  }
  return err?.name === 'AbortError' || err?.name === 'TypeError'
}

/** Envia el comprobante al web service de recepcion, con reintentos acotados. */
export async function sendReceipt(environment, signedXml, opts = {}) {
  const { attempts = 3, retryDelayMs = 1500 } = opts
  const { reception } = sriEndpoints(environment)
  const xmlB64 = Buffer.from(signedXml, 'utf8').toString('base64')
  const envelope = soapEnvelopeReception(xmlB64)

  let lastErr = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await postSoap(reception, envelope)
      const doc = parseXml(response)
      const estado = textOf(doc, 'estado')
      return { estado, mensajes: collectMessages(doc), raw: response.slice(0, 20000) }
    } catch (err) {
      lastErr = err
      if (attempt === attempts || !isRetryable(err)) break
      await sleep(retryDelayMs * attempt)
    }
  }
  throw lastErr
}

/** Consulta el estado de autorizacion de una clave de acceso. */
export async function queryAuthorization(environment, accessKey) {
  const { authorization } = sriEndpoints(environment)
  const response = await postSoap(authorization, soapEnvelopeAuthorization(accessKey))
  const doc = parseXml(response)
  const autorizaciones = []
  const nodes = doc.getElementsByTagNameNS?.('*', 'autorizacion') || []
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i]
    autorizaciones.push({
      estado: textOf(a, 'estado'),
      numeroAutorizacion: textOf(a, 'numeroAutorizacion'),
      fechaAutorizacion: textOf(a, 'fechaAutorizacion'),
      // "comprobante" es el CLAVEACCESO ya autorizado: es el valor que va en el
      // QR de la RIDE y el que el cliente usa para validar la factura.
      comprobante: textOf(a, 'comprobante'),
      mensajes: collectMessages(a),
    })
  }
  return { autorizaciones, raw: response.slice(0, 20000) }
}

/**
 * Espera a que el SRI autorice (o rechace) una clave de acceso.
 * El SRI no autoriza en el instante de la recepcion: hay que preguntar.
 */
export async function awaitAuthorization(environment, accessKey, opts = {}) {
  const {
    attempts = config.sri.authorizationPollAttempts,
    delayMs = config.sri.authorizationPollMs,
    onAttempt,
  } = opts
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { autorizaciones, raw } = await queryAuthorization(environment, accessKey)
      last = { autorizaciones, raw }
      const first = autorizaciones?.[0]
      if (first && (first.estado === 'AUTORIZADO' || first.estado === 'NO AUTORIZADO')) {
        return { ...first, raw }
      }
      if (onAttempt) onAttempt(attempt, first?.estado || 'PROCESANDO')
    } catch {
      /* el SRI a veces responde con error transitorio mientras procesa */
    }
    if (attempt < attempts) await sleep(delayMs)
  }
  return last?.autorizaciones?.[0] ? { ...last.autorizaciones[0], raw: last.raw } : null
}
