<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Categorías</h1>
        <p class="muted admin-sub">Agrupa tus productos para el catálogo</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="startNew">+ Nueva categoría</button>
    </div>

    <div v-if="editing" class="admin-card">
      <h2>{{ editing.id ? 'Editar categoría' : 'Nueva categoría' }}</h2>
      <form @submit.prevent="save" class="cat-form">
        <div class="form-group">
          <label>Nombre *</label>
          <input v-model="editing.name" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Imagen</label>
          <div class="image-row">
            <div class="image-preview">
              <img v-if="editing.imageUrl" :src="editing.imageUrl" class="preview-img" />
              <span v-else class="preview-fallback">{{ (editing.name || 'C')[0] }}</span>
            </div>
            <label class="btn btn-outline btn-sm file-btn">
              Subir imagen
              <input type="file" accept="image/*" hidden @change="upload" />
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Orden de aparición</label>
          <input v-model.number="editing.sortOrder" type="number" class="form-control" />
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select v-model="editing.active" class="form-control">
            <option :value="true">Activa</option>
            <option :value="false">Inactiva</option>
          </select>
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <div class="actions">
          <button type="button" class="btn btn-outline" @click="editing = null">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr><th></th><th>Categoría</th><th>Productos</th><th>Orden</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-if="categories.length === 0"><td colspan="6" class="empty-cell">Sin categorías</td></tr>
          <tr v-for="c in categories" :key="c.id">
            <td class="thumb-cell">
              <img v-if="c.imageUrl" :src="c.imageUrl" class="thumb" />
              <span v-else class="thumb-fallback">{{ c.name[0] }}</span>
            </td>
            <td class="name-cell">{{ c.name }}</td>
            <td>{{ c._count.products }}</td>
            <td>{{ c.sortOrder }}</td>
            <td>
              <span class="badge" :class="c.active ? 'badge-delivered' : 'badge-cancelled'">
                {{ c.active ? 'Activa' : 'Inactiva' }}
              </span>
            </td>
            <td class="actions-cell">
              <button class="action-link" @click="startEdit(c)">Editar</button>
              <button class="action-link danger" @click="remove(c)">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'

const categories = ref([])
const loading = ref(true)
const editing = ref(null)
const error = ref('')
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await api.get('/api/admin/categories')
    categories.value = data.categories
  } finally {
    loading.value = false
  }
}

function startNew() {
  error.value = ''
  editing.value = { id: null, name: '', imageUrl: '', sortOrder: categories.value.length + 1, active: true }
}

function startEdit(c) {
  error.value = ''
  editing.value = { id: c.id, name: c.name, imageUrl: c.imageUrl || '', sortOrder: c.sortOrder, active: c.active }
}

async function upload(e) {
  const file = e.target.files[0]
  if (!file || !editing.value) return
  try {
    const fd = new FormData()
    fd.append('image', file)
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/admin/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    editing.value.imageUrl = data.relative
  } catch (err) {
    error.value = err.message
  }
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const payload = { name: editing.value.name, imageUrl: editing.value.imageUrl, sortOrder: editing.value.sortOrder, active: editing.value.active }
    if (editing.value.id) {
      await api.put(`/api/admin/categories/${editing.value.id}`, payload)
    } else {
      await api.post('/api/admin/categories', payload)
    }
    editing.value = null
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function remove(c) {
  if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return
  try {
    await api.del(`/api/admin/categories/${c.id}`)
    await load()
  } catch (err) {
    alert(err.message)
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

.cat-form {
  max-width: 420px;
}

.image-row {
  display: flex;
  gap: 14px;
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

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-fallback {
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--green-light);
}

.file-btn {
  position: relative;
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.thumb-cell {
  width: 48px;
}

.thumb {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border-radius: 8px;
}

.thumb-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--green-light);
  color: white;
  font-weight: 800;
}

.name-cell {
  font-weight: 600;
}

.actions-cell {
  white-space: nowrap;
  text-align: right;
}

.action-link {
  background: none;
  border: none;
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.85rem;
  margin-left: 10px;
}

.action-link.danger {
  color: var(--red);
}

.empty-cell {
  text-align: center;
  color: var(--gray);
  padding: 30px;
}
</style>
