import { prisma } from '../prisma.js'
import { config } from '../../config.js'
import { buildAccessKey, guayaquilParts, guayaquilInstant } from './clave.js'
import { buildInvoiceXml, buildCreditNoteXml } from './xml.js'
import { buildLines, buildTaxGroups, computeTotals, assertReconciled } from './totals.js'
import { loadCertificate, signInvoiceXml, certificatePath } from './cert.js'
import { sendReceipt, awaitAuthorization, queryAuthorization } from './client.js'
import { identificationTypeFor } from './ruc.js'

export { buildLines, buildTaxGroups, computeTotals, assertReconciled }

const DOC_CODES = { FACTURA: '01', NOTA_CREDITO: '07', NOTA_DEBITO: '08' }

// Estados en los que el comprobante ya tiene una respuesta definitiva del SRI y
// reenviarlo no sirve de nada: el SRI tiene el registro y no va a cambiar.
const TERMINAL_STATUSES = ['NOT_AUTHORIZED', 'REJECTED']

function paymentForm(paymentMethod) {
  return paymentMethod === 'TRANSFER' ? '20' : '01'
}

function buyerFor(order) {
  const data = order.billingData || {}
  if (!data || !data.id) return null
  return {
    type: identificationTypeFor(data.id),
    id: data.id,
    name: data.name,
    address: data.address || '',
  }
}

export function canIssueInvoice(settings) {
  return Boolean(
    settings?.sriEnabled &&
      settings.ruc &&
      settings.businessName &&
      settings.sriCertificateFile &&
      settings.sriCertificatePasswordEnc,
  )
}

/**
 * Toma el siguiente secuencial de una serie de forma atomica.
 *
 * El patron anterior era findFirst(max) + 1, es decir un read-modify-write: dos
 * emisiones simultaneas obtenian el mismo numero y, con el, la misma clave de
 * acceso. El SRI rechaza la segunda y la correlatividad se rompe, que es una
 * infraccion. Aqui el INSERT ... ON CONFLICT ... RETURNING hace el incremento
 * en una sola sentencia y el indice UNIQUE serializa a los concurrentes.
 */
export async function nextSequential(docType, establishment, emissionPoint) {
  const rows = await prisma.$queryRaw`
    INSERT INTO "DocumentSeries" ("id", "docType", "establishment", "emissionPoint", "sequential", "updatedAt")
    VALUES (
      ${`series-${docType}-${establishment}-${emissionPoint}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`},
      ${docType}::"SriDocType",
      ${establishment},
      ${emissionPoint},
      1,
      NOW()
    )
    ON CONFLICT ("docType", "establishment", "emissionPoint")
    DO UPDATE SET "sequential" = "DocumentSeries"."sequential" + 1, "updatedAt" = NOW()
    RETURNING "sequential"
  `
  return Number(rows[0].sequential)
}

export async function logInvoiceEvent(invoiceId, event, data = {}) {
  try {
    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        event,
        status: data.status ?? null,
        actorId: data.actorId ?? null,
        actorRole: data.actorRole ?? null,
        detail: data.detail ? String(data.detail).slice(0, 1000) : null,
        ip: data.ip ?? null,
      },
    })
  } catch (err) {
    console.error('[sri] no se pudo registrar el evento de auditoria:', err?.message || err)
  }
}

function nextRetryDate(attempt) {
  // Backoff exponencial acotado con un poco de dispersion. Insistir rapido ante
  // un problema de red solo consume cuota del SRI.
  const delay = Math.min(config.sri.retryBaseMs * 2 ** Math.max(0, attempt - 1), config.sri.retryMaxMs)
  return new Date(Date.now() + delay + Math.floor(Math.random() * delay * 0.2))
}

function seriesFor(settings) {
  const establishment = settings.sriEstablishment || '003'
  const emissionPoint = settings.sriEmissionPoint || '001'
  const environment = Number(settings.sriEnvironment) === 1 ? 1 : 2
  if (!settings.ruc || !/^\d{13}$/.test(settings.ruc)) {
    throw new Error('El RUC del contribuyente no esta configurado o no tiene 13 digitos')
  }
  return { establishment, emissionPoint, environment }
}

/**
 * Prepara el comprobante de un pedido: reserva el secuencial, construye el XML y
 * lo persiste como DRAFT. Firmar y enviar son pasos posteriores.
 */
export async function prepareInvoice(orderId, { actor = null } = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, invoice: true, user: { select: { email: true } } },
  })
  if (!order) throw new Error('Pedido no encontrado')
  if (order.billingType !== 'FACTURA') throw new Error('El pedido no fue creado con solicitud de factura')
  if (order.invoice) return order.invoice

  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!settings?.sriEnabled) throw new Error('La facturación electrónica no está activada')
  const { establishment, emissionPoint, environment } = seriesFor(settings)

  // Una sola fecha para la clave y para <fechaEmision>. Calculadas por separado,
  // un proceso que cruza medianoche produce un comprobante que el SRI rechaza con
  // "la fecha de emisión no corresponde a la de la clave de acceso".
  const issueDate = guayaquilInstant(new Date())
  const issueParts = guayaquilParts(issueDate)

  const { lines, totalDiscount } = buildLines(order, settings)
  const groups = buildTaxGroups(lines)
  const totals = computeTotals(lines, totalDiscount)
  assertReconciled(totals, order)

  const sequential = await nextSequential('FACTURA', establishment, emissionPoint)
  const accessKey = buildAccessKey({
    date: issueDate,
    ruc: settings.ruc,
    docCode: DOC_CODES.FACTURA,
    environment,
    establishment,
    emissionPoint,
    sequential,
  })

  const buyer = buyerFor(order)
  const xml = buildInvoiceXml({
    environment,
    ruc: settings.ruc,
    businessName: settings.businessName,
    tradeName: settings.tradeName || '',
    matrixAddress: settings.sriAddress || settings.storeAddress || '',
    accessKey,
    docCode: DOC_CODES.FACTURA,
    establishment,
    emissionPoint,
    sequential,
    issueDate,
    establishmentAddress: settings.sriAddress || settings.storeAddress || '',
    specialContributor: settings.sriSpecialContributor || '',
    obligadoContabilidad: settings.sriObligadoContabilidad !== false,
    buyer,
    currency: settings.currency || 'USD',
    totalSinImpuestos: totals.totalSinImpuestos,
    totalDescuento: totals.totalDiscount,
    groups,
    total: totals.total,
    propina: 0,
    paymentForm: paymentForm(order.paymentMethod),
    lines,
    additional: [
      { name: 'Correo', value: buyer?.email || order.user?.email || '' },
      { name: 'Dirección', value: order.addressSnapshot?.street || '' },
    ],
  })

  const number = `${establishment}-${emissionPoint}-${String(sequential).padStart(9, '0')}`
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        orderId: order.id,
        docType: 'FACTURA',
        establishment,
        emissionPoint,
        sequential,
        number,
        accessKey,
        environment,
        issueDate,
        status: 'DRAFT',
        xml,
        totalFiscal: totals.total,
        reconciledAt: new Date(),
      },
    })
    await tx.documentSeries.update({
      where: { docType_establishment_emissionPoint: { docType: 'FACTURA', establishment, emissionPoint } },
      data: { lastAccessKey: accessKey, lastIssuedAt: issueDate },
    })
    return created
  })

  await logInvoiceEvent(invoice.id, 'PREPARED', {
    status: 'DRAFT',
    detail: `Comprobante ${number} emitido el ${issueParts.formatted} con clave ${accessKey}`,
    actorId: actor?.id,
    actorRole: actor?.role,
    ip: actor?.ip,
  })

  return invoice
}

/** Consulta al SRI el estado actual de una clave de acceso. */
async function resolveExistingAuthorization(invoice) {
  try {
    const { autorizaciones } = await queryAuthorization(invoice.environment, invoice.accessKey)
    return autorizaciones?.[0] || null
  } catch {
    return null
  }
}

async function applyAuthorization(invoice, auth, actor = null) {
  const raw = auth.raw || null
  if (auth.estado === 'AUTORIZADO') {
    const parsed = auth.fechaAutorizacion ? new Date(auth.fechaAutorizacion) : null
    const authorizationDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'AUTHORIZED',
        authorizationNumber: auth.numeroAutorizacion,
        authorizationDate,
        // El "comprobante" es el CLAVEACCESO ya autorizado: es el valor que va
        // en el QR de la RIDE y con el que el cliente valida la factura. Antes
        // se parseaba y se descartaba, dejando al cliente sin comprobante valido.
        authorizationProof: auth.comprobante || null,
        authorizationXml: raw,
        responseCode: null,
        responseMessage: null,
        nextRetryAt: null,
      },
    })
    await logInvoiceEvent(invoice.id, 'AUTHORIZED', {
      status: 'AUTHORIZED',
      detail: `Autorizacion ${auth.numeroAutorizacion}`,
      actorId: actor?.id,
      actorRole: actor?.role,
    })
    return updated
  }

  if (auth.estado === 'NO AUTORIZADO') {
    const message = (auth.mensajes || []).map((m) => m.mensaje).join('; ').slice(0, 1000)
    const code = auth.mensajes?.[0]?.identificador || null
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'NOT_AUTHORIZED',
        responseCode: code,
        responseMessage: message || 'El SRI no autorizó el comprobante',
        authorizationXml: raw,
        nextRetryAt: null,
      },
    })
    await logInvoiceEvent(invoice.id, 'NOT_AUTHORIZED', {
      status: 'NOT_AUTHORIZED',
      detail: `${code || ''} ${message}`.trim(),
      actorId: actor?.id,
      actorRole: actor?.role,
    })
    return updated
  }

  // PROCESANDO: se deja RECEIVED y el worker vuelve a preguntar.
  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { nextRetryAt: new Date(Date.now() + config.sri.authorizationPollMs) },
  })
}

/**
 * Firma y envia un comprobante ya preparado, y espera la autorizacion.
 *
 * Es idempotente por clave de acceso: antes de firmar o reenviar consulta al
 * SRI si ya recibio el comprobante. Reenviar algo ya recibido produce un
 * rechazo que esconde el problema real.
 */
export async function submitInvoice(invoiceId, { actor = null, force = false } = {}) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!settings?.sriEnabled) throw new Error('La facturación electrónica no está activada')

  let invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new Error('Comprobante no encontrado')
  if (invoice.status === 'AUTHORIZED') return invoice
  if (invoice.status === 'CREDITED') throw new Error('Este comprobante fue anulado por una nota de crédito')
  if (TERMINAL_STATUSES.includes(invoice.status) && !force) {
    throw new Error(
      `El comprobante ${invoice.number} ya tiene una respuesta definitiva del SRI (${invoice.status}). ` +
        'Corrige la causa y emite uno nuevo con el siguiente secuencial.',
    )
  }

  // Idempotencia: preguntar primero al SRI evita firmar y enviar de nuevo algo
  // que ya tiene registrado.
  if (invoice.status !== 'DRAFT') {
    const known = await resolveExistingAuthorization(invoice)
    if (known?.estado === 'AUTORIZADO' || known?.estado === 'NO AUTORIZADO') {
      return applyAuthorization(invoice, known, actor)
    }
  }

  let cert
  try {
    cert = loadCertificate(settings)
  } catch (err) {
    // Antes este error se tragaba y el panel informaba "no se configuró el
    // certificado", que es falso: lo que suele fallar es la contraseña o que el
    // RUC del certificado no sea el del contribuyente.
    const message = String(err?.message || err).slice(0, 500)
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'NO_CERTIFICATE', responseMessage: message, lastAttemptAt: new Date() },
    })
    await logInvoiceEvent(invoice.id, 'CERTIFICATE_ERROR', { status: 'NO_CERTIFICATE', detail: message })
    return prisma.invoice.findUnique({ where: { id: invoice.id } })
  }

  const alreadySigned = Boolean(invoice.xml && invoice.xml.includes('<ds:SignatureValue'))
  const signedXml = alreadySigned ? invoice.xml : signInvoiceXml(invoice.xml, cert)

  invoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      xml: signedXml,
      status: 'SIGNED',
      signedAt: invoice.signedAt || new Date(),
      lastAttemptAt: new Date(),
      ...(force ? { retryCount: { increment: 1 } } : {}),
    },
  })
  await logInvoiceEvent(invoice.id, 'SIGNED', {
    status: 'SIGNED',
    actorId: actor?.id,
    actorRole: actor?.role,
  })

  let receipt
  try {
    receipt = await sendReceipt(invoice.environment, signedXml)
  } catch (err) {
    const message = String(err?.message || err).slice(0, 500)
    const attempt = invoice.retryCount + (force ? 1 : 0) + 1
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'FAILED', responseMessage: message, nextRetryAt: nextRetryDate(attempt), sentAt: new Date() },
    })
    await logInvoiceEvent(invoice.id, 'SEND_FAILED', { status: 'FAILED', detail: message })
    return prisma.invoice.findUnique({ where: { id: invoice.id } })
  }

  if (receipt.estado !== 'RECIBIDA') {
    const message = (receipt.mensajes || []).map((m) => m.mensaje).join('; ').slice(0, 1000)
    const code = receipt.mensajes?.[0]?.identificador || null
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'REJECTED',
        responseCode: code,
        responseMessage: message || 'Comprobante devuelto por el SRI',
        receptionResponse: receipt.raw,
        sentAt: new Date(),
        // Un rechazo por el contenido del comprobante no se resuelve
        // reintentando: el siguiente paso es corregir los datos.
        nextRetryAt: null,
      },
    })
    await logInvoiceEvent(invoice.id, 'REJECTED', { status: 'REJECTED', detail: `${code || ''} ${message}`.trim() })
    return prisma.invoice.findUnique({ where: { id: invoice.id } })
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'RECEIVED', receptionResponse: receipt.raw, sentAt: new Date() },
  })
  await logInvoiceEvent(invoice.id, 'RECEIVED', { status: 'RECEIVED' })

  const auth = await awaitAuthorization(invoice.environment, invoice.accessKey)
  if (!auth || (auth.estado !== 'AUTORIZADO' && auth.estado !== 'NO AUTORIZADO')) {
    // Recibido pero aún sin resolución: es normal, el SRI procesa después.
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { nextRetryAt: new Date(Date.now() + config.sri.authorizationPollMs * 2) },
    })
    return prisma.invoice.findUnique({ where: { id: invoice.id } })
  }
  return applyAuthorization(invoice, auth, actor)
}

/**
 * Emite la factura de un pedido. Idempotente por pedido.
 *
 * Se invoca cuando el pago esta confirmado y no al crear el pedido: una factura
 * electronica de una operacion que aun no ocurrio (por ejemplo, contra
 * reembolso sin entregar) no es un comprobante valido.
 */
export async function issueInvoice(orderId, opts = {}) {
  const invoice = await prepareInvoice(orderId, { actor: opts.actor })
  return submitInvoice(invoice.id, opts)
}

/**
 * Emite una nota de credito que anula un comprobante ya autorizado.
 * Es la unica forma legal de revertir una factura electronica: no se puede
 * borrar ni marcar como cancelada.
 */
export async function issueCreditNote(invoiceId, { reason, actor = null } = {}) {
  const original = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { order: true } })
  if (!original) throw new Error('Comprobante no encontrado')
  if (original.status !== 'AUTHORIZED') {
    throw new Error('Solo se puede anular un comprobante que el SRI ya autorizó')
  }
  if (original.creditedById) throw new Error('Este comprobante ya tiene una nota de crédito asociada')
  if (!reason || String(reason).trim().length < 5) {
    throw new Error('Indica el motivo de la anulación (mínimo 5 caracteres)')
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!settings?.sriEnabled) throw new Error('La facturación electrónica no está activada')

  const order = await prisma.order.findUnique({ where: { id: original.orderId }, include: { items: true } })
  const { lines, totalDiscount } = buildLines(order, settings)
  const groups = buildTaxGroups(lines)
  const totals = computeTotals(lines, totalDiscount)

  const { establishment, emissionPoint, environment } = seriesFor(settings)
  const issueDate = guayaquilInstant(new Date())
  const sequential = await nextSequential('NOTA_CREDITO', establishment, emissionPoint)
  const accessKey = buildAccessKey({
    date: issueDate,
    ruc: settings.ruc,
    docCode: DOC_CODES.NOTA_CREDITO,
    environment,
    establishment,
    emissionPoint,
    sequential,
  })

  const xml = buildCreditNoteXml({
    environment,
    ruc: settings.ruc,
    businessName: settings.businessName,
    tradeName: settings.tradeName || '',
    matrixAddress: settings.sriAddress || settings.storeAddress || '',
    accessKey,
    docCode: DOC_CODES.NOTA_CREDITO,
    establishment,
    emissionPoint,
    sequential,
    issueDate,
    establishmentAddress: settings.sriAddress || settings.storeAddress || '',
    specialContributor: settings.sriSpecialContributor || '',
    obligadoContabilidad: settings.sriObligadoContabilidad !== false,
    buyer: buyerFor(order),
    currency: settings.currency || 'USD',
    totalSinImpuestos: totals.totalSinImpuestos,
    totalDescuento: totals.totalDiscount,
    groups,
    total: totals.total,
    motivo: String(reason).trim(),
    referenced: { number: original.number, reason: String(reason).trim() },
    lines,
  })

  const creditNote = await prisma.invoice.create({
    data: {
      orderId: order.id,
      docType: 'NOTA_CREDITO',
      establishment,
      emissionPoint,
      sequential,
      number: `${establishment}-${emissionPoint}-${String(sequential).padStart(9, '0')}`,
      accessKey,
      environment,
      issueDate,
      status: 'DRAFT',
      xml,
      totalFiscal: totals.total,
      reconciledAt: new Date(),
      creditedById: original.id,
    },
  })
  await prisma.documentSeries.update({
    where: {
      docType_establishment_emissionPoint: {
        docType: 'NOTA_CREDITO',
        establishment,
        emissionPoint,
      },
    },
    data: { lastAccessKey: accessKey, lastIssuedAt: issueDate },
  })

  await prisma.invoice.update({ where: { id: original.id }, data: { status: 'CREDITED' } })
  await logInvoiceEvent(creditNote.id, 'PREPARED', {
    status: 'DRAFT',
    detail: `Nota de crédito contra ${original.number}`,
    actorId: actor?.id,
    actorRole: actor?.role,
  })
  await logInvoiceEvent(original.id, 'CREDIT_NOTE_ISSUED', {
    status: 'CREDITED',
    detail: `Nota de crédito ${creditNote.number}`,
    actorId: actor?.id,
    actorRole: actor?.role,
  })

  return submitInvoice(creditNote.id, { actor })
}

/**
 * Reintenta los comprobantes que quedaron a medias: recibidos sin autorizacion
 * o con error de envio. Los rechazos por contenido no se reintentan, porque
 * repetirlos produce el mismo rechazo.
 */
export async function retryPendingInvoices({ limit = 20 } = {}) {
  const pending = await prisma.invoice.findMany({
    where: {
      status: { in: ['SIGNED', 'RECEIVED', 'FAILED'] },
      nextRetryAt: { lte: new Date() },
      retryCount: { lt: config.sri.maxAttempts },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })

  const results = { retried: 0, authorized: 0, unresolved: 0 }
  for (const invoice of pending) {
    results.retried += 1
    try {
      const updated = await submitInvoice(invoice.id, { force: true })
      if (updated?.status === 'AUTHORIZED') results.authorized += 1
      else if (['FAILED', 'REJECTED', 'NOT_AUTHORIZED'].includes(updated?.status)) results.unresolved += 1
    } catch (err) {
      results.unresolved += 1
      console.error(`[sri] reintento fallido ${invoice.number}:`, err?.message || err)
      await prisma.invoice
        .update({ where: { id: invoice.id }, data: { nextRetryAt: nextRetryDate(invoice.retryCount + 1) } })
        .catch(() => {})
    }
  }
  return results
}

/** Panorama fiscal: que esta autorizado, que quedo colgado, que no cuadra. */
export async function invoicingHealthReport() {
  const [byStatus, unreconciled, notAuthorized, stuck] = await Promise.all([
    prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.invoice.count({ where: { reconciledAt: null } }),
    prisma.invoice.count({ where: { status: 'NOT_AUTHORIZED' } }),
    prisma.invoice.findMany({
      where: { status: { in: ['SIGNED', 'RECEIVED', 'FAILED'] }, nextRetryAt: null },
      select: { id: true, number: true, status: true, retryCount: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ])
  return {
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    unreconciled,
    notAuthorized,
    stuck,
  }
}

export { certificatePath, TERMINAL_STATUSES }
