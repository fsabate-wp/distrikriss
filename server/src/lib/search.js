/**
 * Búsqueda de productos tolerante a como escribe la gente.
 *
 * En Ecuador se escribe "papa" sin tilde, "PAPA" en mayúsculas y "pápas" en
 * plural con mucha frecuencia. PostgreSQL con `contains` y `mode: 'insensitive'`
 * no encuentra "papa" al buscar "Pápá". Para una tienda de verdura eso es perder
 * ventas en la barra de búsqueda, que es donde el cliente con intención clara
 * escribe.
 */

/** Quita tildes y pasa a minúsculas, para comparar sin depender de diacríticos. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Terminos de búsqueda, ya normalizados.
 * Un término de menos de 2 caracteres no discrimina y devuelve medio catálogo.
 */
export function terminosBusqueda(consulta, minimo = 2) {
  const limpio = normalizar(consulta).replace(/[^\p{L}\p{N}\s]/gu, ' ')
  return limpio
    .split(/\s+/)
    .filter((t) => t.length >= minimo)
    .slice(0, 6)
}

/**
 * Cantidad de palabras de un texto ya normalizado, para Puntuar la relevancia.
 * Busca "papa" dentro de "papas" con coincidencia de prefijo.
 */
function apariciones(textoNormalizado, termino) {
  if (!termino) return 0
  let cuenta = 0
  let desde = 0
  for (;;) {
    const i = textoNormalizado.indexOf(termino, desde)
    if (i === -1) break
    cuenta += 1
    desde = i + termino.length
  }
  return cuenta
}

/**
 * Puntúa un producto contra los términos de búsqueda.
 *
 * La relevancia importa tanto como el filtro: sin ella, un cliente que busca
 * "papa" puede ver primero un "papaWhole" de otro proveedor. Se puntúa el
 * nombre por encima de la descripción, y un nombre que empieza por el término
 * por encima de uno que solo lo contiene.
 */
export function puntuarProducto(producto, terminos) {
  // `terminosBusqueda` ya descarta los términos de una letra, pero esta función
  // es pública: si alguien la llama con "p", haría match con medio catálogo y
  // el orden por relevancia perdería sentido.
  const utiles = (terminos || []).filter((t) => t && t.length >= 2)
  if (!utiles.length) return 0
  const nombre = normalizar(producto.name)
  const descripcion = normalizar(producto.description || '')
  const presentacion = normalizar(producto.presentation || '')
  const sku = normalizar(producto.sku || '')
  const texto = `${nombre} ${descripcion} ${presentacion} ${sku}`

  let puntos = 0
  for (const t of utiles) {
    // Coincidencia por prefijo: "papa" encuentra "papas" y "papaya".
    const enNombre = apariciones(nombre, t)
    const enTexto = apariciones(texto, t)
    const enDescripcion = apariciones(descripcion, t)
    const enPresentacion = apariciones(presentacion, t)

    if (!enTexto) return -1 // el término debe aparecer en algún sitio

    if (nombre.startsWith(t)) puntos += 100
    else if (new RegExp(`\\b${escapar(t)}`).test(nombre)) puntos += 60
    else if (enNombre) puntos += 30

    if (enDescripcion) puntos += 8
    if (enPresentacion) puntos += 4
    if (sku === t) puntos += 40
    else if (sku.includes(t)) puntos += 10
    puntos += Math.min(enTexto, 5)
  }
  // Un término exacto en el nombre vale más que una coincidencia repartida.
  if (nombre === utiles.join(' ')) puntos += 150
  return puntos
}

function escapar(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Traduce un fragmento de consulta a un patrón de PostgreSQL insensible a tildes. */
export function patronSql(termino) {
  // `unaccent` no está disponible en todas las instalaciones, así que se usan
  // clases de caracteres explícitas: cada vocal con y sin tilde.
  const conTilde = {
    a: '[aáâä]', e: '[eéêë]', i: '[iíîï]', o: '[oóôö]', u: '[uúûü]',
    n: '[nñ]',
  }
  const partes = [...normalizar(termino)].map((c) => conTilde[c] || c)
  return partes.join('')
}

/** Reglas de ordenación admitidas por el catálogo. */
export const SORTS = ['relevancia', 'recientes', 'nombre', 'precio_asc', 'precio_desc']

/** Traduce el parámetro `sort` de la API al `orderBy` de Prisma. */
export function orderByDeCatalogo(sort, conBusqueda) {
  if (conBusqueda) return sort === 'relevancia' ? 'score' : null
  switch (sort) {
    case 'precio_asc':
      return 'price_asc'
    case 'precio_desc':
      return 'price_desc'
    case 'nombre':
      return 'name'
    case 'recientes':
      return 'newest'
    default:
      return 'newest'
  }
}