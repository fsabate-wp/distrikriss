<template>
  <div class="page">
    <div class="container narrow">
      <h1 class="section-title">{{ isEdit ? 'Editar dirección' : 'Nueva dirección' }}</h1>
      <p class="muted form-sub">Busca tu dirección en el mapa o haz clic para ubicar el pin</p>

      <form @submit.prevent="save">
        <div class="form-group">
          <label>Ubicación en el mapa</label>
          <MapPicker v-model="form" />
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Etiqueta</label>
            <input v-model="form.label" class="form-control" placeholder="Casa / Trabajo" required />
          </div>
          <div class="form-group">
            <label>Calle</label>
            <input v-model="form.street" class="form-control" required />
          </div>
          <div class="form-group">
            <label>Número</label>
            <input v-model="form.number" class="form-control" />
          </div>
          <div class="form-group">
            <label>Ciudad</label>
            <input v-model="form.city" class="form-control" required />
          </div>
        </div>

        <div class="form-group">
          <label>Referencia</label>
          <input v-model="form.reference" class="form-control" placeholder="Frente al parque, junto a…" />
        </div>

        <div class="form-group check-row">
          <label class="check-label">
            <input v-model="form.isDefault" type="checkbox" />
            Marcar como dirección por defecto
          </label>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <div class="actions">
          <router-link to="/perfil" class="btn btn-outline">Cancelar</router-link>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Guardando…' : 'Guardar dirección' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client.js'
import MapPicker from '../components/MapPicker.vue'

const route = useRoute()
const router = useRouter()
const isEdit = computed(() => !!route.params.id)
const form = ref({ label: '', street: '', number: '', reference: '', city: 'Guayaquil', lat: null, lng: null, isDefault: false })
const error = ref('')
const saving = ref(false)

async function load() {
  if (!isEdit.value) return
  try {
    const data = await api.get('/api/addresses')
    const addr = data.addresses.find((a) => a.id === route.params.id)
    if (addr) {
      form.value = {
        label: addr.label,
        street: addr.street,
        number: addr.number || '',
        reference: addr.reference || '',
        city: addr.city,
        lat: addr.lat,
        lng: addr.lng,
        isDefault: addr.isDefault,
      }
    }
  } catch (err) {
    error.value = err.message
  }
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const payload = {
      label: form.value.label,
      street: form.value.street,
      number: form.value.number,
      reference: form.value.reference,
      city: form.value.city,
      lat: form.value.lat,
      lng: form.value.lng,
      isDefault: form.value.isDefault,
    }
    if (isEdit.value) {
      await api.put(`/api/addresses/${route.params.id}`, payload)
    } else {
      await api.post('/api/addresses', payload)
    }
    router.push({ name: 'profile' })
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.narrow {
  max-width: 640px;
}

.form-sub {
  margin-bottom: 24px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 16px;
}

.check-row {
  margin-top: 4px;
}

.check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--green-dark);
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

@media (max-width: 480px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
