import fs from 'node:fs'
import path from 'node:path'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import { decryptSecret, fingerprint } from '../crypto.js'

const CERT_DIR = new URL('../../../certificates/', import.meta.url)

/**
 * Formato que impone uploadCertificate: cert-<13 digitos de timestamp>-<16 hex>.<p12|pfx>.
 *
 * Aceptar solo este patron es lo que cierra el path traversal. Antes
 * sriCertificateFile era texto libre y terminaba en
 * path.join(CERT_DIR, valor), de modo que "../../.env" leia cualquier archivo
 * del servidor. El patron no admite separadores de directorio ni "..", y el
 * nombre se contrasta ademas con path.basename.
 */
const CERT_FILENAME_RE = /^cert-\d{13}-[0-9a-f]{16}\.(p12|pfx)$/

// Cuanto tiempo se reutiliza el certificado ya parseado antes de releer el disco.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

function certDirPath() {
  return path.join(CERT_DIR.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '')
}

/**
 * Resuelve el nombre de archivo a una ruta segura.
 * Rechaza cualquier cosa que no sea un archivo subido por este sistema.
 */
export function certificatePath(filename) {
  const name = String(filename || '')
  if (!CERT_FILENAME_RE.test(name)) {
    throw new Error(
      'El certificado configurado no tiene un nombre válido. Vuelve a subir el archivo .p12 desde el panel.',
    )
  }
  const base = path.basename(name)
  if (base !== name) throw new Error('Nombre de certificado inválido')
  return path.join(certDirPath(), base)
}

function pemFromBytes(bytes, label) {
  const base64 = Buffer.from(bytes).toString('base64')
  const lines = base64.match(/.{1,64}/g) || []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

/** Lee el .p12 y extrae llave privada y certificado. */
export function parseP12(p12Buffer, password) {
  const asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'))
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password || '')
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]
  if (!keyBag || !certBags?.length) {
    throw new Error('El certificado .p12 no contiene una llave privada y un certificado válidos')
  }
  const certificate = forge.pki.certificateToAsn1(certBags[0].cert)
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(certBags[0].cert),
    certificateDerB64: Buffer.from(forge.asn1.toDer(certificate).getBytes(), 'binary').toString('base64'),
  }
}

/**
 * Firma el comprobante. La referencia es el elemento raiz, que es lo que
 * espera el validador del SRI: no debe firmarse un subarbol.
 */
export function signInvoiceXml(xml, { privateKeyPem, certificatePem }) {
  const sig = new SignedXml({ privateKey: privateKeyPem, publicCert: certificatePem })
  sig.addReference({
    xpath: "//*[local-name(.)='factura' or local-name(.)='notaCredito' or local-name(.)='notaDebito']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  })
  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
  sig.computeSignature(xml, {
    prefix: 'ds',
    location: {
      reference: "//*[local-name()='factura' or local-name()='notaCredito' or local-name()='notaDebito']",
      action: 'append',
    },
    existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
  })
  return sig.getSignedXml()
}

function readCertificateFile(filename) {
  const file = certificatePath(filename)
  if (!fs.existsSync(file)) {
    throw new Error(
      `No se encuentra el archivo del certificado (${path.basename(file)}). Vuelve a subirlo desde el panel.`,
    )
  }
  return fs.readFileSync(file)
}

/**
 * Comprueba que el certificado sirve para firmar la factura:
 *  - que la contraseña sea la correcta,
 *  - que no esté vencido,
 *  - que el RUC del certificado coincida con el RUC del contribuyente.
 *
 * El desajuste de RUC es la causa mas frecuente de rechazo del SRI y no se
 * detecta hasta que el comprobante vuelve con error 70-something, dias
 * despues. Comprobarlo aqui convierte un problema discovered tarde en uno
 * visible en el panel antes de emitir.
 */
export function preflightCertificate(p12Buffer, password, expectedRuc) {
  const { privateKeyPem, certificatePem } = parseP12(p12Buffer, password)
  const cert = forge.pki.certificateFromPem(certificatePem)

  const notBefore = cert.validity.notBefore
  const notAfter = cert.validity.notAfter
  const now = new Date()
  if (now < notBefore) {
    throw new Error(`El certificado todavia no es valido (entra en vigor el ${notBefore.toISOString().slice(0, 10)})`)
  }
  if (now > notAfter) {
    throw new Error(
      `El certificado vencio el ${notAfter.toISOString().slice(0, 10)}. Sin un certificado vigente el SRI no autoriza ningun comprobante.`,
    )
  }

  // El RUC aparece en el CN (numero de identificacion) o en el serialNumber,
  // segun como lo emita la entidad certificadora.
  const candidates = [cert.subject?.attributes, cert.serialNumber]
    .flat()
    .filter(Boolean)
    .map((a) => String(a.value ?? a ?? '').replace(/\D/g, ''))
    .filter((v) => v.length >= 10)
  const rucInCert = candidates.find((v) => v.length === 13)

  if (expectedRuc && rucInCert && rucInCert !== String(expectedRuc)) {
    throw new Error(
      `El RUC del certificado (${rucInCert}) no coincide con el RUC configurado (${expectedRuc}). ` +
        'El SRI rechaza todos los comprobantes firmados con un certificado de otro contribuyente.',
    )
  }
  if (expectedRuc && !rucInCert) {
    throw new Error(
      'No se pudo leer el RUC del certificado. Verifica que el .p12 sea el emitido para tu RUC.',
    )
  }

  const daysLeft = Math.floor((notAfter.getTime() - now.getTime()) / 86_400_000)
  return {
    privateKeyPem,
    certificatePem,
    subject: cert.subject?.attributes?.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ') || '',
    issuer: cert.issuer?.attributes?.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ') || '',
    rucInCertificate: rucInCert || null,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    daysLeft,
    expiringSoon: daysLeft <= 30,
  }
}

/**
 * Carga el certificado desde la configuracion, descifrando la contrasena.
 * Cachea el resultado por un periodo corto: parsear un .p12 con node-forge es
 * costoso y se hacia en cada emision.
 */
export function loadCertificate(settings, { skipCache = false } = {}) {
  if (!settings?.sriCertificateFile) return null
  const secret = decryptSecret(settings.sriCertificatePasswordEnc || '')
  const key = `${settings.sriCertificateFile}:${fingerprint(secret)}:${settings.ruc || ''}`
  if (!skipCache) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  }
  const buffer = readCertificateFile(settings.sriCertificateFile)
  const value = preflightCertificate(buffer, secret, settings.ruc)
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Informe del certificado para el panel, sin exponer material criptografico. */
export function inspectCertificate(settings) {
  if (!settings?.sriCertificateFile) return { ok: false, error: 'No hay certificado configurado' }
  if (!settings.sriCertificatePasswordEnc) {
    return { ok: false, error: 'Falta la contraseña del certificado' }
  }
  try {
    const cert = loadCertificate(settings, { skipCache: true })
    return {
      ok: true,
      subject: cert.subject,
      issuer: cert.issuer,
      rucInCertificate: cert.rucInCertificate,
      rucMatches: !settings.ruc || cert.rucInCertificate === String(settings.ruc),
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      daysLeft: cert.daysLeft,
      expiringSoon: cert.expiringSoon,
    }
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 300) }
  }
}

export function clearCertificateCache() {
  cache.clear()
}

export { CERT_FILENAME_RE }
