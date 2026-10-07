import { config } from '../config.js'

export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' })
}

/** Campos que nunca deben aparecer en un mensaje de error al cliente. */
function isSensitive(err) {
  const message = String(err?.message || '')
  return (
    /certificate|certificado|\.p12|password|contrase|passphrase/i.test(message) ||
    /sriCertificate/i.test(String(err?.meta?.target || ''))
  )
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' })
  }
  if (err?.code === 'P2002') {
    // El mensaje de Prisma puede contener el valor que colisionó. Para el
    // panel administrativo interesa saber qué campo, no su contenido.
    return res.status(409).json({ error: 'Ya existe un registro con ese valor', field: err.meta?.target })
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Datos inválidos', issues: err.issues })
  }
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message })
  }

  // Los errores del SRI y del certificado sí son accionables para el
  // administrador, pero no se reenvían al cliente público.
  const esAdmin = req.user?.role === 'ADMIN'
  if (esAdmin && isSensitive(err)) {
    return res.status(500).json({ error: String(err?.message || err).slice(0, 300) })
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.message || err)
  if (!config.isProd && err?.stack) console.error(err.stack)
  res.status(500).json({ error: 'Error interno del servidor' })
}
