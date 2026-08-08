import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '../../public/imgs')
fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `prod-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  },
})

const brandStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `brand-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
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

const certStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, certsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `cert-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || '.p12'}`)
  },
})

export const uploadCertificate = multer({
  storage: certStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(p12|pfx)$/i.test(file.originalname)
    if (allowedExt) return cb(null, true)
    const err = new Error('Solo se permiten certificados .p12 (firma electrónica)')
    err.status = 400
    cb(err)
  },
})
