import { defineStore } from 'pinia'
import { discountedPrice, precioPorUnidad, pasoDeVenta } from '../utils/format.js'

const STORAGE_KEY = 'distrikriss-cart'

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    return raw
      .filter((i) => i && i.productId)
      .map((i) => {
        const price = Number(i.price) || 0
        const legacy = i.salePrice == null
        return {
          ...i,
          // Los carritos guardados antes de este cambio tenían el precio de la
          // bandeja en `price`. Se convierte a precio por unidad para que el
          // total no salga multiplicado por el peso del empaque.
          price: legacy ? precioPorUnidad(price, i.minQuantity) : price,
          // salePrice es el precio de la bandeja, el que se le enseña al cliente.
          salePrice: legacy ? price : Number(i.salePrice),
          quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
        }
      })
  } catch {
    return []
  }
}

/**
 * Cuántas unidades hay en el carrito de un producto.
 *
 * El servidor suma las líneas repetidas del mismo producto antes de validar el
 * stock. El carrito guardaba una sola línea por producto, pero una petición
 * manipulada puede enviar varias: la cuenta se hace aquí para que el contador
 * coincida con lo que el servidor cobrará.
 */
function cantidadDe(items, productId) {
  return items
    .filter((i) => i.productId === productId)
    .reduce((acc, i) => acc + Number(i.quantity || 0), 0)
}

/**
 * Cuánto suma un botón de "+" o de "−".
 *
 * Cuando el producto se vende por empaque, el botón mueve UN empaque entero, no
 * el paso de venta en gramos. Con el paso se veía "665 gramos" en el icono del
 * cabecera y el "+ caja" añadía 30 gramos en vez de una caja, según el valor
 * que hubiera en el paso del producto.
 *
 * El paso sigue importando: es lo que el servidor valida. Pero lo que la persona
 * ve y toca son cajas.
 */
function saltoDe(item) {
  return pasoDeVenta(item?.minQuantity, item?.stepQuantity)
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: loadCart(),
  }),
  getters: {
    count: (s) => s.items.reduce((acc, i) => acc + Number(i.quantity || 0), 0),
    /**
     * Cuántas cosas compró el cliente, en la unidad en la que se venden.
     *
     * `count` suma gramos: con una caja de 635 g marcaba 665 en el icono, que no
     * quiere decir nada. Aquí se cuentan cajas: 2 cajas de uva son 2, no 1270.
     */
    unitCount: (s) =>
      s.items.reduce((acc, i) => {
        const cantidad = Number(i.quantity || 0)
        const minQ = Number(i.minQuantity) || 1
        return acc + (minQ > 1 ? Math.round((cantidad / minQ) * 100) / 100 : cantidad)
      }, 0),
    // El servidor redondea cada línea antes de sumar (server/src/lib/precios.js).
    // Se replica aquí para que el total del checkout coincida con el que se cobra.
    subtotal: (s) =>
      Math.round(s.items.reduce((acc, i) => acc + Math.round(i.price * i.quantity * 100) / 100, 0) * 100) / 100,
    itemsById: (s) => new Map(s.items.map((i) => [i.productId, i])),
    /** Agrupa líneas del mismo producto: el servidor las suma, el cliente también. */
    grouped: (s) => {
      const mapa = new Map()
      for (const item of s.items) {
        const actual = mapa.get(item.productId)
        if (actual) {
          actual.quantity = Math.round((actual.quantity + Number(item.quantity)) * 100) / 100
          actual.lineCount += 1
        } else {
          mapa.set(item.productId, { ...item, lineCount: 1 })
        }
      }
      return [...mapa.values()]
    },
    quantityOf: (s) => (productId) => cantidadDe(s.items, productId),
  },
  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items))
    },
    add(product, quantity = null) {
      const stock = Number(product.stock)
      // `stock = -1` significa SIN LÍMITE, no "agotado". La comprobación era
      // `stock <= 0`, que descartaba de vuelta cualquier producto con stock
      // ilimitado: como el esquema usa -1 por defecto y la importación CSV lo
      // fija en -1, el botón "+" de la tarjeta no hacía nada y sin error ni
      // aviso. Solo el cero real significa agotado.
      const ilimitado = !Number.isFinite(stock) || stock < 0
      if (!ilimitado && stock === 0) return false
      const minQ = Number(product.minQuantity) || 1
      const step = Number(product.stepQuantity) || 1
      const qty = quantity != null ? Number(quantity) : minQ
      if (!Number.isFinite(qty) || qty <= 0) return false

      const existing = this.items.find((i) => i.productId === product.id)
      if (existing) {
        const nueva = Math.round((existing.quantity + qty) * 100) / 100
        // El servidor rechaza pasar del stock disponible: avisar aquí evita
        // llegar al checkout para que falle.
        if (!ilimitado && nueva > stock) return false
        existing.quantity = nueva
      } else {
        // Con stock acotado, no se puede añadir más de lo que queda.
        if (!ilimitado && qty > stock) return false
        this.items.push({
          productId: product.id,
          name: product.name,
          sku: product.sku || null,
          unit: product.unit,
          presentation: product.presentation || null,
          minQuantity: minQ,
          stepQuantity: step,
          // price es el precio POR UNIDAD, que es lo que se multiplica por la
          // cantidad. El catálogo guarda el precio de la bandeja, así que una
          // bandeja de 400 g a $1 tiene que guardarse como 0.0025.
          price: precioPorUnidad(discountedPrice(product.price, product.discount), minQ),
          // salePrice es el precio de la bandeja, el que se enseña al cliente.
          // Sin él, un producto a granel aparecería con "$0.00 / g".
          salePrice: discountedPrice(product.price, product.discount),
          imageUrl: product.imageUrl || null,
          quantity: qty,
        })
      }
      this.persist()
      return true
    },
    setQuantity(productId, quantity) {
      quantity = Number(quantity)
      if (!Number.isFinite(quantity)) return
      const item = this.items.find((i) => i.productId === productId)
      if (!item) return
      const minQ = Number(item.minQuantity) || 1
      // El ajuste va en la unidad en la que se vende. Con un producto por
      // empaque, ajustar al paso en gramos dejaba cantidades que no eran
      // ninguna caja entera: 1270 g se convertían en 1260 porque 1260 es
      // múltiplo de 30 y 1270 no. El servidor valida el paso real igual.
      const step = saltoDe(item)
      if (quantity < minQ - 1e-9) quantity = minQ
      if (quantity <= 0) {
        this.remove(productId)
        return
      }
      // El servidor exige múltiplos del paso de venta. Ajustar aquí evita que el
      // cliente llegue al checkout con una cantidad que el servidor rechazará.
      if (step > 0) {
        const pasos = Math.max(1, Math.round(quantity / step))
        const ajustado = Math.round(pasos * step * 100) / 100
        // Solo se ajusta si el ajuste no deja la cantidad por debajo del mínimo.
        if (ajustado >= minQ - 1e-9) quantity = ajustado
      }
      item.quantity = Math.round(quantity * 100) / 100
      this.persist()
    },
    increment(productId) {
      const item = this.items.find((i) => i.productId === productId)
      if (!item) return
      this.setQuantity(productId, item.quantity + saltoDe(item))
    },
    decrement(productId) {
      const item = this.items.find((i) => i.productId === productId)
      if (!item) return
      const minQ = Number(item.minQuantity) || 1
      const next = Math.round((item.quantity - saltoDe(item)) * 100) / 100
      if (next < minQ - 1e-9) this.remove(productId)
      else this.setQuantity(productId, next)
    },
    remove(productId) {
      this.items = this.items.filter((i) => i.productId !== productId)
      this.persist()
    },
    clear() {
      this.items = []
      this.persist()
    },

    /**
     * Vuelca varios productos de golpe, usado por "pedir lo de siempre".
     *
     * Los productos vienen del endpoint `/api/orders/repeat/last`, que ya los
     * filtró contra el catálogo actual y trae el stock vigente. Se reintenta uno
     * por uno con `add()` para respetar las mismas reglas (mínimo, paso,
     * unidades disponibles) y se reporta qué quedó fuera, en lugar de fallar
     * entero: es mejor volver a pedir la mitad de las cosas que no poder
     * repetir nada.
     *
     * Devuelve `{ agregados, omitidos, priceChanged }`.
     */
    addMany(items) {
      const omitidos = []
      let agregados = 0
      let priceChanged = false
      for (const item of items || []) {
        if (item.available === false) {
          omitidos.push({ name: item.name, motivo: 'agotado' })
          continue
        }
        // Acota al stock que el servidor acaba de reportar: entre la respuesta
        // y este clic puede haber caído.
        let cantidad = Number(item.quantity) || Number(item.minQuantity) || 1
        if (Number.isFinite(item.stock) && item.stock >= 0) {
          cantidad = Math.min(cantidad, Math.max(item.stock, 0))
          if (cantidad < Number(item.minQuantity)) {
            omitidos.push({ name: item.name, motivo: 'queda poco stock' })
            continue
          }
        }
        const ok = this.add({ ...item, stock: item.stockLimit ?? item.stock }, cantidad)
        if (ok) agregados += 1
        else omitidos.push({ name: item.name, motivo: 'no disponible' })
        if (Number(item.lastPrice) !== Number(item.currentPrice)) priceChanged = true
      }
      return { agregados, omitidos, priceChanged }
    },
  },
})
