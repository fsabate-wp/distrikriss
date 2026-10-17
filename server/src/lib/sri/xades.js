/**
 * Firma XAdES-BES de los comprobantes electronicos del SRI.
 *
 * El SRI NO acepta una firma XMLDSig a secas: la ficha tecnica de comprobantes
 * electronicos exige XAdES_BES (ETSI TS 101 903 v1.3.2). Antes se firmaba con
 * xml-crypto y una unica referencia enveloped, sin SignedProperties ni el
 * certificado dentro de KeyInfo. Esa firma la valida cualquier libreria XMLDSig
 * pero el SRI la rechaza, y el fallo no aparece hasta emitir la primera factura.
 *
 * Estructura que se genera (la misma que el SRI acepta mediante XAdES4J):
 *
 *   <ds:Signature>
 *     <ds:SignedInfo>                          <- se firma con la clave privada
 *       <ds:Reference URI="#comprobante">      <- 1. el documento (enveloped)
 *       <ds:Reference URI="#SignedProperties"> <- 2. los datos de firma
 *       <ds:Reference URI="#Certificate">      <- 3. la clave publica
 *     <ds:SignatureValue>
 *     <ds:KeyInfo>                             <- el certificado, firmado
 *     <ds:Object><xades:QualifyingProperties><xades:SignedProperties>
 *
 * Tres detalles que deciden si el SRI acepta o rechaza:
 *
 *  - SHA-1 en todo (digest y firma). El SRI no admite SHA-256, que era el
 *    algoritmo que usaba la implementacion anterior.
 *  - El certificado va DOS veces: dentro de KeyInfo y, resumido, en
 *    SignedProperties (CertDigest + IssuerSerial). Eso es lo que impide que
 *    alguien sustituya el certificado firmante.
 *  - La canonicalizacion es C14N 1.0 inclusiva, y los fragmentos que se firmen
 *    aparte (SignedInfo, KeyInfo, SignedProperties) heredan los espacios de
 *    nombres de ds:Signature, asi que se declaran en su raiz antes de
 *    canonizarlos. Si no, el resumen no coincidiria con el que calcula el
 *    validador del SRI y la firma seria invalida.
 */
import crypto from 'node:crypto'
import forge from 'node-forge'
import { DOMParser } from '@xmldom/xmldom'
import { C14nCanonicalization } from 'xml-crypto'
import { escapeXml } from './xml.js'

export const DS_NS = 'http://www.w3.org/2000/09/xmldsig#'
export const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#'

const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const ALG_SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1'
const ALG_RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
const ALG_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
const TYPE_SIGNED_PROPERTIES = 'http://uri.etsi.org/01903#SignedProperties'

/** Raices de comprobante que se pueden firmar. */
const ROOT_NAMES = ['factura', 'notaCredito', 'notaDebito']

/** id del elemento raiz del comprobante: es el destino de la primera referencia. */
export const ROOT_ID = 'comprobante'

const sha1 = (data) => crypto.createHash('sha1').update(data, 'utf8').digest('base64')

/**
 * Declara espacios de nombres en la raiz de un fragmento antes de parsearlo.
 *
 * SignedInfo, KeyInfo y SignedProperties viajan dentro de ds:Signature en el
 * documento final y heredan alli sus espacios de nombres. Al firmarlos por
 * separado no hay ancestro que los declare, y un parser consciente de espacios
 * de nombres los rechaza; la C14N inclusiva, ademas, tiene que renderizarlos
 * sobre la raiz del fragmento. Declararlos antes de parsear resuelve las dos
 * cosas y produce el mismo resumen que calculara el SRI.
 */
function declareNamespacesOnRoot(xml, namespaces) {
  if (!namespaces.length) return xml
  const declarations = namespaces
    .map((ns) => ` xmlns${ns.prefix ? `:${ns.prefix}` : ''}="${ns.uri}"`)
    .join('')
  return xml.replace(/^(\s*<[^?!\s/>]+)/, `$1${declarations}`)
}

/** C14N 1.0 inclusiva de un fragmento o del documento. */
function canonicalize(xml, inheritedNamespaces = []) {
  const prepared = declareNamespacesOnRoot(xml, inheritedNamespaces)
  const document = new DOMParser().parseFromString(prepared, 'text/xml')
  return new C14nCanonicalization().process(document.documentElement, {})
}

/**
 * Firma RSA-SHA1 con node-forge sobre el SHA-1 del dato ya canonizado.
 *
 * Se usa forge y no node:crypto para no depender de la politica de SHA-1 de
 * OpenSSL 3: el SRI exige rsa-sha1 y una compilacion que lo desactive romperia
 * la emision sin previo aviso.
 */
function rsaSha1Sign(data, privateKeyPem) {
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  const md = forge.md.sha1.create()
  md.update(data, 'utf8')
  return forge.util.encode64(key.sign(md))
}

/** Hora de firma en formato ISO 8601 con el desfase de Guayaquil (-05:00). */
export function guayaquilSigningTime(date = new Date()) {
  const gmt5 = new Date(date.getTime() - 5 * 60 * 60 * 1000)
  return gmt5.toISOString().replace(/\.\d{3}Z$/, '-05:00')
}

const newId = (name) => `${name}-${crypto.randomBytes(8).toString('hex')}`

function buildKeyInfo({ keyInfoTagId, certificateContent, certificateModulus, certificateExponent }) {
  return (
    `<ds:KeyInfo Id="${keyInfoTagId}">` +
    `<ds:X509Data><ds:X509Certificate>${certificateContent}</ds:X509Certificate></ds:X509Data>` +
    `<ds:KeyValue><ds:RSAKeyValue>` +
    `<ds:Modulus>${certificateModulus}</ds:Modulus>` +
    `<ds:Exponent>${certificateExponent}</ds:Exponent>` +
    `</ds:RSAKeyValue></ds:KeyValue>` +
    `</ds:KeyInfo>`
  )
}

function buildSignedProperties({
  signedPropertiesTagId,
  invoiceTagRefId,
  signingTime,
  certificateHash,
  issuerName,
  serialNumber,
}) {
  return (
    `<xades:SignedProperties Id="${signedPropertiesTagId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${escapeXml(signingTime)}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="${ALG_SHA1}"/>` +
    `<ds:DigestValue>${certificateHash}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${escapeXml(issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${escapeXml(serialNumber)}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `<xades:SignedDataObjectProperties>` +
    `<xades:DataObjectFormat ObjectReference="#${invoiceTagRefId}">` +
    `<xades:Description>Firma digital</xades:Description>` +
    `<xades:MimeType>text/xml</xades:MimeType>` +
    `<xades:Encoding>UTF-8</xades:Encoding>` +
    `</xades:DataObjectFormat>` +
    `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`
  )
}

function buildSignedInfo({
  signedInfoTagId,
  invoiceTagId,
  invoiceTagRefId,
  invoiceHash,
  signedPropertiesRefTagId,
  signedPropertiesTagId,
  signedPropertiesTagHash,
  keyInfoRefTagId,
  keyInfoTagId,
  keyInfoTagHash,
}) {
  const digest = (value) =>
    `<ds:DigestMethod Algorithm="${ALG_SHA1}"/><ds:DigestValue>${value}</ds:DigestValue>`
  return (
    `<ds:SignedInfo Id="${signedInfoTagId}">` +
    `<ds:CanonicalizationMethod Algorithm="${ALG_C14N}"/>` +
    `<ds:SignatureMethod Algorithm="${ALG_RSA_SHA1}"/>` +
    `<ds:Reference Id="${invoiceTagRefId}" URI="#${invoiceTagId}">` +
    `<ds:Transforms><ds:Transform Algorithm="${ALG_ENVELOPED}"/></ds:Transforms>` +
    digest(invoiceHash) +
    `</ds:Reference>` +
    `<ds:Reference Id="${signedPropertiesRefTagId}" Type="${TYPE_SIGNED_PROPERTIES}" URI="#${signedPropertiesTagId}">` +
    digest(signedPropertiesTagHash) +
    `</ds:Reference>` +
    `<ds:Reference Id="${keyInfoRefTagId}" URI="#${keyInfoTagId}">` +
    digest(keyInfoTagHash) +
    `</ds:Reference>` +
    `</ds:SignedInfo>`
  )
}

function buildSignature({
  signatureTagId,
  signatureObjectTagId,
  signatureValueTagId,
  signedInfoTag,
  signatureValue,
  keyInfoTag,
  signedPropertiesTag,
}) {
  return (
    `<ds:Signature xmlns:ds="${DS_NS}" Id="${signatureTagId}">` +
    signedInfoTag +
    `<ds:SignatureValue Id="${signatureValueTagId}">\n${signatureValue}\n</ds:SignatureValue>` +
    keyInfoTag +
    `<ds:Object Id="${signatureObjectTagId}">` +
    `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${signatureTagId}">` +
    signedPropertiesTag +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`
  )
}

/**
 * Firma un comprobante y devuelve el XML con el bloque <ds:Signature> insertado
 * como ultimo hijo de la raiz (enveloped).
 *
 * `cert` es el material que devuelve loadCertificate: privateKeyPem,
 * certificateDerB64, certificateHashB64, issuerName, serialNumber, modulusB64 y
 * exponentB64.
 */
export function signXadesBes(xml, cert, { signingTime } = {}) {
  const source = String(xml || '')
  const rootName = ROOT_NAMES.find((name) => new RegExp(`<${name}[\\s>]`).test(source))
  if (!rootName) {
    throw new Error('El XML no es un comprobante del SRI que se pueda firmar')
  }
  const required = [
    'privateKeyPem',
    'certificateDerB64',
    'certificateHashB64',
    'issuerName',
    'serialNumber',
    'modulusB64',
    'exponentB64',
  ]
  const missing = required.filter((field) => !cert?.[field])
  if (missing.length) {
    throw new Error(`Al certificado le falta material para firmar XAdES-BES: ${missing.join(', ')}`)
  }

  const time = signingTime || guayaquilSigningTime(new Date())
  const ids = {
    signature: newId('Signature'),
    signedInfo: newId('SignedInfo'),
    signatureValue: newId('SignatureValue'),
    object: newId('SignatureObject'),
    keyInfo: newId('Certificate'),
    keyInfoRef: newId('CertificateRef'),
    signedProperties: newId('SignedProperties'),
    signedPropertiesRef: newId('SignedPropertiesRef'),
    documentRef: newId('DocumentRef'),
  }

  const keyInfoTag = buildKeyInfo({
    keyInfoTagId: ids.keyInfo,
    certificateContent: cert.certificateDerB64,
    certificateModulus: cert.modulusB64,
    certificateExponent: cert.exponentB64,
  })

  const signedPropertiesTag = buildSignedProperties({
    signedPropertiesTagId: ids.signedProperties,
    invoiceTagRefId: ids.documentRef,
    signingTime: time,
    certificateHash: cert.certificateHashB64,
    issuerName: cert.issuerName,
    serialNumber: cert.serialNumber,
  })

  // Los tres resumenes que compromete SignedInfo.
  const invoiceHash = sha1(canonicalize(source))
  const signedPropertiesTagHash = sha1(
    canonicalize(signedPropertiesTag, [
      { prefix: 'xades', uri: XADES_NS },
      { prefix: 'ds', uri: DS_NS },
    ]),
  )
  const keyInfoTagHash = sha1(canonicalize(keyInfoTag, [{ prefix: 'ds', uri: DS_NS }]))

  const signedInfoTag = buildSignedInfo({
    signedInfoTagId: ids.signedInfo,
    invoiceTagId: ROOT_ID,
    invoiceTagRefId: ids.documentRef,
    invoiceHash,
    signedPropertiesRefTagId: ids.signedPropertiesRef,
    signedPropertiesTagId: ids.signedProperties,
    signedPropertiesTagHash,
    keyInfoRefTagId: ids.keyInfoRef,
    keyInfoTagId: ids.keyInfo,
    keyInfoTagHash,
  })

  const signatureValue = rsaSha1Sign(
    canonicalize(signedInfoTag, [{ prefix: 'ds', uri: DS_NS }]),
    cert.privateKeyPem,
  )

  const signatureTag = buildSignature({
    signatureTagId: ids.signature,
    signatureObjectTagId: ids.object,
    signatureValueTagId: ids.signatureValue,
    signedInfoTag,
    signatureValue,
    keyInfoTag,
    signedPropertiesTag,
  })

  return source.replace(`</${rootName}>`, `${signatureTag}</${rootName}>`)
}

const XADES_MARKER = '<xades:SignedProperties'
const SIGNATURE_VALUE_MARKER = '<ds:SignatureValue'
const OLD_SIGNATURE_RE = /<ds:Signature[^>]*>[\s\S]*?<\/ds:Signature>/

/**
 * Decide si un XML almacenado ya esta firmado con XAdES-BES o hay que firmarlo.
 *
 * La comprobacion ingenua ("contiene <ds:SignatureValue>") da por buena tambien
 * la firma XMLDSig antigua, que el SRI rechaza. Aqui se distingue: si la firma
 * es la vieja se quita el bloque y se devuelve el XML sin firmar para rehacerla.
 * Sin esto, un comprobante firmado con el formato anterior quedaría atascado
 * con una firma invalida que el SRI devuelve una y otra vez.
 */
export function unsignedSourceFor(xml) {
  const source = String(xml || '')
  if (source.includes(XADES_MARKER)) return { signed: true, xml: source }
  if (!source.includes(SIGNATURE_VALUE_MARKER)) return { signed: false, xml: source }
  const withoutSignature = source.replace(OLD_SIGNATURE_RE, '')
  if (!withoutSignature || withoutSignature === source) {
    throw new Error('No se pudo quitar la firma anterior para volver a firmar con XAdES-BES')
  }
  return { signed: false, xml: withoutSignature }
}
