import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '../../public/imgs')
fs.mkdirSync(uploadsDir, { recursive: true })

// Nombre de archivo con sufijo criptografico. Math.random es predecible: un
// atacante que adivina el nombre podria llegar a adivinar tambien el del
// certificado de firma, que es la credencial mas sensible del sistema.
const uniqueSuffix = () => crypto.randomBytes(8).toString('hex')

/**
 * Solo se conservan las extensiones de la lista blanca. Se usa path.extname
 * sobre el nombre original, que ya no puede contener separadores de ruta, y el
 * nombre final se construye aqui, nunca a partir del archivo subido.
 */
function safeExt(originalname, permitidos, porDefecto = '') {
  const ext = path.extname(String(originalname || '')).toLowerCase()
  return permitidos.includes(ext) ? ext : porDefecto
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const BRAND_EXTS = [...IMAGE_EXTS, '.svg', '.ico']

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = safeExt(file.originalname, IMAGE_EXTS)
    cb(null, `prod-${Date.now()}-${uniqueSuffix()}${ext}`)
  },
})

const brandStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = safeExt(file.originalname, BRAND_EXTS)
    cb(null, `brand-${Date.now()}-${uniqueSuffix()}${ext}`)
  },
})

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = /image\/(jpeg|png|webp|gif)/.test(file.mimetype)
    const allowedExt = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname)
    if (allowedMime || allowedExt) return cb(null, true)
    const err = new Error('Solo se permiten imágenes (jpg, png, webp, gif)')
    err.status = 400
    cb(err)
  },
})

export const uploadBrand = multer({
  storage: brandStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = /image\/(jpeg|png|webp|gif|svg\+xml|x-icon)/.test(file.mimetype)
    const allowedExt = /\.(jpe?g|png|webp|gif|svg|ico)$/i.test(file.originalname)
    if (allowedMime || allowedExt) return cb(null, true)
    const err = new Error('Solo se permiten imágenes (png, jpg, webp, gif, svg, ico)')
    err.status = 400
    cb(err)
  },
})

const certsDir = path.join(__dirname, '../../certificates')
fs.mkdirSync(certsDir, { recursive: true })

const CERT_EXTS = ['.p12', '.pfx']

const certStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, certsDir),
  filename: (req, file, cb) => {
    const ext = safeExt(file.originalname, CERT_EXTS, '.p12')
    // El formato del nombre es lo que valida certificatePath() al leerlo, asi
    // que se construye aqui con las piezas esperadas y nada mas.
    cb(null, `cert-${Date.now()}-${uniqueSuffix()}${ext}`)
  },
})

export const uploadCertificate = multer({
  storage: certStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    if (!CERT_EXTS.includes(ext)) {
      const err = new Error('Solo se permiten certificados .p12 o .pfx (firma electrónica)')
      err.status = 400
      return cb(err)
    }
    return cb(null, true)
  },
})
