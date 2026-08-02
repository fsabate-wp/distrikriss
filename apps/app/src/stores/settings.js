import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: null,
  }),
  getters: {
    storeLocation: (s) =>
      s.settings ? { lat: s.settings.storeLat, lng: s.settings.storeLng } : null,
    deliveryRadiusKm: (s) => s.settings?.deliveryRadiusKm || 0,
    storeOpen: (s) => (s.settings ? s.settings.storeOpen !== false : true),
    faviconUrl: (s) => s.settings?.faviconUrl || '',
    appIconUrl: (s) => s.settings?.appIconUrl || '',
  },
  actions: {
    async load() {
      if (this.settings) return
      try {
        const data = await api.get('/api/settings/public')
        this.settings = data.settings
      } catch {
        this.settings = null
      }
    },
  },
})
