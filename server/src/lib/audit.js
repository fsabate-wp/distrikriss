import { prisma } from './prisma.js'
import { requestIp } from '../config.js'

/**
 * Registro de acciones sensibles.
 *
 * Cambiar el RUC, el ambiente o el certificado de firma sin dejar rastro hace que
 * cualquier irregularidad fiscal sea indefendible: el SRI no distingue entre un
 * cambio autorizado y uno hecho con un token robado. Se registra el antes y el
 * despues para poder reconstruir que paso.
 */
export async function recordAudit({ req, action, target, before, after, actor }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id || req?.user?.id || null,
        actorRole: actor?.role || req?.user?.role || null,
        actorName: actor?.name || null,
        action,
        target: target || null,
        before: before ?? null,
        after: after ?? null,
        ip: req ? requestIp(req) : null,
        userAgent: req?.get?.('user-agent')?.slice(0, 300) || null,
      },
    })
  } catch (err) {
    // La auditoria no debe tumbar la operacion de negocio, pero si fallar hay
    // que dejar rastro en el log del servidor.
    console.error(`[auditoria] no se pudo registrar "${action}":`, err?.message || err)
  }
}

/** Campos de configuracion que nunca deben quedar en la auditoria. */
export function redactSettings(settings) {
  if (!settings) return null
  const {
    sriCertificatePasswordEnc,
    sriCertificatePasswordFor,
    bankTransfer,
    ...rest
  } = settings
  void sriCertificatePasswordEnc
  void sriCertificatePasswordFor
  return {
    ...rest,
    bankTransfer: bankTransfer ? { accountNumber: '***' } : bankTransfer,
  }
}
