<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Estado de la tienda</h2>
        <div class="switch-row">
          <label class="switch">
            <input type="checkbox" v-model="form.storeOpen" />
            <span class="switch-slider"></span>
          </label>
          <div class="switch-text">
            <strong>{{ form.storeOpen ? 'Tienda abierta' : 'Tienda pausada' }}</strong>
            <p class="muted">Al pausar la tienda, los clientes no verán productos ni podrán hacer pedidos.</p>
          </div>
        </div>
      </div>

      <div class="admin-card">
        <h2>Información de la tienda</h2>
        <div class="form-grid">
          <div class="form-group"><label>Nombre</label><input v-model="form.storeName" class="form-control" required /></div>
          <div class="form-group"><label>Moneda</label><input v-model="form.currency" class="form-control" required /></div>
          <div class="form-group"><label>Teléfono</label><input v-model="form.phone" class="form-control" /></div>
          <div class="form-group"><label>WhatsApp (con código país)</label><input v-model="form.whatsapp" class="form-control" /></div>
          <div class="form-group"><label>Email</label><input v-model="form.email" class="form-control" /></div>
          <div class="form-group"><label>Dirección</label><input v-model="form.storeAddress" class="form-control" /></div>
          <div class="form-group"><label>Latitud</label><input v-model.number="form.storeLat" type="number" step="0.000001" class="form-control" /></div>
          <div class="form-group"><label>Longitud</label><input v-model.number="form.storeLng" type="number" step="0.000001" class="form-control" /></div>
        </div>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="saved-note">✓ Cambios guardados</p>

      <div class="actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'
import { useSettingsStore } from '../../stores/settings.js'

const form = ref(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const settingsStore = useSettingsStore()

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    form.value = {
      storeName: data.settings.storeName,
      currency: data.settings.currency,
      phone: data.settings.phone || '',
      whatsapp: data.settings.whatsapp || '',
      email: data.settings.email || '',
      storeAddress: data.settings.storeAddress || '',
      storeLat: data.settings.storeLat,
      storeLng: data.settings.storeLng,
      storeOpen: data.settings.storeOpen !== false,
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function save() {
  error.value = ''
  saved.value = false
  saving.value = true
  try {
    await api.put('/api/admin/settings', { ...form.value })
    settingsStore.settings = {
      ...(settingsStore.settings || {}),
      storeName: form.value.storeName,
      storeOpen: form.value.storeOpen,
    }
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
