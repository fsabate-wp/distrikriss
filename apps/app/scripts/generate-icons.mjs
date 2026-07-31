import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT_DIR = path.join(import.meta.dirname, '../public/icons')

const BG = [0x1b, 0x5e, 0x20, 0xff]
const FG = [0xe5, 0x39, 0x35, 0xff]

const K_POINTS = [
  [18, 46], [18, 22], [24, 22], [32, 34], [40, 22], [46, 22], [46, 46],
  [40, 46], [40, 32], [34, 41], [28, 32], [28, 46], [22, 46],
]

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * stride + 1)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.max(x0 + r, Math.min(x, x1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - r))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function render(size, { maskable = false } = {}) {
  const S = 4
  const pad = maskable ? 0.08 : 0.06
  const scale = (size * (1 - 2 * pad)) / 64
  const ox = size * pad
  const oy = size * pad
  const rx = size * (14 / 64)
  const rgba = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S
          const py = y + (sy + 0.5) / S
          let color
          if (pointInPolygon(px, py, K_POINTS.map(([kx, ky]) => [ox + kx * scale, oy + ky * scale]))) {
            color = FG
          } else if (maskable || inRoundRect(px, py, 0, 0, size, size, rx)) {
            color = BG
          } else {
            color = [0, 0, 0, 0]
          }
          r += color[0]; g += color[1]; b += color[2]; a += color[3]
        }
      }
      const n = S * S
      const i = (y * size + x) * 4
      rgba[i] = Math.round(r / n)
      rgba[i + 1] = Math.round(g / n)
      rgba[i + 2] = Math.round(b / n)
      rgba[i + 3] = Math.round(a / n)
    }
  }
  return encodePng(size, size, rgba)
}

fs.mkdirSync(OUT_DIR, { recursive: true })

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-192.png', 192, { maskable: true }],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['badge.png', 96, {}],
]

for (const [name, size, opts] of jobs) {
  fs.writeFileSync(path.join(OUT_DIR, name), render(size, opts))
  console.log(`generated ${name} (${size}x${size})`)
}
