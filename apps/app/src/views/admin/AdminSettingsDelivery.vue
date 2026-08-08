<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Ubicación y entregas</h2>
        <div class="form-grid">
          <div class="form-group"><label>Dirección de la tienda</label><input v-model="form.storeAddress" class="form-control" /></div>
          <div class="form-group"><label>Radio de entrega (km)</label><input v-model.number="form.deliveryRadiusKm" type="number" step="0.1" class="form-control" /></div>
          <div class="form-group"><label>Costo base de envío ($)</label><input v-model.number="form.deliveryFeeBase" type="number" step="0.01" class="form-control" /></div>
          <div class="form-group"><label>Costo por km ($)</label><input v-model.number="form.deliveryFeePerKm" type="number" step="0.01" class="form-control" /></div>
          <div class="form-group"><label>Pedido mínimo ($)</label><input v-model.number="form.minOrderAmount" type="number" step="0.01" class="form-control" /></div>
          <div class="form-group"><label>Hora límite de pedidos</label><input v-model="form.orderCutoff" type="time" class="form-control" /></div>
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
      storeAddress: data.settings.storeAddress || '',
      deliveryRadiusKm: data.settings.deliveryRadiusKm,
      deliveryFeeBase: data.settings.deliveryFeeBase,
      deliveryFeePerKm: data.settings.deliveryFeePerKm,
      minOrderAmount: data.settings.minOrderAmount,
      orderCutoff: data.settings.orderCutoff || '',
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
      deliveryRadiusKm: form.value.deliveryRadiusKm,
      deliveryFeeBase: form.value.deliveryFeeBase,
      deliveryFeePerKm: form.value.deliveryFeePerKm,
      minOrderAmount: form.value.minOrderAmount,
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
