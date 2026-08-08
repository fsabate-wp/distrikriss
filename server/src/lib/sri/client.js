import { DOMParser } from '@xmldom/xmldom'

const PROD = 'https://cel.sri.gob.ec/comprobantes-electronicos-ws'
const TEST = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws'

export function sriEndpoints(environment) {
  const base = Number(environment) === 1 ? PROD : TEST
  return {
    environment: Number(environment) === 1 ? 1 : 2,
    reception: `${base}/RecepcionComprobantesOffline?wsdl`,
    authorization: `${base}/AutorizacionComprobantesOffline?wsdl`,
  }
}

function soapEnvelopeReception(xmlB64) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <ec:xml>${xmlB64}</ec:xml>
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
      <ec:claveAccesoConsultada>${accessKey}</ec:claveAccesoConsultada>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`
}

async function postSoap(url, envelope, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      body: envelope,
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw Object.assign(new Error(`El SRI respondió con estado ${res.status}`), { response: text })
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

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'text/xml')
}

export async function sendReceipt(environment, signedXml) {
  const { reception } = sriEndpoints(environment)
  const xmlB64 = Buffer.from(signedXml, 'utf8').toString('base64')
  const response = await postSoap(reception, soapEnvelopeReception(xmlB64))
  const doc = parseXml(response)
  const estado = textOf(doc, 'estado')
  const mensajes = []
  const msgNodes = doc.getElementsByTagNameNS?.('*', 'mensaje') || []
  for (let i = 0; i < msgNodes.length; i += 1) {
    const m = msgNodes[i]
    mensajes.push({
      identificador: textOf(m, 'identificador'),
      tipo: textOf(m, 'tipo'),
      mensaje: textOf(m, 'mensaje'),
      informacionAdicional: textOf(m, 'informacionAdicional'),
    })
  }
  return { estado, mensajes }
}

export async function queryAuthorization(environment, accessKey) {
  const { authorization } = sriEndpoints(environment)
  const response = await postSoap(authorization, soapEnvelopeAuthorization(accessKey))
  const doc = parseXml(response)
  const autorizaciones = []
  const nodes = doc.getElementsByTagNameNS?.('*', 'autorizacion') || []
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i]
    const mensajes = []
    const msgNodes = a.getElementsByTagNameNS?.('*', 'mensaje') || []
    for (let j = 0; j < msgNodes.length; j += 1) {
      const m = msgNodes[j]
      mensajes.push({
        identificador: textOf(m, 'identificador'),
        tipo: textOf(m, 'tipo'),
        mensaje: textOf(m, 'mensaje'),
        informacionAdicional: textOf(m, 'informacionAdicional'),
      })
    }
    autorizaciones.push({
      estado: textOf(a, 'estado'),
      numeroAutorizacion: textOf(a, 'numeroAutorizacion'),
      fechaAutorizacion: textOf(a, 'fechaAutorizacion'),
      comprobante: textOf(a, 'comprobante'),
      mensajes,
    })
  }
  return { autorizaciones }
}
