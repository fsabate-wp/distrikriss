import { defineStore } from 'pinia'
import { discountedPrice } from '../utils/format.js'

const STORAGE_KEY = 'distrikriss-cart'

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    return raw
      .filter((i) => i && i.productId)
      .map((i) => ({
        ...i,
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
      }))
  } catch {
    return []
  }
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: loadCart(),
  }),
  getters: {
    count: (s) => s.items.reduce((acc, i) => acc + i.quantity, 0),
    subtotal: (s) =>
      Math.round(s.items.reduce((acc, i) => acc + i.price * i.quantity, 0) * 100) / 100,
    itemsById: (s) => new Map(s.items.map((i) => [i.productId, i])),
  },
  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items))
    },
    add(product, quantity = null) {
      const minQ = Number(product.minQuantity) || 1
      const step = Number(product.stepQuantity) || 1
      const qty = quantity != null ? Number(quantity) : minQ
      const existing = this.items.find((i) => i.productId === product.id)
      if (existing) {
        existing.quantity = Math.round((existing.quantity + qty) * 100) / 100
      } else {
        this.items.push({
          productId: product.id,
          name: product.name,
          sku: product.sku || null,
          unit: product.unit,
          presentation: product.presentation || null,
          minQuantity: minQ,
          stepQuantity: step,
          price: discountedPrice(product.price, product.discount),
          imageUrl: product.imageUrl || null,
          quantity: qty,
        })
      }
      this.persist()
    },
    setQuantity(productId, quantity) {
      quantity = Number(quantity)
      if (!Number.isFinite(quantity)) return
      const item = this.items.find((i) => i.productId === productId)
      if (item) {
        const minQ = Number(item.minQuantity) || 1
        if (quantity < minQ - 1e-9) quantity = minQ
        if (quantity <= 0) this.remove(productId)
        else {
          item.quantity = Math.round(quantity * 100) / 100
          this.persist()
        }
      }
    },
    increment(productId) {
      const item = this.items.find((i) => i.productId === productId)
      if (!item) return
      const step = Number(item.stepQuantity) || 1
      this.setQuantity(productId, Math.round((item.quantity + step) * 100) / 100)
    },
    decrement(productId) {
      const item = this.items.find((i) => i.productId === productId)
      if (!item) return
      const step = Number(item.stepQuantity) || 1
      const minQ = Number(item.minQuantity) || 1
      const next = Math.round((item.quantity - step) * 100) / 100
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
  },
})
