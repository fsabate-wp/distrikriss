import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    categories: [],
    products: [],
    loading: false,
    category: null,
    search: '',
    sort: 'recent',
  }),
  actions: {
    async loadCategories() {
      try {
        const data = await api.get('/api/catalog/categories')
        this.categories = data.categories
      } catch {
        this.categories = []
      }
    },
    async loadProducts(params = {}) {
      this.loading = true
      try {
        const query = {
          category: this.category,
          search: this.search,
          sort: this.sort,
          ...params,
        }
        const data = await api.get('/api/catalog/products', query)
        this.products = data.products
      } finally {
        this.loading = false
      }
    },
    async refresh() {
      await this.loadCategories()
      await this.loadProducts()
    },
  },
})
