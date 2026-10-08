/**
 * E2E de las rutas nuevas: RIDE del cliente, comprobante, recompra y búsqueda.
 *
 * Monta el servidor real contra la base de pruebas y verifica lo que antes no
 * existía: que el cliente descarga su propia RIDE, que no puede ver la de otro
 * y que la búsqueda encuentra lo que se escribe en Ecuador.
 */
import { prisma } from '../src/lib/prisma.js'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const BASE = 'http://127.0.0.1:4123'
let ok = 0
let fail = 0

function check(cond, msg) {
  if (cond) { ok += 1; console.log(`  ok    ${msg}`) }
  else { fail += 1; console.log(`  FALLA ${msg}`) }
}

function rand(p) {
  return `${p}${crypto.randomBytes(4).toString('hex')}`
}

async function waitFor(url, ms = 30000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    try {
      const r = await fetch(`${BASE}/api/catalog/products?limit=1`)
      if (r.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/**
 * Cliente HTTP que guarda la galleta de sesión, igual que un navegador.
 * Devuelve además `cookie` para poder reutilizarla en fetch directo.
 */
function cliente() {
  const state = { cookie: '' }
  const llamar = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(state.cookie ? { Cookie: state.cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.getSetCookie?.() || []
    if (set.length) state.cookie = set.map((c) => c.split(';')[0]).join('; ')
    return res
  }
  // Un getter de verdad: Object.assign copiaría el valor y no el accessor.
  Object.defineProperty(llamar, 'cookie', { get: () => state.cookie, enumerable: true })
  return llamar
}

const email = rand('ride') + '@test.com'
const email2 = rand('ride') + '@test.com'
const pass = 'Prueba123!'

// La ruta del servidor se resuelve desde este archivo, no desde el directorio
// actual: `npm run test:e2e` se ejecuta desde la raíz del repositorio.
const server = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, PORT: '4123', NODE_ENV: 'test' },
  stdio: 'ignore',
})

let datos
try {
  if (!(await waitFor())) throw new Error('el servidor no arranco')

  /**
   * Limpieza previa.
   *
   * Las corridas interrumpidas dejan zonas y pedidos sueltos. Como las zonas se
   * resuelven por polígono y varias pueden solaparse, una zona vieja puede hacer
   * que la dirección de esta prueba caiga en otra zona y el horario no exista.
   * Se identifican por el patrón de nombre que solo usa esta prueba.
   */
  const zonasViejas = (await prisma.deliveryZone.findMany()).filter((z) => /^Zona [0-9a-f]{8}$/.test(z.name))
  for (const z of zonasViejas) {
    await prisma.order.deleteMany({ where: { slotId: { startsWith: 'ecom' } } })
    await prisma.category.deleteMany({ where: { name: { startsWith: 'Cat ' } } })
await prisma.product.deleteMany({
    where: { name: { in: ['Papa para la RIDE', 'Jugo de Mango', 'Champiñones en bandeja'] } },
  })
    await prisma.deliveryZone.delete({ where: { id: z.id } })
  }
  if (zonasViejas.length) console.log(`  (${zonasViejas.length} zonas de corridas previas eliminadas)`)

  const sesion = cliente()
  let r = await sesion('POST', '/api/auth/register', {
    name: 'Cliente RIDE', email, password: pass, phone: rand('09'),
  })
  check(r.ok, `registro del cliente: ${r.status}`)
  check(Boolean(sesion.cookie), 'el registro abre sesion por cookie')

  // Segundo cliente, para probar el aislamiento entre usuarios.
  const sesion2 = cliente()
  r = await sesion2('POST', '/api/auth/register', {
    name: 'Otro cliente', email: email2, password: pass, phone: rand('09'),
  })
  check(r.ok, `registro del segundo cliente: ${r.status}`)

  const c1 = { Cookie: sesion.cookie }
  const c2 = { Cookie: sesion2.cookie }

  // Identificador único por ejecución: si una corrida anterior dejó pedidos, el
  // horario de esta no aparece lleno y el fallo sería engañoso.
  const slotId = rand('ecom-')
  const cat = await prisma.category.create({ data: { name: rand('Cat '), slug: rand('cat-') } })
  const prod = await prisma.product.create({
    data: {
      name: 'Papa para la RIDE',
      slug: rand('papa-'),
      price: 2.5,
      stock: 50,
      unit: 'kilo',
      minQuantity: 1,
      stepQuantity: 1,
      categoryId: cat.id,
    },
  })
  const zona = await prisma.deliveryZone.create({
    data: {
      name: rand('Zona '),
      polygon: {
        type: 'Polygon',
        coordinates: [[[-79.9, -2.2], [-79.9, -2.18], [-79.88, -2.18], [-79.88, -2.2], [-79.9, -2.2]]],
      },
      enabled: true,
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      slots: [
        { id: slotId, label: 'Manana', start: '09:00', end: '12:00', capacity: 20 },
      ],
      deliveryFeeBase: 2,
      deliveryFeePerKm: 0.5,
      minOrderAmount: 0,
    },
  })

  const dia = new Date(Date.now() + 2 * 86400000)
  const fecha = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`

  async function pedir(items, paymentMethod = 'COD') {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...c1 },
      body: JSON.stringify({
        paymentMethod,
        billing: { type: 'CONSUMO_FINAL' },
        items,
        deliveryDate: fecha,
        slotId,
        address: {
          street: 'Av. Test', number: '1', reference: 'junto al parque',
          city: 'Quito', lat: -2.19, lng: -79.89,
        },
      }),
    })
    return { res, body: await res.json().catch(() => null) }
  }

  const pedido = await pedir([{ productId: prod.id, quantity: 2 }])
  check(pedido.res.ok, `pedido creado: ${pedido.res.status} ${pedido.body?.error || ''}`)
  const orderId = pedido.body?.order?.id
  check(Boolean(orderId), 'el pedido trae id')
  // Sin pedido no hay nada que verificar, y seguir produciría errores en cascada
  // que parecerían fallos de las rutas nuevas.
  if (!orderId) throw new Error('no se pudo crear el pedido de la prueba')

  console.log('\n=== 1. Pedido sin comprobante ===')
  // Al confirmar el pedido todavia no hay comprobante: lo emite el panel cuando
  // el SRI responde. El cliente debe ver un 404 honesto, no un error generico.
  r = await fetch(`${BASE}/api/orders/${orderId}/invoice`, { headers: c1 })
  check(r.status === 404, `sin comprobante responde 404: ${r.status}`)
  r = await fetch(`${BASE}/api/orders/${orderId}/ride`, { headers: c1 })
  check(r.status === 404, `sin comprobante la RIDE responde 404: ${r.status}`)

  console.log('\n=== 2. Comprobante emitido pero no autorizado ===')
  const pedidoGuardado = await prisma.order.findUnique({ where: { id: orderId } })
  const invoice = await prisma.invoice.create({
    data: {
      orderId,
      docType: 'FACTURA',
      number: '001-001-00000001',
      establishment: '001',
      emissionPoint: '001',
      sequential: 1,
      accessKey: '1234' + '0'.repeat(40),
      issueDate: new Date(),
      status: 'RECEIVED',
      environment: 1,
      totalFiscal: pedidoGuardado.total,
    },
  })

  r = await fetch(`${BASE}/api/orders/${orderId}/invoice`, { headers: c1 })
  const inv = await r.json().catch(() => null)
  check(r.ok, `el cliente lee su comprobante: ${r.status}`)
  check(inv?.invoice?.authorized === false, 'dice que aun no esta autorizado')
  check(typeof inv?.invoice?.message === 'string' && inv.invoice.message.length > 0, 'explica la situacion en lenguaje llano')
  check(inv?.invoice?.responseMessage === null, 'no filtra el detalle tecnico del SRI al cliente')
  check(!('authorizationNumber' in (inv?.invoice || {})) || inv.invoice.authorizationNumber === null, 'no inventa una autorizacion')

  r = await fetch(`${BASE}/api/orders/${orderId}/ride`, { headers: c1 })
  check(r.status === 409, `sin autorizacion avisa en vez de servir un PDF sin validez: ${r.status}`)
  const cuerpo = await r.json().catch(() => null)
  check(Boolean(cuerpo?.error), 'el error se explica en lenguaje llano')
  check(cuerpo?.status === 'RECEIVED', 'ademas informa del estado real')

  console.log('\n=== 3. Aislamiento entre clientes ===')
  r = await fetch(`${BASE}/api/orders/${orderId}/invoice`, { headers: c2 })
  check(r.status === 404, `otro cliente no ve el comprobante: ${r.status}`)
  r = await fetch(`${BASE}/api/orders/${orderId}/ride`, { headers: c2 })
  check(r.status === 404, `otro cliente no descarga la RIDE: ${r.status}`)
  r = await fetch(`${BASE}/api/orders/${orderId}/ride`)
  check(r.status === 401, `sin sesion no se descarga: ${r.status}`)
  r = await fetch(`${BASE}/api/orders/repeat/last`)
  check(r.status === 401, `sin sesion no se repite: ${r.status}`)

  console.log('\n=== 4. RIDE autorizada ===')
  // Emitir de verdad contra el SRI no es posible en pruebas. Lo que se verifica
  // aqui es el render, el aislamiento y el contrato con el cliente.
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'AUTHORIZED',
      accessKey: '1234' + '0'.repeat(40),
      authorizationNumber: '1700000000',
      authorizationDate: new Date(),
      environment: 1,
    },
  })
  r = await fetch(`${BASE}/api/orders/${orderId}/ride`, { headers: c1 })
  check(r.status === 200, `la RIDE se descarga: ${r.status}`)
  check(r.headers.get('content-type') === 'application/pdf', 'es un PDF')
  const pdf = Buffer.from(await r.arrayBuffer())
  check(pdf.subarray(0, 4).toString() === '%PDF', 'el contenido es un PDF valido')
  check(pdf.length > 1000, `el PDF tiene contenido (${pdf.length} bytes)`)
  check((r.headers.get('content-disposition') || '').includes('.pdf'), 'se descarga con nombre de archivo')

  r = await fetch(`${BASE}/api/orders/${orderId}/invoice`, { headers: c1 })
  const inv2 = await r.json()
  check(inv2.invoice.authorized === true, 'el comprobante ahora figura autorizado')
  check(inv2.invoice.accessKey?.length === 44, 'expone la clave de acceso')
  check(typeof inv2.invoice.total === 'number', 'expone el total facturado')
  check(inv2.invoice.message === null, 'sin avisos cuando ya esta autorizado')

  // Una vez autorizada, cancelar deja de ser libre: la factura ya existe.
  r = await sesion('POST', `/api/orders/${orderId}/cancel`)
  const canc = await r.json().catch(() => null)
  check(r.status === 400, `cancelar con comprobante autorizado se bloquea: ${r.status}`)
  check(canc?.code === 'INVOICE_AUTHORIZED', `con el codigo que el panel entiende (${canc?.code})`)

  console.log('\n=== 5. Repetir pedido ===')
  r = await fetch(`${BASE}/api/orders/repeat/last`, { headers: c1 })
  const rep = await r.json()
  check(r.status === 200, `la ruta responde: ${r.status}`)
  check(rep.available === true, 'hay pedido anterior que repetir')
  check(rep.items?.length === 1, `devuelve los productos (${rep.items?.length})`)
  check(rep.items?.[0]?.productId === prod.id, 'es el mismo producto')
  check(rep.items?.[0]?.quantity === 2, 'repite la cantidad pedida')
  check(typeof rep.items?.[0]?.currentPrice === 'number', 'informa el precio vigente')
  check(rep.priceChanged === false, 'avisa que el precio no cambio')
  check(rep.items?.[0]?.stock === 48, `el stock refleja lo descontado (${rep.items?.[0]?.stock})`)

  r = await fetch(`${BASE}/api/orders/repeat/last`, { headers: c2 })
  const rep2 = await r.json()
  check(rep2.available === false, 'un cliente sin pedidos no puede repetir')

  // Producto retirado: no debe aparecer en la recompra.
  await prisma.product.update({ where: { id: prod.id }, data: { active: false } })
  r = await fetch(`${BASE}/api/orders/repeat/last`, { headers: c1 })
  const rep3 = await r.json()
  check(rep3.available === false, 'un producto inactivo no se ofrece para repetir')
  check(rep3.missing?.length === 1, 'y se informa cual ya no esta')

  // Un pedido cancelado no es un historial que haya que repetir.
  await prisma.product.update({ where: { id: prod.id }, data: { active: true } })
  const cancelado = await prisma.order.findFirst({ where: { id: orderId } })
  await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } })
  r = await fetch(`${BASE}/api/orders/repeat/last`, { headers: c1 })
  check((await r.json()).available === false, 'un pedido cancelado no se propone para repetir')
  await prisma.order.update({ where: { id: orderId }, data: { status: cancelado.status } })

  console.log('\n=== 6. Busqueda sin tildes ===')
  await prisma.product.create({
    data: {
      name: 'Jugo de Mango',
      slug: rand('jugo-'),
      price: 3,
      stock: 10,
      unit: 'unidad',
      categoryId: cat.id,
    },
  })
  const buscar = async (q, extra = '') => {
    const res = await fetch(`${BASE}/api/catalog/products?search=${encodeURIComponent(q)}${extra}`)
    const cuerpo = await res.json().catch(() => null)
    if (!cuerpo?.products) throw new Error(`buscar "${q}" fallo: HTTP ${res.status}`)
    return cuerpo
  }
  let b = await buscar('papa')
  check(b.products.some((p) => p.name === 'Papa para la RIDE'), '"papa" encuentra "Papa"')
  b = await buscar('PAPA')
  check(b.products.length > 0, '"PAPA" en mayusculas tambien encuentra')
  b = await buscar('pápá')
  check(b.products.some((p) => p.name === 'Papa para la RIDE'), '"pápá" con tilde tambien')
  b = await buscar('mango')
  check(b.products.some((p) => p.name === 'Jugo de Mango'), 'encuentra por otra palabra')
  b = await buscar('jugo')
  check(b.products.some((p) => p.name === 'Jugo de Mango'), '"jugo" encuentra "Jugo de Mango"')
  // La coincidencia es por subcadena: "papa" encuentra "Papa" aunque el nombre
  // siga después. Un plural buscado que no aparece literal ("papas" para un
  // producto llamado "Papa") no se resuelve, y no se promete lo que no se hace.
  b = await buscar('Papa para')
  check(b.products.some((p) => p.name === 'Papa para la RIDE'), 'coincide por subcadena en medio del nombre')
  b = await buscar('xyzqwerty')
  check(b.products.length === 0, 'un termino inexistente no devuelve nada')
  check(b.suggestions?.length > 0, 'pero si ofrece alternativas')
  b = await buscar('a')
  check(b.products.length === 0, 'un termino de una letra no devuelve medio catalogo')

  // Ordenes y filtros siguen conviviendo con la busqueda.
  //
  // No se comprueba `length === 1`: el catálogo de la base puede tener productos
  // reales del seed, y una prueba que exige estar solo se rompe en cuanto la
  // tienda tiene existencias. Se comprueba que aparece el producto de la prueba
  // y que el orden se respeta entre los resultados.
  b = await buscar('Papa', '&sort=price_desc')
  check(b.products.some((p) => p.name === 'Papa para la RIDE'), 'buscar con orden explicito funciona')
  const preciosDesc = b.products.map((p) => Number(p.price))
  check(
    preciosDesc.every((v, i) => i === 0 || preciosDesc[i - 1] >= v),
    `ordena por precio descendente (${preciosDesc.slice(0, 4).join(', ')})`,
  )
  b = await buscar('jugo', '&sort=price_asc')
  check(b.products.some((p) => p.name === 'Jugo de Mango'), 'orden por precio ascendente con busqueda')
  const preciosAsc = b.products.map((p) => Number(p.price))
  check(
    preciosAsc.every((v, i) => i === 0 || preciosAsc[i - 1] <= v),
    `el precio ascendente sale ordenado (${preciosAsc.slice(0, 4).join(', ')})`,
  )
  b = await buscar('Papa', `&category=${cat.slug}`)
  check(
    b.products.length > 0 && b.products.every((p) => p.name === 'Papa para la RIDE'),
    'la busqueda respeta el filtro de categoria',
  )
  b = await buscar('Jugo', `&category=${cat.slug}`)
  check(
    b.products.length > 0 && b.products.every((p) => p.name === 'Jugo de Mango'),
    'filtro de categoria con otro producto de la misma',
  )
  r = await fetch(`${BASE}/api/catalog/products?all=true`)
  check(r.ok, 'el modo all=true del checkout sigue disponible')
  

  console.log('\n=== 6b. El precio es el de la bandeja, no el del gramo ===')
  // El caso real del catálogo: champiñones a $1 la bandeja de 400 g. Con la
  // regla anterior el servidor cobraba 1 x 400 = $400 por una sola bandeja.
  const bandeja = await prisma.product.create({
    data: {
      name: 'Champiñones en bandeja',
      slug: rand('champinones-'),
      price: 1,
      discount: 0,
      unit: 'Gramos',
      minQuantity: 400,
      stepQuantity: 400,
      // Stock en gramos: 4000 g permiten diez bandejas. Queda anotado aparte que
      // el stock y la cantidad comparten unidad, así que un stock pequeño deja el
      // producto invendible aunque haya existencias de sobra.
      stock: 4000,
      categoryId: cat.id,
      ivaRate: 15,
    },
  })

  const unaBandeja = await pedir([{ productId: bandeja.id, quantity: 400 }])
  check(unaBandeja.res.ok, `pedido de una bandeja: ${unaBandeja.res.status} ${unaBandeja.body?.error || ''}`)
  const o1 = unaBandeja.body?.order
  if (o1) {
    check(Number(o1.subtotal) === 1, `una bandeja de 400 g cuesta $1, no $400 (subtotal=${o1.subtotal})`)
    const linea = o1.items?.[0]
    check(Number(linea?.price) === 0.0025, `la linea guarda el precio por gramo (${linea?.price})`)
    check(Number(linea?.quantity) === 400, `la linea guarda 400 g (${linea?.quantity})`)
    await prisma.order.delete({ where: { id: o1.id } })
  }

  const tresBandejas = await pedir([{ productId: bandeja.id, quantity: 1200 }])
  const o3 = tresBandejas.body?.order
  if (o3) {
    check(Number(o3.subtotal) === 3, `tres bandejas cuestan $3 (subtotal=${o3.subtotal})`)
    check(Number(o3.subtotal) !== 1200, 'y no $1200')
    await prisma.order.delete({ where: { id: o3.id } })
  }

  // Media bandeja no existe: el servidor lo rechaza por el paso de venta.
  const media = await pedir([{ productId: bandeja.id, quantity: 635 }])
  check(!media.res.ok, `635 g no se puede pedir: HTTP ${media.res.status}`)
  check(media.body?.code === 'INVALID_STEP', `con el codigo de paso de venta (${media.body?.code})`)
  check(/400 Gramos/.test(media.body?.error || ''), 'y el mensaje dice cuál es el paso')

  // El precio del catálogo sigue siendo el de la bandeja en la respuesta.
  r = await fetch(`${BASE}/api/catalog/products?search=Champinones`)
  const catalogo = await r.json()
  const enCatalogo = catalogo.products.find((p) => p.id === bandeja.id)
  check(Number(enCatalogo?.price) === 1, 'el catálogo sigue mostrando $1')
  check(Number(enCatalogo?.minQuantity) === 400, 'y que el mínimo es 400 g')
  check(Number(enCatalogo?.stepQuantity) === 400, 'y que se vende en bandejas de 400 g')

  console.log('\n=== 7. El catalogo sigue abierto ===')
  const catNo = await fetch(`${BASE}/api/catalog/products?limit=200`)
  check(catNo.status === 200, 'el catalogo es publico sin sesion')

  datos = { email, email2, cat, zona }
} finally {
  await server.kill()
}

console.log('\n=== Limpieza ===')
if (datos) {
  await prisma.order.deleteMany({ where: { user: { email: { in: [datos.email, datos.email2] } } } })
  await prisma.product.deleteMany({
      where: { name: { in: ['Papa para la RIDE', 'Jugo de Mango', 'Champiñones en bandeja'] } },
    })
  await prisma.category.deleteMany({ where: { id: datos.cat.id } })
  await prisma.deliveryZone.deleteMany({ where: { id: datos.zona.id } })
  await prisma.user.deleteMany({ where: { email: { in: [datos.email, datos.email2] } } })
  console.log('  datos de prueba eliminados')
}
await prisma.$disconnect()

console.log(`\n=== Resultado: ${ok}/${ok + fail} comprobaciones ===`)
process.exit(fail === 0 ? 0 : 1)