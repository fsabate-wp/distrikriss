<template>
  <div>
    <h1 class="admin-title">{{ isEdit ? 'Editar producto' : 'Nuevo producto' }}</h1>
    <p class="muted admin-sub">Los productos con estado inactivo no se muestran en la tienda</p>

    <form @submit.prevent="save" class="admin-card">
      <div class="form-grid">
        <div class="form-group">
          <label>Nombre *</label>
          <input v-model="form.name" class="form-control" required />
        </div>
        <div class="form-group">
          <label>SKU</label>
          <input v-model="form.sku" class="form-control" placeholder="Ej: 1" />
        </div>
        <div class="form-group">
          <label>Unidad *</label>
          <select v-model="form.unit" class="form-control" required>
            <option value="Kilo">Kilo</option>
            <option value="Gramos">Gramos</option>
            <option value="Unidad">Unidad</option>
            <option value="Atado">Atado</option>
            <option value="Paquete">Paquete</option>
            <option value="Pedazo">Pedazo</option>
          </select>
        </div>
        <div class="form-group">
          <label>Presentación (empaque)</label>
          <input v-model="form.presentation" class="form-control" placeholder="Ej: Funda de plástico, Malla, Caja" />
        </div>
        <div class="form-group">
          <label>Mínimo *</label>
          <input v-model.number="form.minQuantity" type="number" step="0.01" min="0.01" class="form-control" required />
          <small class="muted">Cantidad mínima que puede pedir el cliente. Ej: 1 para 1 Kilo, 400 para 400g, 4 unidades</small>
        </div>
        <div class="form-group">
          <label>Incremento</label>
          <input v-model.number="form.stepQuantity" type="number" step="0.01" min="0.01" class="form-control" />
          <small class="muted">De cuánto en cuánto aumenta (ej: 1 para Kilos, 50 para gramos)</small>
        </div>
        <div class="form-group">
          <label>Precio (USD) *</label>
          <input v-model.number="form.price" type="number" step="0.01" min="0" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Descuento (%)</label>
          <input v-model.number="form.discount" type="number" step="1" min="0" max="100" class="form-control" />
        </div>
        <div class="form-group">
          <label>IVA</label>
          <select v-model="form.ivaRate" class="form-control">
            <option :value="null">Tarifa de la tienda ({{ storeIvaLabel }})</option>
            <option :value="0">IVA 0%</option>
            <option :value="5">IVA 5%</option>
            <option :value="12">IVA 12%</option>
            <option :value="15">IVA 15%</option>
          </select>
          <small class="muted">Déjalo en "Tarifa de la tienda" salvo que este producto pague una tarifa distinta (o nada) de IVA.</small>
        </div>
        <div class="form-group">
          <label>Stock</label>
          <input v-model.number="form.stock" type="number" class="form-control" />
          <small class="muted">-1 = sin límite</small>
        </div>
        <div class="form-group">
          <label>Categoría</label>
          <select v-model="form.categoryId" class="form-control">
            <option :value="null">Sin categoría</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select v-model="form.active" class="form-control">
            <option :value="true">Activo</option>
            <option :value="false">Inactivo</option>
          </select>
        </div>
        <div class="form-group">
          <label>Destacado</label>
          <label class="toggle-row">
            <input type="checkbox" v-model="form.featured" />
            <span>Mostrar en "Destacados" del inicio</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>Descripción</label>
        <textarea v-model="form.description" class="form-control" rows="3"></textarea>
      </div>

      <div class="form-group">
        <label>Imagen</label>
        <div class="image-row">
          <div class="image-preview">
            <img v-if="form.imageUrl" :src="form.imageUrl" class="preview-img" />
            <span v-else class="preview-fallback">{{ (form.name || 'P')[0] }}</span>
          </div>
          <div class="image-actions">
            <label class="btn btn-outline btn-sm file-btn">
              Subir imagen
              <input type="file" accept="image/*" hidden @change="upload" />
            </label>
            <button v-if="form.imageUrl" type="button" class="btn btn-danger btn-sm" @click="form.imageUrl = ''">Quitar</button>
            <p v-if="uploading" class="muted">Subiendo…</p>
            <p v-if="uploadError" class="error-msg">{{ uploadError }}</p>
          </div>
        </div>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <div class="actions">
        <router-link to="/admin/productos" class="btn btn-outline">Cancelar</router-link>
        <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api/client.js'

const route = useRoute()
const router = useRouter()
const isEdit = computed(() => !!route.params.id)

const form = ref({ name: '', sku: '', unit: 'Kilo', presentation: '', minQuantity: 1, stepQuantity: 1, price: 0, discount: 0, stock: -1, categoryId: null, active: true, featured: false, description: '', imageUrl: '', ivaRate: null })
const categories = ref([])
const error = ref('')
const saving = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const storeIva = ref(15)

const storeIvaLabel = computed(() => `${storeIva.value}%`)

async function load() {
  try {
    const data = await api.get('/api/admin/categories')
    categories.value = data.categories
  } catch {
    categories.value = []
  }
  try {
    const s = await api.get('/api/admin/settings')
    storeIva.value = Number(s.settings.sriIvaRate) || 15
  } catch {
    /* usa el default */
  }
  if (!isEdit.value) return
  try {
    const data = await api.get('/api/admin/products')
    const p = data.products.find((x) => x.id === route.params.id)
    if (p) {
      form.value = {
        name: p.name,
        sku: p.sku || '',
        unit: p.unit,
        presentation: p.presentation || '',
        minQuantity: p.minQuantity != null ? Number(p.minQuantity) : 1,
        stepQuantity: p.stepQuantity != null ? Number(p.stepQuantity) : 1,
        price: Number(p.price),
        discount: Number(p.discount) || 0,
        stock: p.stock,
        categoryId: p.categoryId,
        active: p.active,
        featured: p.featured,
        description: p.description || '',
        imageUrl: p.imageUrl || '',
        ivaRate: p.ivaRate != null ? Number(p.ivaRate) : null,
      }
    }
  } catch (err) {
    error.value = err.message
  }
}

async function upload(e) {
  const file = e.target.files[0]
  if (!file) return
  uploading.value = true
  uploadError.value = ''
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
    form.value.imageUrl = data.relative
  } catch (err) {
    uploadError.value = err.message
  } finally {
    uploading.value = false
  }
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const payload = { ...form.value, imageUrl: form.value.imageUrl }
    if (isEdit.value) {
      await api.put(`/api/admin/products/${route.params.id}`, payload)
    } else {
      await api.post('/api/admin/products', payload)
    }
    router.push({ name: 'admin-products' })
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
  margin-bottom: 20px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.image-row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.image-preview {
  width: 96px;
  height: 96px;
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
  font-size: 2rem;
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

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  padding-top: 6px;
}

.toggle-row input {
  width: 18px;
  height: 18px;
  accent-color: var(--green-dark);
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
