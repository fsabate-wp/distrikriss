<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Días de entrega</h2>
        <div class="day-checks">
          <label v-for="day in DAYS" :key="day.value" class="day-check">
            <input type="checkbox" :value="day.value" v-model="form.deliveryDays" />
            {{ day.label }}
          </label>
        </div>
      </div>

      <div class="admin-card">
        <h2>Horarios de atención</h2>
        <div class="hours-list">
          <div v-for="day in DAYS" :key="day.value" class="hours-row">
            <span class="hours-day">{{ day.label }}</span>
            <input v-model="form.openHours[day.value].open" type="time" class="form-control time" :disabled="form.openHours[day.value].closed" />
            <input v-model="form.openHours[day.value].close" type="time" class="form-control time" :disabled="form.openHours[day.value].closed" />
            <label class="hours-closed"><input type="checkbox" v-model="form.openHours[day.value].closed" /> Cerrado</label>
          </div>
        </div>
      </div>

      <div class="admin-card">
        <h2>Franjas de entrega</h2>
        <p class="muted">Las franjas se muestran al cliente al elegir cuándo recibir su pedido. La capacidad limita los pedidos por franja.</p>
        <div class="slot-rows">
          <div v-for="(slot, index) in form.slots" :key="slot.id" class="slot-row">
            <input v-model="slot.label" class="form-control" placeholder="Etiqueta" />
            <input v-model="slot.start" type="time" class="form-control time" />
            <input v-model="slot.end" type="time" class="form-control time" />
            <input v-model.number="slot.capacity" type="number" class="form-control capacity" placeholder="Capacidad" />
            <button type="button" class="btn btn-danger btn-sm" @click="removeSlot(index)">×</button>
          </div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" @click="addSlot">+ Agregar franja</button>
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
const settingsStore = useSettingsStore()

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

function normalizeSlots(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { id: 'morning', label: 'Mañana', start: '10:00', end: '12:00', capacity: 10 },
      { id: 'afternoon', label: 'Tarde', start: '14:00', end: '16:00', capacity: 10 },
    ]
  }
  return raw.map((s) => ({ id: String(s.id), label: s.label, start: s.start, end: s.end, capacity: Number(s.capacity) || 0 }))
}

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    form.value = {
      deliveryDays: Array.isArray(data.settings.deliveryDays) ? data.settings.deliveryDays.map(Number) : [],
      openHours: normalizeOpenHours(data.settings.openHours),
      slots: normalizeSlots(data.settings.slots),
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function addSlot() {
  form.value.slots.push({ id: 'slot-' + Date.now(), label: '', start: '10:00', end: '12:00', capacity: 10 })
}

function removeSlot(index) {
  form.value.slots.splice(index, 1)
}

async function save() {
  error.value = ''
  saved.value = false
  saving.value = true
  try {
    await api.put('/api/admin/settings', {
      deliveryDays: form.value.deliveryDays,
      openHours: form.value.openHours,
      slots: form.value.slots,
    })
    settingsStore.settings = {
      ...(settingsStore.settings || {}),
      deliveryDays: form.value.deliveryDays,
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
