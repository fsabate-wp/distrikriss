<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <div v-else>
      <div class="admin-toolbar">
        <button type="button" class="btn btn-primary" @click="newZone">+ Nueva zona</button>
        <p class="muted zones-hint">Dibuja el polígono en el mapa y completa los datos de la zona.</p>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="saved-note">✓ Zona guardada</p>

      <div class="zone-layout">
        <div class="zone-list">
          <button
            v-for="z in zones"
            :key="z.id"
            class="zone-item"
            :class="{ active: selectedId === z.id }"
            @click="selectZone(z.id)"
          >
            <span class="zone-dot" :style="{ background: z.color }"></span>
            <span class="zone-name">
              {{ z.name }}
              <span v-if="!z.enabled" class="zone-disabled">inactiva</span>
            </span>
            <span class="zone-meta">{{ z.slots.length }} franjas · ${{ z.deliveryFeeBase }} + ${{ z.deliveryFeePerKm }}/km</span>
          </button>
          <p v-if="zones.length === 0" class="muted zones-empty">Aún no hay zonas. Crea la primera dibujando en el mapa.</p>
        </div>

        <div class="zone-editor" v-if="editing">
          <div ref="mapEl" class="zone-map"></div>

          <div class="admin-card zone-form">
            <div class="form-grid">
              <div class="form-group">
                <label>Nombre de la zona</label>
                <input v-model="editing.name" class="form-control" placeholder="Ej: Zona Norte" />
              </div>
              <div class="form-group">
                <label>Color</label>
                <div class="color-row">
                  <input v-model="editing.color" type="color" class="color-input" @change="applyColor" />
                  <input v-model="editing.color" class="form-control color-hex" maxlength="7" @input="applyColor" />
                </div>
              </div>
              <div class="form-group">
                <label>Costo base de envío ($)</label>
                <input v-model.number="editing.deliveryFeeBase" type="number" step="0.01" min="0" class="form-control" />
              </div>
              <div class="form-group">
                <label>Costo por km ($)</label>
                <input v-model.number="editing.deliveryFeePerKm" type="number" step="0.01" min="0" class="form-control" />
              </div>
              <div class="form-group">
                <label>Pedido mínimo ($)</label>
                <input v-model.number="editing.minOrderAmount" type="number" step="0.01" min="0" class="form-control" />
              </div>
              <div class="form-group">
                <label>Orden</label>
                <input v-model.number="editing.sortOrder" type="number" min="0" class="form-control" />
              </div>
            </div>

            <div class="form-group">
              <label class="switch-row">
                <span class="switch">
                  <input type="checkbox" v-model="editing.enabled" />
                  <span class="switch-slider"></span>
                </span>
                <span class="switch-text">
                  <strong>Zona activa</strong>
                  <p>Las zonas inactivas no se ofrecen para entrega</p>
                </span>
              </label>
            </div>
          </div>

          <div class="admin-card zone-form">
            <h2>Días de entrega</h2>
            <div class="day-checks">
              <label v-for="day in DAYS" :key="day.value" class="day-check">
                <input type="checkbox" :value="day.value" v-model="editing.deliveryDays" />
                {{ day.label }}
              </label>
            </div>
          </div>

          <div class="admin-card zone-form">
            <h2>Franjas de entrega</h2>
            <p class="muted">Franjas que verá el cliente al elegir cuándo recibir el pedido en esta zona.</p>
            <div class="slot-rows">
              <div v-for="(slot, index) in editing.slots" :key="slot.id" class="slot-row">
                <input v-model="slot.label" class="form-control" placeholder="Etiqueta" />
                <input v-model="slot.start" type="time" class="form-control time" />
                <input v-model="slot.end" type="time" class="form-control time" />
                <input v-model.number="slot.capacity" type="number" class="form-control capacity" placeholder="Capacidad" />
                <button type="button" class="btn btn-danger btn-sm" @click="removeSlot(index)">×</button>
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="addSlot">+ Agregar franja</button>
          </div>

          <div class="actions zone-actions">
            <button
              v-if="editing.id"
              type="button"
              class="btn btn-danger"
              :disabled="deleting"
              @click="deleteZone"
            >{{ deleting ? 'Eliminando…' : 'Eliminar zona' }}</button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="saving || !editing.polygon"
              @click="saveZone"
            >{{ saving ? 'Guardando…' : 'Guardar zona' }}</button>
          </div>
        </div>

        <div v-else class="zone-placeholder">
          <p>Selecciona una zona de la lista o crea una nueva para editarla.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
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

const zones = ref([])
const selectedId = ref(null)
const editing = ref(null)
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const error = ref('')
const saved = ref(false)
const settingsStore = useSettingsStore()

const mapEl = ref(null)
let map = null
let activeLayer = null

const DEFAULT_COLOR = '#4CAF50'

function emptyZone() {
  return {
    id: null,
    name: '',
    color: DEFAULT_COLOR,
    enabled: true,
    deliveryDays: [0, 1, 2, 3, 4, 5, 6],
    slots: [
      { id: 'morning', label: 'Mañana (08:00 - 12:00)', start: '08:00', end: '12:00', capacity: 20 },
      { id: 'afternoon', label: 'Tarde (13:00 - 18:00)', start: '13:00', end: '18:00', capacity: 20 },
    ],
    deliveryFeeBase: 1.5,
    deliveryFeePerKm: 0.25,
    minOrderAmount: 5,
    sortOrder: zones.value.length,
    polygon: null,
  }
}

function centerOf() {
  const loc = settingsStore.storeLocation
  return loc && loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : { lat: -2.228329, lng: -79.900772 }
}

async function loadZones() {
  try {
    const data = await api.get('/api/admin/zones')
    zones.value = data.zones
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function initMap() {
  const { lat, lng } = centerOf()
  map = L.map(mapEl.value, { scrollWheelZoom: false }).setView([lat, lng], 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map)
  L.marker([lat, lng]).addTo(map).bindTooltip('Tienda', { permanent: false })

  map.pm.addControls({
    position: 'topleft',
    drawMarker: false,
    drawCircle: false,
    drawLine: false,
    drawRectangle: false,
    drawPolygon: true,
    cutPolygon: false,
    editMode: true,
    dragMode: false,
    removalMode: true,
  })
  map.pm.setGlobalOptions({ snappable: false, allowSelfIntersection: false })

  map.on('pm:create', onDrawn)
}

function onDrawn(e) {
  if (e.shape !== 'Polygon') return
  if (!editing.value) editing.value = emptyZone()
  if (activeLayer && activeLayer !== e.layer) map.removeLayer(activeLayer)
  activeLayer = e.layer
  styleLayer()
  attachLayerEvents()
  updatePolygonFromLayer()
}

function attachLayerEvents() {
  if (!activeLayer) return
  activeLayer.on('pm:edit', updatePolygonFromLayer)
  activeLayer.on('pm:remove', () => {
    activeLayer = null
    if (editing.value) editing.value.polygon = null
  })
}

function styleLayer() {
  if (!activeLayer) return
  activeLayer.setStyle({ color: editing.value?.color || DEFAULT_COLOR, fillColor: editing.value?.color || DEFAULT_COLOR, fillOpacity: 0.15, weight: 2 })
}

function applyColor() {
  styleLayer()
}

function updatePolygonFromLayer() {
  if (!activeLayer) return
  const geo = activeLayer.toGeoJSON()
  if (editing.value) editing.value.polygon = geo.geometry
}

function setActivePolygon(polygon) {
  if (activeLayer) {
    map.removeLayer(activeLayer)
    activeLayer = null
  }
  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) return
  activeLayer = L.polygon(polygon.coordinates).addTo(map)
  styleLayer()
  attachLayerEvents()
  activeLayer.pm.enable({ snappable: false, allowSelfIntersection: false })
  map.fitBounds(activeLayer.getBounds(), { padding: [40, 40], maxZoom: 16 })
}

function selectZone(id) {
  error.value = ''
  saved.value = false
  selectedId.value = id
  const z = zones.value.find((x) => x.id === id)
  editing.value = { ...z, deliveryDays: [...z.deliveryDays], slots: z.slots.map((s) => ({ ...s })) }
  setActivePolygon(editing.value.polygon)
}

function newZone() {
  error.value = ''
  saved.value = false
  selectedId.value = null
  editing.value = emptyZone()
  setActivePolygon(null)
  map.setView(centerOf(), 14)
}

function addSlot() {
  editing.value.slots.push({ id: 'slot-' + Date.now(), label: '', start: '10:00', end: '12:00', capacity: 10 })
}

function removeSlot(index) {
  editing.value.slots.splice(index, 1)
}

function normalizePayload() {
  return {
    name: editing.value.name.trim(),
    color: editing.value.color || DEFAULT_COLOR,
    polygon: editing.value.polygon,
    enabled: editing.value.enabled,
    deliveryDays: editing.value.deliveryDays,
    slots: editing.value.slots,
    deliveryFeeBase: Number(editing.value.deliveryFeeBase) || 0,
    deliveryFeePerKm: Number(editing.value.deliveryFeePerKm) || 0,
    minOrderAmount: Number(editing.value.minOrderAmount) || 0,
    sortOrder: Number(editing.value.sortOrder) || 0,
  }
}

async function saveZone() {
  if (!editing.value.name.trim()) {
    error.value = 'Indica un nombre para la zona'
    return
  }
  if (!editing.value.polygon) {
    error.value = 'Dibuja el polígono de la zona en el mapa'
    return
  }
  error.value = ''
  saved.value = false
  saving.value = true
  try {
    const payload = normalizePayload()
    if (editing.value.id) {
      await api.put(`/api/admin/zones/${editing.value.id}`, payload)
    } else {
      await api.post('/api/admin/zones', payload)
    }
    await loadZones()
    const created = zones.value.find((z) => z.name === payload.name && (!editing.value.id || z.id === editing.value.id))
    if (created) {
      selectedId.value = created.id
      editing.value = { ...created, deliveryDays: [...created.deliveryDays], slots: created.slots.map((s) => ({ ...s })) }
    }
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteZone() {
  if (!editing.value.id) return
  if (!confirm(`¿Eliminar la zona "${editing.value.name}"?`)) return
  error.value = ''
  deleting.value = true
  try {
    await api.del(`/api/admin/zones/${editing.value.id}`)
    selectedId.value = null
    editing.value = null
    setActivePolygon(null)
    await loadZones()
  } catch (err) {
    error.value = err.message
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  await settingsStore.load()
  await loadZones()
  await nextTick()
  initMap()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.zones-hint {
  margin-bottom: 0;
}

.zone-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}

.zone-list {
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 88px;
}

.zone-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px 14px;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  background: white;
  text-align: left;
  transition: var(--transition);
}

.zone-item.active {
  border-color: var(--green-dark);
  background: rgba(76, 175, 80, 0.08);
}

.zone-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--dark);
}

.zone-disabled {
  font-size: 0.68rem;
  background: var(--gray-mid);
  color: var(--gray);
  padding: 2px 8px;
  border-radius: 50px;
}

.zone-meta {
  font-size: 0.76rem;
  color: var(--gray);
}

.zone-item {
  position: relative;
  padding-left: 26px;
}

.zone-dot {
  left: 12px;
  top: 12px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.zones-empty {
  padding: 8px;
}

.zone-map {
  height: 380px;
  border-radius: var(--radius);
  border: 1px solid var(--gray-mid);
  z-index: 0;
  margin-bottom: 20px;
}

.zone-form {
  margin-bottom: 20px;
}

.zone-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.zone-placeholder {
  background: white;
  border: 1px dashed var(--gray-mid);
  border-radius: var(--radius);
  padding: 60px 20px;
  text-align: center;
  color: var(--gray);
}

@media (max-width: 900px) {
  .zone-layout {
    grid-template-columns: 1fr;
  }

  .zone-list {
    position: static;
  }
}
</style>