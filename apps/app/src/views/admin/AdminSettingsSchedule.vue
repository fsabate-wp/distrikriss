<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Horarios de atención</h2>
        <p class="muted">Los días y franjas de entrega se configuran por zona en la pestaña
          <router-link to="/admin/configuracion/zonas">Zonas</router-link>.</p>
        <div class="hours-list">
          <div v-for="day in DAYS" :key="day.value" class="hours-row">
            <span class="hours-day">{{ day.label }}</span>
            <input v-model="form.openHours[day.value].open" type="time" class="form-control time" :disabled="form.openHours[day.value].closed" />
            <input v-model="form.openHours[day.value].close" type="time" class="form-control time" :disabled="form.openHours[day.value].closed" />
            <label class="hours-closed"><input type="checkbox" v-model="form.openHours[day.value].closed" /> Cerrado</label>
          </div>
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

const DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
]

const form = ref(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)

function emptyHours() {
  const hours = {}
  for (const day of DAYS) {
    hours[day.value] = { open: '08:00', close: '20:00', closed: day.value === 0 }
  }
  return hours
}

function normalizeOpenHours(raw) {
  const base = emptyHours()
  if (raw && typeof raw === 'object') {
    for (const day of DAYS) {
      const entry = raw[day.value]
      if (entry) base[day.value] = { ...base[day.value], ...entry }
    }
  }
  return base
}

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    form.value = {
      openHours: normalizeOpenHours(data.settings.openHours),
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
    await api.put('/api/admin/settings', {
      openHours: form.value.openHours,
    })
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
