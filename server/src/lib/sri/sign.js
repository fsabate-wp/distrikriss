import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'

function pemFromBytes(bytes, label) {
  const base64 = Buffer.from(bytes).toString('base64')
  const lines = base64.match(/.{1,64}/g) || []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

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

export function signInvoiceXml(xml, { privateKeyPem, certificatePem, certificateDerB64 }) {
  const sig = new SignedXml({ privateKey: privateKeyPem, publicCert: certificatePem })
  sig.addReference({
    xpath: "//*[local-name(.)='factura']",
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
    location: { reference: "//*[local-name()='factura']", action: 'append' },
    existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
  })
  return sig.getSignedXml()
}

export { pemFromBytes }
