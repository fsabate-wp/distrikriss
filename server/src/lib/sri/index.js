import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../prisma.js'
import { buildAccessKey } from './clave.js'
import { buildInvoiceXml, TAX_CODES } from './xml.js'
import { parseP12, signInvoiceXml } from './sign.js'
import { sendReceipt, queryAuthorization } from './client.js'
import { identificationTypeFor } from './ruc.js'

const CERT_DIR = new URL('../../../certificates/', import.meta.url)
const round = (n, dec = 2) => Math.round(Number(n) * 10 ** dec) / 10 ** dec

function certificatePath(filename) {
  return path.join(CERT_DIR.pathname.replace(/^\/([A-Za-z]:)/, '$1'), filename || '')
}

export function loadCertificate(settings) {
  if (!settings.sriCertificateFile) return null
  const file = certificatePath(settings.sriCertificateFile)
  if (!fs.existsSync(file)) return null
  return parseP12(fs.readFileSync(file), settings.sriCertificatePassword)
}

export function canIssueInvoice(settings) {
  return Boolean(
    settings.sriEnabled &&
      settings.ruc &&
      settings.businessName &&
      settings.sriCertificateFile &&
      settings.sriCertificatePassword,
  )
}

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

export async function buildInvoiceFor(order, settings) {
  const globalRate = Number(settings.sriIvaRate) || 15
  const lines = order.items.map((item) => {
    const rate = Number(item.ivaRate ?? globalRate)
    const totalIncl = Number(item.price) * item.quantity
    const base = round(totalIncl / (1 + rate / 100))
    const taxValue = round(totalIncl - base)
    return {
      code: item.productId || item.name,
      description: item.name,
      quantity: item.quantity,
      unitPrice: round(base / item.quantity, 4),
      base,
      taxRate: rate,
      taxValue,
      discount: 0,
    }
  })

  const deliveryTotal = Number(order.deliveryFee)
  if (deliveryTotal > 0) {
    const base = round(deliveryTotal / (1 + globalRate / 100))
    lines.push({
      code: 'SERVICIO-ENTREGA',
      description: 'Servicio de entrega a domicilio',
      quantity: 1,
      unitPrice: round(base, 4),
      base,
      taxRate: globalRate,
      taxValue: round(deliveryTotal - base),
      discount: 0,
    })
  }

  const totalSinImpuestos = round(lines.reduce((acc, l) => acc + l.base, 0))
  const totalImpuestos = round(lines.reduce((acc, l) => acc + l.taxValue, 0))
  const total = round(totalSinImpuestos + totalImpuestos)

  const groupsMap = new Map()
  for (const l of lines) {
    const tax = TAX_CODES[Number(l.taxRate)] || TAX_CODES[15]
    const existing = groupsMap.get(tax.percentageCode)
    if (existing) {
      existing.base = round(existing.base + l.base)
      existing.value = round(existing.value + l.taxValue)
    } else {
      groupsMap.set(tax.percentageCode, { code: tax.code, percentageCode: tax.percentageCode, base: l.base, value: l.taxValue })
    }
  }
  const groups = [...groupsMap.values()]

  const establishment = settings.sriEstablishment || '003'
  const emissionPoint = settings.sriEmissionPoint || '001'
  const last = await prisma.invoice.findFirst({
    where: { establishment, emissionPoint },
    orderBy: { sequential: 'desc' },
  })
  const sequential = (last?.sequential || 0) + 1
  const accessKey = buildAccessKey({
    date: new Date(),
    ruc: settings.ruc,
    docCode: '01',
    environment: settings.sriEnvironment,
    establishment,
    emissionPoint,
    sequential,
  })

  const buyer = buyerFor(order)
  const payload = {
    environment: settings.sriEnvironment,
    ruc: settings.ruc,
    businessName: settings.businessName,
    tradeName: settings.tradeName || '',
    matrixAddress: settings.sriAddress || settings.storeAddress || '',
    accessKey,
    establishment,
    emissionPoint,
    sequential,
    issueDate: new Date(),
    establishmentAddress: settings.sriAddress || settings.storeAddress || '',
    specialContributor: settings.sriSpecialContributor || '',
    obligadoContabilidad: settings.sriObligadoContabilidad !== false,
    buyer,
    currency: settings.currency || 'USD',
    totalSinImpuestos,
    totalDescuento: 0,
    tax: { rate: globalRate, groups },
    total,
    propina: 0,
    paymentForm: paymentForm(order.paymentMethod),
    lines,
    additional: [
      { name: 'Correo', value: buyer?.email || order.user?.email || '' },
      { name: 'Dirección', value: order.addressSnapshot?.street || '' },
    ].filter((a) => a.value),
  }

  return { payload, establishment, emissionPoint, sequential, accessKey, total }
}

async function updateStatus(invoiceId, data) {
  return prisma.invoice.update({ where: { id: invoiceId }, data })
}

export async function issueInvoice(orderId, opts = {}) {
  const { force = false } = opts
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, invoice: true, user: { select: { email: true } } },
    })
    if (!order || order.billingType !== 'FACTURA') return null
    if (order.invoice && !force) return order.invoice

    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!settings || !settings.sriEnabled) return null

    let cert = null
    try {
      cert = loadCertificate(settings)
    } catch {
      cert = null
    }

    let invoice = order.invoice
    let xml = invoice?.xml || null

    if (!invoice) {
      const { payload, establishment, emissionPoint, sequential, accessKey } = await buildInvoiceFor(order, settings)
      xml = buildInvoiceXml(payload)
      invoice = await prisma.invoice.create({
        data: {
          orderId: order.id,
          establishment,
          emissionPoint,
          sequential,
          number: `${establishment}-${emissionPoint}-${String(sequential).padStart(9, '0')}`,
          accessKey,
          status: 'NO_CERTIFICATE',
          xml,
          responseMessage: 'Pendiente de firma y envío',
        },
      })
    }

    if (!cert) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          xml,
          status: 'NO_CERTIFICATE',
          responseCode: null,
          responseMessage: 'No se configuró el certificado digital (firma electrónica)',
        },
      })
      return invoice
    }

    const signedXml = xml.includes('<ds:') || xml.includes('<Signature')
      ? xml
      : signInvoiceXml(xml, cert)

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        xml: signedXml,
        status: 'SIGNED',
        ...(force ? { retryCount: { increment: 1 } } : {}),
      },
    })

    try {
      const receipt = await sendReceipt(settings.sriEnvironment, signedXml)
      if (receipt.estado === 'RECIBIDA') {
        const auth = await queryAuthorizationWithRetry(settings.sriEnvironment, invoice.accessKey, 5)
        if (auth?.estado === 'AUTORIZADO') {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'AUTHORIZED',
              authorizationNumber: auth.numeroAutorizacion,
              authorizationDate: auth.fechaAutorizacion ? new Date(auth.fechaAutorizacion) : null,
            },
          })
        } else if (auth?.estado === 'NO AUTORIZADO') {
          await updateStatus(invoice.id, {
            status: 'NOT_AUTHORIZED',
            responseCode: auth.identificador,
            responseMessage: auth.mensajes?.map((m) => m.mensaje).join('; '),
          })
        }
      } else {
        await updateStatus(invoice.id, {
          status: 'REJECTED',
          responseCode: receipt.mensajes?.[0]?.identificador,
          responseMessage: receipt.mensajes?.map((m) => m.mensaje).join('; ') || 'Comprobante devuelto por el SRI',
        })
      }
    } catch (err) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'FAILED', responseMessage: String(err?.message || err).slice(0, 500) },
      })
    }
    return invoice
  } catch (err) {
    console.error('[sri] no se pudo emitir comprobante:', err)
    return null
  }
}

async function queryAuthorizationWithRetry(environment, accessKey, retries) {
  let attempt = 0
  while (attempt < retries) {
    try {
      const { autorizaciones } = await queryAuthorization(environment, accessKey)
      const first = autorizaciones?.[0]
      if (first?.estado === 'AUTORIZADO' || first?.estado === 'NO AUTORIZADO') return first
    } catch {
      /* reintentar */
    }
    attempt += 1
    await new Promise((r) => setTimeout(r, attempt * 3000))
  }
  return null
}

export { certificatePath, updateStatus }
