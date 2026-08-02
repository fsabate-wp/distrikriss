import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    categories: [],
    products: [],
    featured: [],
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
    async loadFeatured() {
      try {
        const data = await api.get('/api/catalog/products', { featured: 'true', limit: 12 })
        this.featured = data.products
      } catch {
        this.featured = []
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
      await this.loadFeatured()
      await this.loadProducts()
    },
  },
})
