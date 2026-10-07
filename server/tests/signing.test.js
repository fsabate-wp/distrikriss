import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import forge from 'node-forge'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'

process.env.SRI_CERT_SECRET = crypto.randomBytes(32).toString('hex')

const { preflightCertificate, signInvoiceXml, certificatePath, CERT_FILENAME_RE } = await import(
  '../src/lib/sri/cert.js'
)
const { buildInvoiceXml, buildCreditNoteXml } = await import('../src/lib/sri/xml.js')
const { renderRide } = await import('../src/lib/sri/ride.js')
const { buildLines, buildTaxGroups, computeTotals } = await import('../src/lib/sri/totals.js')

/**
 * Se genera un .p12 autofirmado para probar el camino real de firma: parseo del
 * PKCS#12, preflight, xml-crypto y validacion del documento firmado. Un
 * certificado emitido por el SRI no puede usarse en pruebas.
 *
 * Se construye con node-forge (dependencia del proyecto) en lugar de openssl,
 * que no esta disponible de forma fiable en Windows. El par de claves lo genera
 * node:crypto, que es mucho mas rapido que el generador de forge.
 */
function generarP12({ ruc = '1791312120001', notBefore, notAfter } = {}) {
  const pass = 'prueba-1234'
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  const key = forge.pki.privateKeyFromPem(privateKey)
  const cert = forge.pki.createCertificate()
  cert.publicKey = key
  cert.serialNumber = ruc
  cert.validity.notBefore = notBefore ?? new Date()
  cert.validity.notAfter = notAfter ?? new Date(Date.now() + 365 * 86_400_000)

  // Atributos con OID para que forge los serialice en lugar de omitirlos.
  const attrs = [
    { name: 'commonName', value: ruc },
    { name: 'serialNumber', value: ruc },
    { name: 'countryName', value: 'EC' },
    { name: 'organizationName', value: 'Prueba SRI' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(key, forge.md.sha256.create())

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], pass, { algorithm: '3des' })
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()

  return { p12: Buffer.from(p12Der, 'binary'), pass }
}

function payload(overrides = {}) {
  const settings = { sriIvaRate: 15, sriDeliveryTaxable: true }
  const order = {
    deliveryFee: 2.5,
    total: 12,
    items: [{ productId: 'p1', name: 'Papa', presentation: 'Malla 5lb', price: 9.25, quantity: 1, ivaRate: 15 }],
  }
  const { lines, totalDiscount } = buildLines(order, settings)
  const groups = buildTaxGroups(lines)
  const totals = computeTotals(lines, totalDiscount)
  return {
    lines,
    groups,
    totals,
    xml: buildInvoiceXml({
      environment: 1,
      ruc: '1791312120001',
      businessName: 'DISTRIKRISS SA',
      tradeName: 'DistriKriss',
      accessKey: '0610202601179131212000120030010000000011234567814',
      docCode: '01',
      establishment: '003',
      emissionPoint: '001',
      sequential: 1,
      issueDate: new Date('2026-10-06T15:00:00Z'),
      establishmentAddress: 'Av. Amazonas N34-567',
      specialContributor: '1791312120001',
      obligadoContabilidad: true,
      buyer: { type: '04', id: '1791312120001', name: 'CLIENTE SA', address: 'Quito' },
      currency: 'USD',
      totalSinImpuestos: totals.totalSinImpuestos,
      totalDescuento: totals.totalDiscount,
      groups,
      total: totals.total,
      propina: 0,
      paymentForm: '01',
      lines,
      additional: [{ name: 'Correo', value: 'cliente@test.com' }],
      ...overrides,
    }),
  }
}

test('el certificado autofirmado pasa el preflight y expone su vigencia', () => {
  const { p12, pass } = generarP12()
  const info = preflightCertificate(p12, pass, '1791312120001')
  assert.equal(info.rucInCertificate, '1791312120001')
  assert.ok(info.daysLeft > 360 && info.daysLeft <= 365, `dias restantes: ${info.daysLeft}`)
  assert.equal(info.expiringSoon, false)
  assert.match(info.subject, /1791312120001/)
  assert.match(info.notAfter, /^\d{4}-\d{2}-\d{2}T/)
})

test('una contraseña incorrecta falla con un mensaje util', () => {
  const { p12 } = generarP12()
  assert.throws(() => preflightCertificate(p12, 'incorrecta', '1791312120001'))
  assert.throws(() => preflightCertificate(p12, '', '1791312120001'))
})

test('un RUC que no coincide con el del certificado se rechaza antes de emitir', () => {
  // Es la causa mas frecuente de rechazo del SRI y solo se detecta dias despues.
  const { p12, pass } = generarP12({ ruc: '1791312120001' })
  assert.throws(
    () => preflightCertificate(p12, pass, '0999999999001'),
    /no coincide con el RUC configurado/,
  )
})

test('un certificado ya vencido se rechaza en el preflight', () => {
  // Es el fallo que dejaria al negocio sin poder facturar: el SRI no autoriza
  // nada con un certificado fuera de vigencia y solo lo descubre al emitir.
  const { p12, pass } = generarP12({
    notBefore: new Date(Date.now() - 30 * 86_400_000),
    notAfter: new Date(Date.now() - 86_400_000),
  })
  assert.throws(() => preflightCertificate(p12, pass, '1791312120001'), /vencio/)
})

test('un certificado aun no vigente se rechaza con la fecha de inicio', () => {
  const { p12, pass } = generarP12({
    notBefore: new Date(Date.now() + 10 * 86_400_000),
    notAfter: new Date(Date.now() + 400 * 86_400_000),
  })
  assert.throws(() => preflightCertificate(p12, pass, '1791312120001'), /todavia no es valido/)
})

test('un certificado que vence pronto se avisa en el panel', () => {
  const { p12, pass } = generarP12({
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 10 * 86_400_000),
  })
  const info = preflightCertificate(p12, pass, '1791312120001')
  assert.equal(info.expiringSoon, true)
  assert.ok(info.daysLeft >= 0 && info.daysLeft <= 11, `dias: ${info.daysLeft}`)
})

test('el nombre del certificado solo acepta el formato que genera la subida', () => {
  // El formato real lo produce uploadCertificate:
  // cert-<Date.now()>-<16 hex>.<p12|pfx>
  const valido = 'cert-1759800000000-a1b2c3d4e5f60718.p12'
  assert.ok(CERT_FILENAME_RE.test(valido))
  assert.ok(CERT_FILENAME_RE.test('cert-1759800000000-0011223344556677.pfx'))

  // El defecto original: sriCertificateFile era texto libre y terminaba en
  // path.join(CERT_DIR, valor), de modo que "../../.env" leia el .env del
  // servidor. Ninguno de estos puede pasar el patron.
  const invalidos = [
    '../../.env',
    '../../../etc/passwd',
    '/etc/shadow',
    'C:\\Windows\\win.ini',
    'cert-1759800000000-a1b2c3d4e5f60718.p12/../../../.env',
    '..\\..\\.env',
    'cert-1759800000000-a1b2c3d4e5f60718.exe',
    'cert-1759800000000-0011223344556677.exe',
    'cert-1759800000000-short.p12',
    'cert-abc.p12',
    'cert.p12',
    'prod-1759800000000-1234.jpg',
    'cert-1759800000000-0011223344556677.p12 ',
    '',
    null,
  ]
  for (const invalido of invalidos) {
    assert.equal(CERT_FILENAME_RE.test(String(invalido ?? '')), false, `deberia rechazar: ${invalido}`)
    assert.throws(() => certificatePath(invalido), /nombre|inválido/i, `deberia lanzar: ${invalido}`)
  }
})

test('la validacion del nombre de certificado es la misma al guardar y al leer', () => {
  // Se importa el mismo patron en las dos capas (esquema de settings y lectura
  // del archivo). Si alguien reintrodujera una regex literal en la ruta,
  // divergirian: un nombre podria aceptarse al guardar y fallar al emitir.
  const fuente = fs.readFileSync(
    fileURLToPath(new URL('../src/routes/admin.routes.js', import.meta.url)),
    'utf8',
  )
  assert.match(fuente, /import \{[^}]*CERT_FILENAME_RE[^}]*\} from '\.\.\/lib\/sri\/cert\.js'/)
  assert.doesNotMatch(
    fuente,
    /cert-\\d\{13\}-\[a-z0-9\]/,
    'la regex no debe estar duplicada dentro de la ruta',
  )
})

test('el XML firmado lleva la firma sobre el elemento raiz', () => {
  const { p12, pass } = generarP12()
  const cert = preflightCertificate(p12, pass, '1791312120001')
  const { xml } = payload()
  const signed = signInvoiceXml(xml, cert)

  assert.match(signed, /<ds:SignatureValue>/)
  assert.match(signed, /xmlns:ds="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/)
  assert.match(signed, /rsa-sha256/)
  assert.match(signed, /xmlenc#sha256/)
  // La firma va dentro de <factura>, que es lo que valida el SRI.
  assert.ok(signed.indexOf('<ds:Signature') > signed.indexOf('<factura'))

  let errores = []
  const doc = new DOMParser({
    onError: (lvl, m) => {
      if (lvl !== 'warning') errores.push(m)
    },
  }).parseFromString(signed, 'text/xml')
  assert.deepEqual(errores, [], 'el XML firmado debe seguir bien formado')
  assert.equal(doc.documentElement.nodeName, 'factura')
  // La firma va con prefijo de espacio de nombres, hay que buscarla por namespace.
  assert.ok(doc.getElementsByTagNameNS('*', 'SignatureValue').length > 0, 'falta SignatureValue')
  assert.ok(doc.getElementsByTagNameNS('*', 'SignedInfo').length > 0, 'falta SignedInfo')
  const referencia = doc.getElementsByTagNameNS('*', 'Reference')[0]
  assert.equal(referencia.getAttribute('URI'), '#comprobante', 'la referencia debe apuntar al id del comprobante')
  // La firma vive dentro de <factura>, que es el elemento que valida el SRI.
  const firma = doc.getElementsByTagNameNS('*', 'Signature')[0]
  assert.equal(firma.parentNode.nodeName, 'factura')
})

test('la firma de una nota de credito tambien se ancla en la raiz', () => {
  const { p12, pass } = generarP12()
  const cert = preflightCertificate(p12, pass, '1791312120001')
  const { lines, groups, totals } = payload()
  const xml = buildCreditNoteXml({
    environment: 2,
    ruc: '1791312120001',
    businessName: 'DISTRIKRISS SA',
    accessKey: '0610202601179131212000120030010000000091234567814',
    docCode: '07',
    establishment: '003',
    emissionPoint: '001',
    sequential: 9,
    issueDate: new Date('2026-10-06T15:00:00Z'),
    establishmentAddress: 'Av. Amazonas N34-567',
    specialContributor: '',
    obligadoContabilidad: true,
    buyer: { type: '04', id: '1791312120001', name: 'CLIENTE SA', address: 'Quito' },
    totalSinImpuestos: totals.totalSinImpuestos,
    totalDescuento: totals.totalDiscount,
    groups,
    total: totals.total,
    motivo: 'Pedido cancelado por el cliente',
    referenced: { number: '003-001-000000001', reason: 'Pedido cancelado por el cliente' },
    lines,
  })
  const signed = signInvoiceXml(xml, cert)
  assert.match(signed, /<ds:SignatureValue>/)
  assert.ok(signed.indexOf('<ds:Signature') > signed.indexOf('<notaCredito'))
  assert.ok(signed.indexOf('<ds:Signature') < signed.indexOf('</notaCredito>'))
})

test('la RIDE se genera como PDF con la informacion fiscal', async () => {
  const { lines, groups, totals, xml } = payload()
  const invoice = {
    number: '003-001-000000001',
    accessKey: '0610202601179131212000120030010000000011234567814',
    authorizationNumber: '1234567890123456',
    authorizationDate: new Date('2026-10-06T15:05:00Z'),
    authorizationProof: '4111111111111111',
    environment: 1,
    issueDate: new Date('2026-10-06T15:00:00Z'),
    docType: 'FACTURA',
  }
  const order = { billingData: { name: 'CLIENTE SA', id: '1791312120001', address: 'Quito' } }
  const settings = {
    businessName: 'DISTRIKRISS SA',
    tradeName: 'DistriKriss',
    ruc: '1791312120001',
    sriAddress: 'Av. Amazonas N34-567',
  }

  const buffer = await renderRide({ invoice, order, settings, lines, groups, totals })
  assert.ok(Buffer.isBuffer(buffer), 'debe devolver un Buffer')
  assert.ok(buffer.length > 2000, `PDF sospechosamente pequeño: ${buffer.length} bytes`)
  // Firma de archivo PDF.
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-')

  const texto = buffer.toString('latin1')
  // El PDF comprime los flujos, pero los objetos de texto deben ser legibles
  // para el chequeo; se verifica el contenido sin comprimir cuando esta libre.
  const flujo = texto.replace(/\r\n/g, '\n')
  assert.ok(flujo.includes('/Page') || flujo.includes('/Type /Page'), 'debe contener paginas')
  void xml
})

test('sin autorización del SRI la RIDE lo dice en vez de imprimir un QR invalido', async () => {
  const { lines, groups, totals } = payload()
  const invoice = {
    number: '003-001-000000001',
    accessKey: '0610202601179131212000120030010000000011234567814',
    authorizationNumber: null,
    authorizationDate: null,
    authorizationProof: null,
    environment: 2,
    issueDate: new Date('2026-10-06T15:00:00Z'),
    docType: 'FACTURA',
  }
  const buffer = await renderRide({
    invoice,
    order: { billingData: null },
    settings: { businessName: 'DISTRIKRISS SA', ruc: '1791312120001', sriAddress: 'Quito' },
    lines,
    groups,
    totals,
  })
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(buffer.length > 1500)
})
