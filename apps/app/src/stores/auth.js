import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: false,
    initialized: false,
  }),
  getters: {
    isAuthed: (s) => !!s.user,
    isAdmin: (s) => s.user?.role === 'ADMIN',
  },
  actions: {
    async fetchMe() {
      try {
        const data = await api.get('/api/auth/me')
        this.user = data.user
      } catch {
        this.user = null
      } finally {
        this.initialized = true
      }
    },
    async register(payload) {
      this.loading = true
      try {
        const data = await api.post('/api/auth/register', payload)
        this.user = data.user
        return { ok: true }
      } finally {
        this.loading = false
      }
    },
    async login(payload) {
      this.loading = true
      try {
        const data = await api.post('/api/auth/login', payload)
        this.user = data.user
        return { ok: true }
      } finally {
        this.loading = false
      }
    },
    async logout() {
      try {
        await api.post('/api/auth/logout')
      } catch {
        // noop
      }
      this.user = null
    },
  },
})
