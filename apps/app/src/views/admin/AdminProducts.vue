<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Productos</h1>
        <p class="muted admin-sub">{{ products.length }} producto(s)</p>
      </div>
      <div class="toolbar-right">
        <div class="search-box">
          <input v-model="search" class="form-control" placeholder="Buscar producto…" @input="onSearch" />
        </div>
        <button class="btn btn-outline btn-sm" @click="showImport = !showImport">⬆ Importar CSV</button>
        <router-link to="/admin/productos/nuevo" class="btn btn-primary btn-sm">+ Nuevo</router-link>
      </div>
    </div>

    <div v-if="showImport" class="admin-card import-card">
      <h3>Importación masiva por CSV</h3>
      <p class="muted">Formato: sku,PRODUCTOS,Unidad,Minimo,PRSENTACION,Precio. Las filas con solo nombre de categoría (Legumbres, Montes, Granos, Frutas) se usan para agrupar.</p>
      <div class="import-row">
        <input type="file" accept=".csv,.txt" @change="onFile" ref="fileInput" />
        <select v-model="importMode" class="form-control" style="max-width:160px">
          <option value="upsert">Actualizar / Crear</option>
          <option value="replace">Reemplazar todo (borra pedidos)</option>
        </select>
        <button class="btn btn-primary btn-sm" :disabled="!importFile || importing" @click="doImport">{{ importing ? 'Importando…' : 'Importar' }}</button>
        <button class="btn btn-outline btn-sm" @click="downloadTemplate">Descargar plantilla</button>
      </div>
      <p v-if="importResult" class="import-result" :class="{ error: importResult.skipped > 0 && importResult.created===0 }">Importados: {{ importResult.created }} creados, {{ importResult.updated }} actualizados, {{ importResult.skipped }} omitidos (total {{ importResult.total }})</p>
      <p v-if="importError" class="error-msg">{{ importError }}</p>
      <ul v-if="importResult?.errors?.length" class="muted" style="margin-top:8px;font-size:0.85rem">
        <li v-for="e in importResult.errors" :key="e">{{ e }}</li>
      </ul>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr>
            <th></th>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Unidad / Mín / Empaque</th>
            <th>Stock</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="products.length === 0"><td colspan="8" class="empty-cell">Sin productos</td></tr>
          <tr v-for="p in products" :key="p.id">
            <td class="thumb-cell">
              <img v-if="p.imageUrl" :src="p.imageUrl" class="thumb" />
              <span v-else class="thumb-fallback">{{ p.name[0] }}</span>
            </td>
            <td class="name-cell">
              <div>{{ p.name }}</div>
              <small v-if="p.sku" class="muted">SKU: {{ p.sku }}</small>
            </td>
            <td>{{ p.category?.name || '—' }}</td>
            <td class="price-cell">{{ money(p.price) }}</td>
            <td>
              <div>{{ p.unit }} <span class="muted">x {{ p.minQuantity ?? 1 }}</span></div>
              <small v-if="p.presentation" class="muted">{{ p.presentation }}</small>
              <small v-else class="muted">paso {{ p.stepQuantity ?? 1 }}</small>
            </td>
            <td>
              <span v-if="p.stock < 0" class="muted">∞</span>
              <span v-else :class="{ 'low-stock': p.stock <= 5 }">{{ p.stock }}</span>
            </td>
            <td>
              <div class="state-cell">
                <span class="badge" :class="p.active ? 'badge-delivered' : 'badge-cancelled'">
                  {{ p.active ? 'Activo' : 'Inactivo' }}
                </span>
                <span v-if="p.featured" class="badge badge-featured">★ Destacado</span>
              </div>
            </td>
            <td class="actions-cell">
              <router-link :to="`/admin/productos/${p.id}`" class="action-link">Editar</router-link>
              <button class="action-link danger" @click="remove(p)">Eliminar</button>
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
import { money } from '../../utils/format.js'

const products = ref([])
const loading = ref(true)
const search = ref('')
let timer = null

const showImport = ref(false)
const importFile = ref(null)
const importMode = ref('upsert')
const importing = ref(false)
const importResult = ref(null)
const importError = ref('')
const fileInput = ref(null)

async function load() {
  loading.value = true
  try {
    const data = await api.get('/api/admin/products', { search: search.value })
    products.value = data.products
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(timer)
  timer = setTimeout(load, 350)
}

async function remove(p) {
  if (!confirm(`¿Eliminar el producto "${p.name}"?`)) return
  try {
    await api.del(`/api/admin/products/${p.id}`)
    await load()
  } catch (err) {
    alert(err.message)
  }
}

function onFile(e) {
  importFile.value = e.target.files[0] || null
  importResult.value = null
  importError.value = ''
}

async function doImport() {
  if (!importFile.value) return
  if (importMode.value === 'replace' && !confirm('Modo Reemplazar borrará TODOS los pedidos y productos actuales. ¿Continuar?')) return
  importing.value = true
  importError.value = ''
  importResult.value = null
  try {
    const fd = new FormData()
    fd.append('file', importFile.value)
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/admin/products/import?mode=${importMode.value}`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error importando')
    importResult.value = data
    await load()
  } catch (err) {
    importError.value = err.message
  } finally {
    importing.value = false
  }
}

async function downloadTemplate() {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/admin/products/import/template`, { credentials: 'include' })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'plantilla-productos.csv'; a.click(); URL.revokeObjectURL(url)
  } catch { /* ignore */ }
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

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-box input {
  min-width: 240px;
  padding: 10px 14px;
}

.btn-sm {
  padding: 10px 18px;
  font-size: 0.85rem;
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

.price-cell {
  font-weight: 700;
  color: var(--green-dark);
}

.low-stock {
  color: var(--red);
  font-weight: 700;
}

.state-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.badge-featured {
  background: #ffff00;
  color: #5a4a00;
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

.import-card {
  margin: 16px 0 20px;
  padding: 18px;
}
.import-card h3 {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 6px;
}
.import-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12px;
}
.import-result {
  margin-top: 12px;
  font-weight: 600;
  color: var(--green-dark);
}
.import-result.error {
  color: var(--red);
}
</style>
