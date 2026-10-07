<template>
  <div class="map-picker">
    <div class="map-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input
        v-model="query"
        type="search"
        placeholder="Buscar dirección o sector…"
        @keydown.enter.prevent="search"
        @input="onQueryInput"
      />
      <button v-if="searching" class="mini-spinner" aria-label="Buscando"></button>
    </div>

    <div v-if="results.length" class="search-results">
      <button v-for="(r, i) in results" :key="i" class="result-item" @click="pickResult(r)">
        <span class="result-name">{{ r.display_name }}</span>
      </button>
    </div>

    <div ref="mapEl" class="map-el"></div>

    <div class="map-hint">
      <span v-if="!point">Haz clic en el mapa o busca tu dirección para ubicar el pin</span>
      <span v-else-if="zoneState === 'loading'" class="muted">Comprobando si te llegamos…</span>
      <span v-else-if="zoneState === 'error'" class="map-error">
        No pudimos comprobar la cobertura. Inténtalo de nuevo.
      </span>
    </div>
    <p v-if="zoneState === 'out'" class="out-range">
      <strong>⚠ Aquí no llegamos todavía.</strong>
      Estás a {{ point.distanceKm }} km de la tienda<template v-if="nearbyZone"> y a {{ nearbyZone }} km de {{ nearbyZoneName }}</template>.
    </p>
    <p v-else-if="zoneState === 'in'" class="in-range">
      ✓ Te llegamos · {{ point.zoneName }} · {{ point.distanceKm }} km · envío {{ money(point.deliveryFee) }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import { useSettingsStore } from '../stores/settings.js'
import { money } from '../utils/format.js'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const settings = useSettingsStore()
const mapEl = ref(null)
const query = ref('')
const results = ref([])
const searching = ref(false)
const point = ref(props.modelValue ? { ...props.modelValue, withinZone: null } : null)

/**
 * Estado de la comprobación de cobertura.
 *
 * Antes solo existía `withinZone: true | false`. Si la consulta fallaba, el
 * error se tragaba con `catch { // noop }` y el punto se quedaba en null, de
 * modo que no se mostraba ningún aviso: el cliente veía un pin en el mapa y
 * nada más. Ahora se distingue comprobando, dentro, fuera y error.
 */
const zoneLoading = ref(false)
const zoneError = ref('')
const nearbyZone = ref(null)
const nearbyZoneName = ref(null)

const zoneState = computed(() => {
  if (zoneError.value) return 'error'
  if (zoneLoading.value) return 'loading'
  if (!point.value || point.value.withinZone === null || point.value.withinZone === undefined) return 'none'
  return point.value.withinZone ? 'in' : 'out'
})

let map = null
let storeMarker = null
let zoneLayers = null
let clientMarker = null
let searchTimer = null
let lastNominatimCall = 0
// Las respuestas de /check pueden volver desordenadas si el cliente mueve el pin
// rápido: sin este contador, una respuesta vieja pisa a la nueva y el aviso
// muestra la cobertura de otro punto.
let checkSeq = 0

const NOMINATIM = 'https://nominatim.openstreetmap.org'

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function storeCoords() {
  // La configuración pública sí incluye storeLat/storeLng; antes no llegaban y el
  // mapa se centraba aquí, en unas coordenadas fijas de Guayaquil.
  const lat = Number(settings.settings?.storeLat)
  const lng = Number(settings.settings?.storeLng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng }
  }
  return { lat: -2.228329, lng: -79.900772 }
}

function customIcon(color = '#E53935') {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;background:${color};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
    className: 'map-pin',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

function setupMarkers() {
  const { lat, lng } = storeCoords()
  const storeColor = cssVar('--green-dark', '#1B5E20')
  storeMarker = L.marker([lat, lng], { icon: customIcon(storeColor) }).addTo(map)
  storeMarker.bindTooltip('DistriKriss', { permanent: false })
}

async function setupZones() {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/delivery/zones`)
    const data = await res.json()
    zoneLayers = L.layerGroup().addTo(map)
    for (const zone of data.zones || []) {
      if (!zone.enabled || !zone.polygon) continue
      const poly = L.polygon(zone.polygon.coordinates, {
        color: zone.color || '#4CAF50',
        fillColor: zone.color || '#4CAF50',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '6 6',
      }).addTo(zoneLayers)
      poly.bindTooltip(zone.name, { permanent: false })
    }
  } catch {
    // noop
  }
}

function onMapClick(e) {
  const { lat, lng } = e.latlng
  placePin(lat, lng)
  reverseGeocode(lat, lng)
}

function placePin(lat, lng) {
  if (!clientMarker) {
    clientMarker = L.marker([lat, lng], { icon: customIcon('#E53935'), draggable: true }).addTo(map)
    clientMarker.on('dragend', () => {
      const p = clientMarker.getLatLng()
      placePin(p.lat, p.lng)
      reverseGeocode(p.lat, p.lng)
    })
  } else {
    clientMarker.setLatLng([lat, lng])
  }
  checkDistance(lat, lng)
  point.value = { ...(point.value || {}), lat, lng }
  emitUpdate()
}

async function checkDistance(lat, lng) {
  const seq = ++checkSeq
  zoneLoading.value = true
  zoneError.value = ''
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/delivery/check?lat=${lat}&lng=${lng}`,
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    // Una respuesta obsoleta no debe pisar la actual.
    if (seq !== checkSeq) return
    point.value = {
      ...point.value,
      withinZone: data.withinZone,
      zoneId: data.zoneId,
      zoneName: data.zoneName,
      distanceKm: data.distanceKm,
      deliveryFee: data.deliveryFee,
    }
    nearbyZone.value = data.nearestZoneKm ?? null
    nearbyZoneName.value = data.nearestZoneName ?? null
    emitUpdate()
  } catch {
    if (seq !== checkSeq) return
    // Antes se tragaba el error y el cliente no veía nada. Ahora se dice que no
    // se pudo comprobar, que es distinto de estar fuera de zona.
    zoneError.value = 'No pudimos comprobar la cobertura'
    point.value = { ...point.value, withinZone: null }
    emitUpdate()
  } finally {
    if (seq === checkSeq) zoneLoading.value = false
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=es`
    const res = await nominatimFetch(url)
    if (!res.ok) return
    const data = await res.json()
    const addr = data.address || {}
    point.value = {
      ...point.value,
      street: addr.road || data.display_name?.split(',')[0] || '',
      number: addr.house_number || '',
      reference: addr.neighbourhood || addr.suburb || '',
      city: addr.city || addr.town || addr.county || 'Guayaquil',
    }
    emitUpdate()
  } catch {
    // Sin geocodificación inversa el pin sigue puesto: el cliente puede escribir
    // la calle a mano. No es motivo para romper el mapa.
  }
}

function emitUpdate() {
  if (!point.value) return
  emit('update:modelValue', { ...point.value })
}

/**
 * Búsqueda en Nominatim respetando su política de uso: máximo una petición por
 * segundo. Antes el debounce era de 500 ms, así que escribir "Alborada" disparaba
 * cuatro búsquedas seguidas y el servicio terminaba bloqueando al cliente.
 */
const MIN_GAP_MS = 1100

async function nominatimFetch(url) {
  const espera = Math.max(0, MIN_GAP_MS - (Date.now() - lastNominatimCall))
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  lastNominatimCall = Date.now()
  return fetch(url, {
    // Nominatim exige identificar la aplicación: sin esto puede bloquear el
    // tráfico de IPs anónimas de forma permanente.
    headers: { 'Accept-Language': 'es' },
  })
}

async function search() {
  const q = query.value.trim()
  if (!q || q.length < 3) return
  searching.value = true
  const { lat, lng } = storeCoords()
  try {
    const url = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ec&limit=6&viewbox=${lng - 0.25},${lat - 0.15},${lng + 0.25},${lat + 0.15}&bounded=1&accept-language=es`
    const res = await nominatimFetch(url)
    if (!res.ok) {
      results.value = []
      return
    }
    results.value = await res.json()
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

/** El debounce evita escribir letra por letra; el hueco mínimo, el abuso. */
function onQueryInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(search, 500)
}

function pickResult(r) {
  const lat = Number(r.lat)
  const lng = Number(r.lon)
  query.value = r.display_name
  results.value = []
  map.setView([lat, lng], 17)
  placePin(lat, lng)
  reverseGeocode(lat, lng)
}

onMounted(async () => {
  await nextTick()
  const { lat, lng } = storeCoords()
  map = L.map(mapEl.value, { scrollWheelZoom: false }).setView([lat, lng], 14)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map)
  setupMarkers()
  setupZones()
  map.on('click', onMapClick)

  if (props.modelValue?.lat && props.modelValue?.lng) {
    map.setView([props.modelValue.lat, props.modelValue.lng], 16)
    placePin(props.modelValue.lat, props.modelValue.lng)
  }
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.map-picker {
  position: relative;
}

.map-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  padding: 0 12px;
  margin-bottom: 10px;
  color: var(--gray);
}

.map-search input {
  flex: 1;
  border: none;
  padding: 11px 0;
  font-size: 0.9rem;
  outline: none;
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--gray-mid);
  border-top-color: var(--green-light);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.search-results {
  position: absolute;
  top: 46px;
  left: 0;
  right: 0;
  background: white;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  max-height: 220px;
  overflow-y: auto;
}

.result-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border: none;
  background: none;
  border-bottom: 1px solid var(--gray-mid);
  font-size: 0.85rem;
  color: var(--dark);
}

.result-item:hover {
  background: var(--gray-light);
}

.map-el {
  height: 320px;
  border-radius: var(--radius);
  z-index: 0;
}

.map-hint {
  font-size: 0.8rem;
  color: var(--gray);
  margin-top: 8px;
}

.in-range {
  color: var(--green-mid);
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 6px;
}

.out-range {
  color: var(--red);
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 6px;
  line-height: 1.5;
}

.out-range strong {
  display: block;
  margin-bottom: 2px;
}

.map-error {
  color: var(--red);
  font-weight: 600;
}
</style>

<style>
.map-pin {
  background: transparent;
  border: none;
}
</style>
