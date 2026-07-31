import { defineStore } from 'pinia'

const STORAGE_KEY = 'distrikriss-cart'

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
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
    add(product, quantity = 1) {
      const existing = this.items.find((i) => i.productId === product.id)
      if (existing) {
        existing.quantity += quantity
      } else {
        this.items.push({
          productId: product.id,
          name: product.name,
          unit: product.unit,
          price: Number(product.price),
          imageUrl: product.imageUrl || null,
        })
      }
      this.persist()
    },
    setQuantity(productId, quantity) {
      const item = this.items.find((i) => i.productId === productId)
      if (item) {
        if (quantity <= 0) this.remove(productId)
        else {
          item.quantity = quantity
          this.persist()
        }
      }
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
