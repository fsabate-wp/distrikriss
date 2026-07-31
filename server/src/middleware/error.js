export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' })
}

export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' })
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor', field: err.meta?.target })
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Datos inválidos', issues: err.issues })
  }
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor' })
}
