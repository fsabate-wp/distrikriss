<template>
  <!-- Aviso de cobertura. Aparece cuando el cliente todavía no ha elegido
       dirección, para que sepa si le reaches antes de armar el pedido. -->
  <div class="coverage" :class="estado">
    <div class="coverage-head">
      <span class="coverage-icon" aria-hidden="true">{{ icono }}</span>
      <div class="coverage-text">
        <strong>{{ titulo }}</strong>
        <p v-if="detalle">{{ detalle }}</p>
      </div>
    </div>

    <div v-if="!resuelto" class="coverage-actions">
      <button v-if="!puedeGeo" class="btn btn-primary btn-sm" :disabled="buscando" @click="buscar">
        {{ buscando ? 'Buscando…' : 'Usar mi ubicación' }}
      </button>
      <p v-if="!puedeGeo" class="coverage-note">
        Tu navegador no permite compartir la ubicación. Escribe tu dirección en el buscador de abajo.
      </p>
      <button v-else class="btn btn-primary btn-sm" :disabled="buscando" @click="usarGeo">
        {{ buscando ? 'Comprobando…' : 'Comprobar si llegamos a tu casa' }}
      </button>
    </div>

    <button v-if="resuelto" class="coverage-reset" @click="reiniciar">Comprobar otra dirección</button>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { api } from '../api/client.js'

const props = defineProps({
  /** true cuando ya hay una dirección elegida y esta comprobada. */
  yaResuelto: { type: Boolean, default: false },
})
const emit = defineEmits(['resultado'])

const resultado = ref(null)
const error = ref('')
const buscando = ref(false)
const puedeGeo = ref(true)

const dentro = computed(() => resultado.value?.withinZone === true)
const resuelto = computed(() => props.yaResuelto || resultado.value !== null)
const errorRed = computed(() => Boolean(error.value))

const icono = computed(() => {
  if (errorRed.value) return '!'
  if (buscando.value) return '…'
  if (!resuelto.value) return '📍'
  return dentro.value ? '✓' : '✕'
})

const estado = computed(() => {
  if (errorRed.value) return 'coverage-error'
  if (buscando.value) return 'coverage-loading'
  if (!resuelto.value) return 'coverage-idle'
  return dentro.value ? 'coverage-in' : 'coverage-out'
})

const titulo = computed(() => {
  if (errorRed.value) return 'No pudimos comprobar la cobertura'
  if (buscando.value) return 'Comprobando si te llegamos…'
  if (!resuelto.value) return '¿Llegamos a tu casa?'
  if (dentro.value) {
    const zona = resultado.value.zoneName
    return zona ? `Sí, te llegamos · ${zona}` : 'Sí, te llegamos'
  }
  return 'Llegamos un poco más allá'
})

const detalle = computed(() => {
  if (errorRed.value) return error.value
  if (buscando.value) return 'Buscando tu ubicación…'
  if (!resuelto.value) {
    return 'Compruébalo en un paso: no hace falta que guardes tu dirección.'
  }
  const r = resultado.value
  if (dentro.value) {
    const partes = [`A ${r.distanceKm} km de la tienda`]
    if (r.deliveryFee != null) partes.push(`envío ${money(r.deliveryFee)}`)
    if (r.minOrderAmount > 0) partes.push(`pedido mínimo ${money(r.minOrderAmount)}`)
    return partes.join(' · ')
  }
  const partes = [`Estás a ${r.distanceKm} km de la tienda`]
  if (r.nearestZoneKm != null && r.nearestZoneKm < 5) {
    partes.push(
      r.nearestZoneKm < 0.05
        ? `justo al borde de ${r.nearestZoneName}`
        : `a ${roundKm(r.nearestZoneKm)} km de ${r.nearestZoneName}`,
    )
  }
  return partes.join(' · ') + '. Por ahora no cubrimos esa dirección.'
})

function money(v) {
  return `$${Number(v || 0).toFixed(2)}`
}

function roundKm(km) {
  return Number(km).toFixed(1)
}

function comprobar(lat, lng) {
  buscando.value = true
  error.value = ''
  api
    .post('/api/delivery/check', { lat, lng })
    .then((data) => {
      resultado.value = data
      emit('resultado', data)
    })
    .catch((err) => {
      resultado.value = null
      error.value =
        err.status === 429
          ? 'Demasiadas consultas seguidas. Espera un momento e inténtalo otra vez.'
          : 'No pudimos consultar la cobertura. Inténtalo de nuevo en un momento.'
    })
    .finally(() => {
      buscando.value = false
    })
}

function usarGeo() {
  if (!navigator.geolocation) {
    puedeGeo.value = false
    return
  }
  buscando.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      comprobar(pos.coords.latitude, pos.coords.longitude)
    },
    () => {
      buscando.value = false
      error.value = 'No pudimos obtener tu ubicación. Actívala en el navegador o escribe tu dirección.'
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  )
}

/** Escribe una dirección y la comprueba por texto. */
async function buscar() {
  const texto = window.prompt('Escribe tu dirección (calle, número y sector)')
  if (!texto || !texto.trim()) return
  buscando.value = true
  error.value = ''
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('countrycodes', 'ec')
    url.searchParams.set('limit', '1')
    url.searchParams.set('accept-language', 'es')
    url.searchParams.set('q', texto.trim())
    const res = await fetch(url)
    const datos = await res.json()
    if (!datos.length) {
      error.value = 'No encontramos esa dirección. Prueba con el sector o el barrio.'
      buscando.value = false
      return
    }
    comprobar(Number(datos[0].lat), Number(datos[0].lon))
  } catch {
    buscando.value = false
    error.value = 'No pudimos buscar esa dirección. Inténtalo otra vez.'
  }
}

function reiniciar() {
  resultado.value = null
  error.value = ''
  emit('resultado', null)
}

onBeforeUnmount(() => {
  resultado.value = null
})

defineExpose({ usarGeo, comprobar })
</script>

<style scoped>
.coverage {
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin-bottom: 14px;
  border: 1.5px solid var(--gray-mid);
  background: var(--gray-light);
  transition: var(--transition);
}

.coverage-idle {
  background: linear-gradient(135deg, #e8f5e9, #f1f8e9);
  border-color: var(--green-light);
}

.coverage-in {
  background: #e8f5e9;
  border-color: var(--green-mid);
}

.coverage-out {
  background: #fff8e1;
  border-color: #ffe082;
}

.coverage-error {
  background: #fbe9e7;
  border-color: #ef9a9a;
}

.coverage-loading {
  background: var(--gray-light);
}

.coverage-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.coverage-icon {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 0.9rem;
  background: white;
  color: var(--green-dark);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.1));
}

.coverage-out .coverage-icon {
  color: #e65100;
}

.coverage-error .coverage-icon {
  color: var(--red);
}

.coverage-text strong {
  display: block;
  color: var(--dark);
  font-size: 0.92rem;
}

.coverage-text p {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--gray-dark, #555);
  line-height: 1.45;
}

.coverage-actions {
  margin-top: 10px;
}

.coverage-note {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: var(--gray);
}

.coverage-reset {
  margin-top: 8px;
  background: none;
  border: none;
  padding: 0;
  color: var(--green-dark);
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
</style>