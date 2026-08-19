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
      <span>Haz clic en el mapa o busca tu dirección para ubicar el pin</span>
    </div>
    <p v-if="point && point.withinZone === false" class="out-range">⚠ Esta ubicación está fuera de la zona de entrega</p>
    <p v-else-if="point && point.withinZone" class="in-range">✓ Dentro de la zona de entrega · {{ point.zoneName }} ({{ point.distanceKm }} km)</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import { useSettingsStore } from '../stores/settings.js'

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

let map = null
let storeMarker = null
let zoneLayers = null
let clientMarker = null
let searchTimer = null
let geocodeTimer = null

const NOMINATIM = 'https://nominatim.openstreetmap.org'

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function storeCoords() {
  return {
    lat: settings.storeLocation?.lat || -2.228329,
    lng: settings.storeLocation?.lng || -79.900772,
  }
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
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/delivery/check?lat=${lat}&lng=${lng}`,
    )
    const data = await res.json()
    point.value = {
      ...point.value,
      withinZone: data.withinZone,
      zoneId: data.zoneId,
      zoneName: data.zoneName,
      distanceKm: data.distanceKm,
      deliveryFee: data.deliveryFee,
    }
    emitUpdate()
  } catch {
    // noop
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=es`,
    )
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
    // noop
  }
}

function emitUpdate() {
  if (!point.value) return
  emit('update:modelValue', { ...point.value })
}

async function search() {
  const q = query.value.trim()
  if (!q || q.length < 3) return
  searching.value = true
  const { lat, lng } = storeCoords()
  try {
    const res = await fetch(
      `${NOMINATIM}/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ec&limit=6&viewbox=${lng - 0.25},${lat - 0.15},${lng + 0.25},${lat + 0.15}&bounded=1&accept-language=es`,
    )
    results.value = await res.json()
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

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
}
</style>

<style>
.map-pin {
  background: transparent;
  border: none;
}
</style>
