<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Configuración</h1>
        <p class="muted admin-sub">Controla cómo funciona tu tienda y las entregas</p>
      </div>
      <button v-if="!loading" class="btn btn-primary btn-sm" @click="save" :disabled="saving">
        {{ saving ? 'Guardando…' : 'Guardar cambios' }}
      </button>
    </div>

    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save">
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

      <div class="admin-card">
        <h2>Apariencia</h2>
        <div class="form-group">
          <label>Color destacado de la tienda</label>
          <div class="color-row">
            <input type="color" v-model="form.accentColor" class="color-input" />
            <input v-model="form.accentColor" class="form-control color-hex" maxlength="7" />
            <button type="button" class="btn btn-outline btn-sm" @click="form.accentColor = '#1B5E20'">Restablecer</button>
          </div>
          <p class="muted color-help">Este color se usa en botones, enlaces y acentos de toda la tienda. Se aplica automáticamente.</p>
        </div>
      </div>

      <div class="admin-card">
        <h2>Entregas y envío</h2>
        <div class="form-grid">
          <div class="form-group"><label>Radio de entrega (km)</label><input v-model.number="form.deliveryRadiusKm" type="number" step="0.5" min="0" class="form-control" /></div>
          <div class="form-group"><label>Tarifa base de envío (USD)</label><input v-model.number="form.deliveryFeeBase" type="number" step="0.25" min="0" class="form-control" /></div>
          <div class="form-group"><label>Costo por km (USD)</label><input v-model.number="form.deliveryFeePerKm" type="number" step="0.05" min="0" class="form-control" /></div>
          <div class="form-group"><label>Pedido mínimo (USD)</label><input v-model.number="form.minOrderAmount" type="number" step="0.5" min="0" class="form-control" /></div>
          <div class="form-group"><label>Hora de corte para pedidos (HH:MM)</label><input v-model="form.orderCutoff" class="form-control" placeholder="18:00" /></div>
        </div>

        <div class="form-group">
          <label>Días de entrega</label>
          <div class="day-checks">
            <label v-for="(label, i) in dayLabels" :key="i" class="day-check">
              <input type="checkbox" :checked="form.deliveryDays.includes(i)" @change="toggleDay(i)" />
              {{ label }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>Horario de atención por día</label>
          <div class="hours-list">
            <div v-for="(label, i) in dayLabels" :key="i" class="hours-row">
              <span class="hours-day">{{ label }}</span>
              <label class="hours-closed"><input type="checkbox" v-model="openHoursArr[i].closed" /> Cerrado</label>
              <input v-model="openHoursArr[i].open" class="form-control time" :disabled="openHoursArr[i].closed" />
              <span>a</span>
              <input v-model="openHoursArr[i].close" class="form-control time" :disabled="openHoursArr[i].closed" />
            </div>
          </div>
        </div>
      </div>

      <div class="admin-card">
        <h2>Horarios de entrega (slots)</h2>
        <div v-for="(slot, idx) in form.slots" :key="idx" class="slot-row">
          <input v-model="slot.label" class="form-control" placeholder="Etiqueta (Ej: Mañana)" />
          <input v-model="slot.start" class="form-control time" placeholder="08:00" />
          <span>a</span>
          <input v-model="slot.end" class="form-control time" placeholder="12:00" />
          <input v-model.number="slot.capacity" type="number" min="0" class="form-control capacity" placeholder="Cap." title="Capacidad de pedidos" />
          <button type="button" class="btn btn-danger btn-sm" @click="form.slots.splice(idx, 1)">✕</button>
        </div>
        <button type="button" class="btn btn-outline btn-sm" @click="addSlot">+ Agregar horario</button>
      </div>

      <div class="admin-card">
        <h2>Datos bancarios (transferencia)</h2>
        <div class="form-grid">
          <div class="form-group"><label>Banco</label><input v-model="form.bankTransfer.bank" class="form-control" /></div>
          <div class="form-group"><label>Titular</label><input v-model="form.bankTransfer.accountName" class="form-control" /></div>
          <div class="form-group"><label>Número de cuenta</label><input v-model="form.bankTransfer.accountNumber" class="form-control" /></div>
          <div class="form-group"><label>Tipo (Ahorros/Corriente)</label><input v-model="form.bankTransfer.accountType" class="form-control" /></div>
          <div class="form-group"><label>Nota para el cliente</label><input v-model="form.bankTransfer.note" class="form-control" /></div>
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
import { applyAccentColor } from '../../lib/accent.js'

const form = ref(null)
const openHoursArr = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    form.value = JSON.parse(JSON.stringify(data.settings))
    form.value.accentColor = form.value.accentColor || '#1B5E20'
    openHoursArr.value = [0, 1, 2, 3, 4, 5, 6].map((d) => form.value.openHours[d] || { open: '07:00', close: '18:00', closed: false })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function toggleDay(i) {
  if (form.value.deliveryDays.includes(i)) {
    form.value.deliveryDays = form.value.deliveryDays.filter((d) => d !== i)
  } else {
    form.value.deliveryDays.push(i)
    form.value.deliveryDays.sort()
  }
}

function addSlot() {
  form.value.slots.push({ id: `slot-${Date.now()}`, label: 'Nuevo horario', start: '08:00', end: '12:00', capacity: 20 })
}

async function save() {
  error.value = ''
  saved.value = false
  saving.value = true
  try {
    const openHours = {}
    openHoursArr.value.forEach((h, d) => (openHours[d] = { ...h }))
    await api.put('/api/admin/settings', { ...form.value, openHours })
    applyAccentColor(form.value.accentColor)
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

<style scoped>
.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--green-dark);
}

.admin-sub {
  margin-bottom: 0;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-input {
  width: 52px;
  height: 42px;
  padding: 0;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.color-hex {
  max-width: 140px;
  text-transform: uppercase;
}

.color-help {
  font-size: 0.8rem;
  margin-top: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.day-checks {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.day-check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--gray-mid);
  border-radius: 50px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.hours-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hours-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hours-day {
  width: 56px;
  font-weight: 700;
  font-size: 0.88rem;
}

.hours-closed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--gray);
}

.time {
  width: 90px;
  text-align: center;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.slot-row input {
  padding: 10px 12px;
}

.capacity {
  width: 90px;
}

.saved-note {
  color: var(--green-mid);
  font-weight: 700;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 700px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .slot-row {
    flex-wrap: wrap;
  }
}
</style>
