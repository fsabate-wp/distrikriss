<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Colores</h2>
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
          <label>Color secundario</label>
          <div class="color-row">
            <input type="color" v-model="form.secondaryColor" class="color-input" />
            <input v-model="form.secondaryColor" class="form-control color-hex" maxlength="7" />
            <button type="button" class="btn btn-outline btn-sm" @click="form.secondaryColor = '#1B5E20'">Restablecer</button>
          </div>
          <p class="muted color-help">Color de acento para elementos específicos, como el botón de agregar al carrito.</p>
        </div>
      </div>

      <div class="admin-card">
        <h2>Iconos y marca</h2>
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
          <p class="muted color-help">PNG con transparencia, cuadrado. Recomendado 512x512 (también 192x192). Deja ~20% de margen para el formato maskable.</p>
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
          <p class="muted color-help">PNG, SVG o ICO. Recomendado 192x192 (o 16x16/32x32/48x48).</p>
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
import { applyAccentColor, applySecondaryColor } from '../../lib/accent.js'
import { useSettingsStore } from '../../stores/settings.js'

const form = ref(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const brandUploading = ref(null)
const settingsStore = useSettingsStore()

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const absolute = (u) => (u ? (u.startsWith('/') ? API_URL + u : u) : null)

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    form.value = {
      accentColor: data.settings.accentColor || '#1B5E20',
      secondaryColor: data.settings.secondaryColor || '#1B5E20',
      appIconUrl: data.settings.appIconUrl || '',
      faviconUrl: data.settings.faviconUrl || '',
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
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
    await api.put('/api/admin/settings', { ...form.value })
    applyAccentColor(form.value.accentColor)
    applySecondaryColor(form.value.secondaryColor)
    settingsStore.settings = {
      ...(settingsStore.settings || {}),
      accentColor: form.value.accentColor,
      secondaryColor: form.value.secondaryColor,
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
