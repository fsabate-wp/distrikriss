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

        <div class="form-group">
          <label>Icono de la app (PWA)</label>
          <div class="image-row">
            <div class="image-preview">
              <img v-if="form.appIconUrl" :src="absolute(form.appIconUrl)" alt="Icono de la app" />
              <span v-else class="preview-fallback">I</span>
            </div>
            <div class="image-actions">
              <label class="btn btn-outline btn-sm file-btn">
                Subir imagen
                <input type="file" accept="image/*" hidden @change="uploadBrand('appIconUrl', $event)" />
              </label>
              <button v-if="form.appIconUrl" type="button" class="btn btn-danger btn-sm" @click="form.appIconUrl = ''">Quitar</button>
              <p v-if="brandUploading === 'appIconUrl'" class="muted">Subiendo…</p>
            </div>
          </div>
          <p class="muted color-help">PNG con transparencia, cuadrado. Recomendado 512x512 (también 192x192). Deja ~20% de margen en los bordes para el formato maskable.</p>
        </div>

        <div class="form-group">
          <label>Favicon</label>
          <div class="image-row">
            <div class="image-preview">
              <img v-if="form.faviconUrl" :src="absolute(form.faviconUrl)" alt="Favicon" />
              <span v-else class="preview-fallback">F</span>
            </div>
            <div class="image-actions">
              <label class="btn btn-outline btn-sm file-btn">
                Subir imagen
                <input type="file" accept="image/*" hidden @change="uploadBrand('faviconUrl', $event)" />
              </label>
              <button v-if="form.faviconUrl" type="button" class="btn btn-danger btn-sm" @click="form.faviconUrl = ''">Quitar</button>
              <p v-if="brandUploading === 'faviconUrl'" class="muted">Subiendo…</p>
            </div>
          </div>
          <p class="muted color-help">PNG, SVG o ICO. Recomendado 192x192 (o 16x16/32x32/48x48). Se usa en pestañas, marcadores y la home de iOS.</p>
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
import { useSettingsStore } from '../../stores/settings.js'

const form = ref(null)
const openHoursArr = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const brandUploading = ref(null)
const settingsStore = useSettingsStore()
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const absolute = (u) => (u ? (u.startsWith('/') ? API_URL + u : u) : null)

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    form.value = JSON.parse(JSON.stringify(data.settings))
    form.value.accentColor = form.value.accentColor || '#1B5E20'
    form.value.storeOpen = form.value.storeOpen !== false
    form.value.faviconUrl = form.value.faviconUrl || ''
    form.value.appIconUrl = form.value.appIconUrl || ''
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

async function uploadBrand(field, e) {
  const file = e.target.files[0]
  if (!file) return
  brandUploading.value = field
  try {
    const fd = new FormData()
    fd.append('image', file)
    const res = await fetch(`${API_URL}/api/admin/uploads/brand`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    form.value[field] = data.relative
  } catch (err) {
    alert(err.message)
  } finally {
    brandUploading.value = null
    e.target.value = ''
  }
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
    settingsStore.settings = {
      ...(settingsStore.settings || {}),
      storeName: form.value.storeName,
      accentColor: form.value.accentColor,
      storeOpen: form.value.storeOpen,
      faviconUrl: form.value.faviconUrl,
      appIconUrl: form.value.appIconUrl,
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

<style scoped>
.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--dark);
}

.admin-card h2 {
  color: var(--dark);
}

.admin-sub {
  margin-bottom: 0;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.switch-text {
  flex: 1;
}

.switch-text strong {
  color: var(--dark);
}

.switch-text p {
  font-size: 0.85rem;
  margin-top: 2px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--gray-mid);
  border-radius: 50px;
  transition: var(--transition);
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: var(--transition);
  box-shadow: var(--shadow);
}

.switch input:checked + .switch-slider {
  background: var(--green-dark);
}

.switch input:checked + .switch-slider::before {
  transform: translateX(24px);
}

.image-row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.image-preview {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--gray-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-fallback {
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--green-light);
}

.image-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.file-btn {
  position: relative;
  cursor: pointer;
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
